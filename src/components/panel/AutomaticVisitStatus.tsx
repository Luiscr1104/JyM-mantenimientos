import * as React from 'react';
import { listLocal, refreshToday, syncAll, todayVisitIds } from '@/lib/automatic-visits';
import { listEncrypted } from '@/lib/offline-storage';
import { getToday } from '@/lib/dates';

const REFRESH_INTERVAL = 5 * 60_000;
const PREFETCH_INTERVAL = 60 * 60_000;
const MAX_FAILURE_DELAY = 15 * 60_000;
type OfflineStatus = { available: string[]; pages: boolean; ready: boolean };

function workerMessage(worker: ServiceWorker, data: unknown, timeout: number): Promise<OfflineStatus | { ok: boolean }> {
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = window.setTimeout(() => {
            channel.port1.close();
            reject(new Error('La preparación offline tardó demasiado. Se reintentará con conexión.'));
        }, timeout);
        channel.port1.onmessage = (event) => {
            window.clearTimeout(timer);
            channel.port1.close();
            resolve(event.data);
        };
        try {
            worker.postMessage(data, [channel.port2]);
        } catch (reason) {
            window.clearTimeout(timer);
            channel.port1.close();
            reject(reason);
        }
    });
}

function activeWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
    if (registration.active) return Promise.resolve(registration.active);
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() =>
            reject(new Error('No se pudo activar el modo sin conexión. Reabre el panel con internet.')), 15_000);
        navigator.serviceWorker.ready.then((ready) => {
            window.clearTimeout(timer);
            if (ready.active) resolve(ready.active);
            else reject(new Error('No se pudo activar el modo sin conexión.'));
        }, (reason) => {
            window.clearTimeout(timer);
            reject(reason);
        });
    });
}

