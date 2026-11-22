import type { OfflineVisit } from './offline-visit';
import { getToday } from './dates';

// Este almacén no usa PIN: la protección depende del bloqueo del dispositivo.
// Cada registro pertenece al usuario autenticado. Nunca se cachean respuestas API.
const NAME = 'jym-auto-visits-v1';
const STORE = 'visits';
export type LocalVisit = OfflineVisit & { ownerId: string; conflict?: string };

function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function transaction<T>(mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await database();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        let result: IDBRequest<T>;
        try { result = action(tx.objectStore(STORE)); } catch (error) { db.close(); reject(error); return; }
        tx.oncomplete = () => { db.close(); resolve(result.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    });
}

const key = (userId: string, id: string) => `${userId}:${id}`;
export async function getLocal(userId: string, id: string): Promise<LocalVisit | undefined> {
    const row = await transaction<{ key: string; visit: LocalVisit } | undefined>(
        'readonly', (store) => store.get(key(userId, id)));
    return row?.visit;
}

export async function listLocal(userId: string): Promise<LocalVisit[]> {
    const rows = await transaction<Array<{ key: string; visit: LocalVisit }>>(
        'readonly', (store) => store.getAll());
    return rows.filter((row) => row.visit.ownerId === userId).map((row) => row.visit);
}

export async function putLocal(visit: LocalVisit): Promise<void> {
    await transaction('readwrite', (store) =>
        store.put({ key: key(visit.ownerId, visit.id), visit }));
    window.dispatchEvent(new CustomEvent('jym-visits-changed'));
}

export async function deleteLocal(userId: string, id: string): Promise<void> {
    await transaction('readwrite', (store) => store.delete(key(userId, id)));
    window.dispatchEvent(new CustomEvent('jym-visits-changed'));
}

export async function clearAutomaticVisits(): Promise<void> {
    const db = await database();
    db.close();
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Cierra otras ventanas del panel antes de salir.'));
    });
}

export function syncBody(visit: LocalVisit) {
    return {
        syncId: visit.syncId, visitId: visit.id, expectedUpdatedAt: visit.expectedUpdatedAt,
        startedAt: visit.startedAt, pumpStartedAt: visit.pumpStartedAt,
        pumpStoppedAt: visit.pumpStoppedAt, completedAt: visit.completedAt,
        work: visit.work, existingProducts: visit.products, products: visit.addedProducts,
        removedProducts: visit.removedProducts ?? [],
    };
}

// Un solo escritor por usuario/visita, también entre pestañas compatibles.
const localLocks = new Map<string, Promise<unknown>>();
export async function withVisitLock<T>(userId: string, id: string, action: () => Promise<T>): Promise<T> {
    const name = `jym-visit-${userId}-${id}`;
    if (navigator.locks) return navigator.locks.request(name, action);
    const previous = localLocks.get(name) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    localLocks.set(name, current);
    try { return await current; } finally {
        if (localLocks.get(name) === current) localLocks.delete(name);
    }
}

export async function syncVisit(userId: string, id: string): Promise<void> {
    await withVisitLock(userId, id, async () => {
        const visit = await getLocal(userId, id);
        if (!visit?.pending || visit.conflict) return;
        let response: Response;
        try {
            response = await fetch('/api/panel/offline/sync', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(syncBody(visit)),
                signal: AbortSignal.timeout(12_000),
            });
        } catch { return; }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 409 || (response.status >= 400 && response.status < 500 && response.status !== 401)) {
                await putLocal({ ...visit, conflict: data.error ?? 'Revisa la visita local antes de continuar.' });
            }
            return;
        }
        if (typeof data.updatedAt !== 'string') return;
        if (visit.completedAt) {
            // Conservamos un marcador confirmado para que una actualización de agenda
            // iniciada antes del cierre no vuelva a introducir la visita como pendiente.
            await putLocal({ ...visit, expectedUpdatedAt: data.updatedAt, pending: false });
        } else {
            await putLocal({
                ...visit, expectedUpdatedAt: data.updatedAt,
                products: visit.products.filter((_, index) => !(visit.removedProducts ?? []).includes(index))
                    .concat(visit.addedProducts),
                addedProducts: [], removedProducts: [], pending: false, syncId: crypto.randomUUID(),
            });
        }
    });
}

export async function syncAll(userId: string): Promise<void> {
    if (!navigator.onLine) return;
    for (const visit of await listLocal(userId)) {
        if (visit.pending && !visit.conflict) await syncVisit(userId, visit.id);
    }
}

export function isObsoleteLocalVisit(visit: LocalVisit, date: string, currentIds: ReadonlySet<string>): boolean {
    return visit.date === date && !currentIds.has(visit.id) &&
        !visit.pending && !visit.conflict && !visit.completedAt;
}

export function todayVisitIds(visits: LocalVisit[], date: string, verifiedIds: string[] | null): string[] {
    return verifiedIds ?? visits.filter((visit) => visit.date === date && !visit.completedAt)
        .map((visit) => visit.id);
}

export async function refreshToday(userId: string): Promise<string[]> {
    const response = await fetch('/api/panel/offline/prepare', {
        cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`El servidor respondió ${response.status}. Las visitas locales siguen guardadas.`);
    const data = await response.json() as { userId: string; visits: OfflineVisit[] };
    if (data.userId !== userId || !Array.isArray(data.visits)) throw new Error('Sesión inesperada.');
    const date = getToday();
    const currentIds = new Set(data.visits.map((visit) => visit.id));
    for (const previous of await listLocal(userId)) {
        if (previous.date !== date && !(previous.completedAt && !previous.pending && !previous.conflict &&
            previous.date < date)) continue;
        await withVisitLock(userId, previous.id, async () => {
            const current = await getLocal(userId, previous.id);
            if (current && (
                (current.completedAt && !current.pending && !current.conflict && current.date < date) ||
                isObsoleteLocalVisit(current, date, currentIds)
            )) await deleteLocal(userId, previous.id);
        });
    }
    for (const visit of data.visits) {
        await withVisitLock(userId, visit.id, async () => {
            const current = await getLocal(userId, visit.id);
            if (!current?.pending && !current?.conflict && !current?.completedAt &&
                (current?.expectedUpdatedAt !== visit.expectedUpdatedAt ||
                    current?.propertyName !== visit.propertyName ||
                    current?.address !== visit.address ||
                    current?.gateCode !== visit.gateCode ||
                    current?.accessNotes !== visit.accessNotes ||
                    current?.pumpNotes !== visit.pumpNotes)) {
                await putLocal({ ...visit, ownerId: userId });
            }
        });
    }
    return [...currentIds];
}