export default function AutomaticVisitStatus({ userId }: { userId: string }) {
    const [pending, setPending] = React.useState(0);
    const [conflicts, setConflicts] = React.useState(0);
    const [conflictId, setConflictId] = React.useState('');
    const [ready, setReady] = React.useState(false);
    const [available, setAvailable] = React.useState(0);
    const [total, setTotal] = React.useState<number | null>(null);
    const [verified, setVerified] = React.useState(false);
    const [pages, setPages] = React.useState(false);
    const [preparing, setPreparing] = React.useState(false);
    const [error, setError] = React.useState('');
    const [legacy, setLegacy] = React.useState(false);
    React.useEffect(() => {
        let active = true;
        let running = false;
        let lastAttempt = 0;
        let lastRefresh = 0;
        let verifiedDate = '';
        let verifiedIds: string[] | null = null;
        let lastPrefetch = 0;
        let failures = 0;
        let updateTimer: number | undefined;
        const prefetchKey = `jym-auto-prefetch-${userId}`;
        async function update() {
            let visits: Awaited<ReturnType<typeof listLocal>>;
            try {
                visits = await listLocal(userId);
                setLegacy((await listEncrypted()).some((entry) => entry.pending && entry.userId === userId));
            } catch {
                if (active) setError('El almacenamiento del teléfono no está disponible.');
                return;
            }
            if (!active) return;
            setPending(visits.filter((visit) => visit.pending).length);
            setConflicts(visits.filter((visit) => visit.conflict).length);
            setConflictId(visits.find((visit) => visit.conflict)?.id ?? '');
            const date = getToday();
            const ids = todayVisitIds(visits, date, verifiedDate === date ? verifiedIds : null);
            setTotal(ids.length);
            setVerified(verifiedDate === date);
            try {
                const registration = await navigator.serviceWorker?.getRegistration('/panel');
                if (registration?.active) {
                    const status = await workerMessage(registration.active, {
                        type: 'offline-status', date, ids,
                    }, 4_000) as OfflineStatus;
                    if (active) {
                        setAvailable(status.available.length);
                        setPages(status.pages);
                        setReady(status.ready);
                    }
                } else if (active) {
                    setAvailable(0);
                    setPages(false);
                    setReady(false);
                }
            } catch {
                if (active) {
                    setAvailable(0);
                    setPages(false);
                    setReady(false);
                    if (ids.length > 0) setError('No se pudieron comprobar las páginas guardadas en este dispositivo.');
                }
            }
        }
        async function connected(force = false) {
            const retryDelay = failures
                ? Math.min(60_000 * 2 ** Math.min(failures - 1, 4), MAX_FAILURE_DELAY)
                : 60_000;
            if (!userId || !navigator.onLine || document.hidden || running ||
                (!force && Date.now() - lastAttempt < retryDelay)) return;
            running = true;
            if (active) setPreparing(true);
            lastAttempt = Date.now();
            try {
                const prepare = async () => {
                    await syncAll(userId);
                    let ids: string[];
                    const date = getToday();
                    if (!force && verifiedDate === date && Date.now() - lastRefresh < REFRESH_INTERVAL &&
                        verifiedIds !== null) {
                        ids = verifiedIds;
                    } else {
                        ids = await refreshToday(userId);
                        lastRefresh = Date.now();
                        verifiedDate = date;
                        verifiedIds = ids;
                    }
                    if (active) setError('');

                    if (!('serviceWorker' in navigator)) throw new Error('Este navegador no admite el modo sin conexión.');
                    const existing = await navigator.serviceWorker.getRegistration('/panel');
                    const registration = existing?.active ? existing :
                        await navigator.serviceWorker.register('/sw.js', { scope: '/panel' });
                    const worker = await activeWorker(registration);
                    // Las visitas pueden cambiar sin cambiar la lista de IDs.
                    // En ese caso se actualizan las páginas aunque no haya pasado una hora.
                    const localVisits = await listLocal(userId);
                    const byId = new Map(localVisits.map((visit) => [visit.id, visit.expectedUpdatedAt]));
                    const snapshot = JSON.stringify({ date, ids,
                        revisions: ids.map((id) => byId.get(id) ?? null) });
                    const previous = (() => {
                        try { return JSON.parse(localStorage.getItem(prefetchKey) ?? 'null') as {
                            snapshot: string; at: number;
                        } | null; } catch { return null; }
                    })();
                    const status = await workerMessage(worker, {
                        type: 'offline-status', ids, date: getToday(),
                    }, 4_000) as OfflineStatus;
                    if (previous?.snapshot === snapshot && status.ready &&
                        Date.now() - Math.max(lastPrefetch, previous.at) < PREFETCH_INTERVAL) return;
                    const result = await workerMessage(worker, {
                        type: 'prefetch-visits', ids, date: getToday(),
                    }, 120_000) as { ok: boolean };
                    if (!result.ok) throw new Error('Algunas páginas no quedaron disponibles sin internet. Reintenta con una conexión estable.');
                    lastPrefetch = Date.now();
                    try {
                        localStorage.setItem(prefetchKey, JSON.stringify({ snapshot, at: lastPrefetch }));
                    } catch { /* La caché del navegador sigue disponible. */ }
                };
                if (navigator.locks) {
                    await navigator.locks.request(`jym-auto-refresh-${userId}`, prepare);
                } else {
                    await prepare();
                }
                failures = 0;
            } catch (reason) {
                failures++;
                console.warn('[offline.refresh]', reason);
                if (active) setError(`No se pudo actualizar la copia local. ${
                    reason instanceof Error ? reason.message : 'Verifica la conexión y el espacio disponible.'
                }`);
            } finally {
                running = false;
                if (active) setPreparing(false);
                await update();
            }
        }
        void update();
        if (navigator.onLine) void connected();
        const onOnline = () => { failures = 0; void connected(true); };
        const onRetry = () => { void connected(true); };
        const onFocus = () => { void connected(); };
        const onChange = () => {
            if (updateTimer !== undefined) window.clearTimeout(updateTimer);
            updateTimer = window.setTimeout(() => {
                updateTimer = undefined;
                void update();
            }, 100);
        };
        window.addEventListener('online', onOnline);
        window.addEventListener('jym-prepare-now', onRetry);
        window.addEventListener('focus', onFocus);
        window.addEventListener('jym-visits-changed', onChange);
        const interval = window.setInterval(() => { void connected(); }, 60_000);
        return () => {
            active = false;
            window.removeEventListener('online', onOnline);
            window.removeEventListener('jym-prepare-now', onRetry);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('jym-visits-changed', onChange);
            window.clearInterval(interval);
            if (updateTimer !== undefined) window.clearTimeout(updateTimer);
        };
    }, [userId]);
    return (
        <div role="status" className={`mb-4 rounded-xl border px-3 py-2 text-sm font-semibold ${
            conflicts || error ? 'border-red-200 bg-red-50 text-red-900' :
                ready && !pending ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
                    'border-amber-200 bg-amber-50 text-amber-900'
        }`}>
            <span className="block">{total === null ? 'Comprobando la jornada guardada…'
                : !verified
                    ? preparing ? 'Consultando las visitas de hoy y preparando la copia local…'
                        : `No se pudo verificar la agenda de hoy. Hay ${total} visita(s) en este dispositivo.`
                : total === 0 && !preparing
                    ? `No hay visitas programadas para hoy.${
                        ready ? ' Hoy y Ruta están disponibles sin internet.' : ''}`
                : ready
                ? `Jornada lista sin internet: Hoy, Ruta y ${available} visita(s) preparadas.`
                : preparing ? `Preparando la jornada… ${available}/${total} visitas disponibles.`
                    : `${available}/${total} visitas disponibles sin internet. ${
                        pages ? 'La jornada aún no está completamente preparada.' : 'Hoy y Ruta aún no están listos.'}`}</span>
            {pending > 0 && <span className="block">
                {pending} visita(s) con cambios guardados en el teléfono, pendientes de confirmar en el servidor.
            </span>}
            {conflicts > 0 && <span className="block">{conflicts} visita(s) con conflicto: conserva los cambios locales y revísalos.</span>}
            {error && <span className="block">{error}</span>}
            {!ready && total !== null && total > 0 && <span className="ml-2">No salgas sin comprobar la copia offline.</span>}
            {!ready && !preparing && (total === null || total > 0 || error) &&
                <button type="button" disabled={typeof navigator !== 'undefined' && !navigator.onLine}
                onClick={() => window.dispatchEvent(new Event('jym-prepare-now'))}
                className="ml-2 underline disabled:opacity-50">Reintentar preparación</button>}
            {conflictId && <a href={`/panel/visitas/${conflictId}`} className="ml-2 underline">Revisar visita →</a>}
            {legacy && <a href="/panel/sin-conexion" className="ml-2 underline">
                Hay cierres del sistema anterior con PIN; ábrelos para sincronizarlos antes de cerrar sesión.
            </a>}
        </div>
    );
}
