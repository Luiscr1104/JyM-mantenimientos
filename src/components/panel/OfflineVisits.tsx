import * as React from 'react';
import { PRODUCTS, productInfo, type ProductKey } from '@/lib/products';
import { EXIT_STEPS, getCompletionIssue, normalizeChecklist, tasksForTypes, type VisitChecklistKey } from '@/lib/visit-work';
import { WORK_TYPES, type WorkType } from '@/lib/visit-types';
import type { OfflineVisit } from '@/lib/offline-visit';
import { listEncrypted, readEncrypted, removeEncrypted, saveEncrypted } from '@/lib/offline-storage';

export default function OfflineVisits() {
    const [count, setCount] = React.useState<number | null>(null);
    const [pin, setPin] = React.useState('');
    const [unlocked, setUnlocked] = React.useState(false);
    const [visits, setVisits] = React.useState<OfflineVisit[]>([]);
    const [userId, setUserId] = React.useState('');
    const [selected, setSelected] = React.useState('');
    const [product, setProduct] = React.useState<ProductKey>('granulated_chlorine');
    const [quantity, setQuantity] = React.useState('');
    const [message, setMessage] = React.useState('');
    const [syncing, setSyncing] = React.useState(false);
    const visitsRef = React.useRef<OfflineVisit[]>([]);
    const saving = React.useRef<Promise<void>>(Promise.resolve());
    const saveFailed = React.useRef(false);

    React.useEffect(() => {
        void listEncrypted().then((entries) => setCount(entries.length))
            .catch(() => setMessage('No se pudo abrir el almacenamiento de este dispositivo.'));
    }, []);

    React.useEffect(() => {
        if (!('BroadcastChannel' in window)) return;
        const channel = new BroadcastChannel('jym-session');
        channel.onmessage = (event) => {
            if (event.data !== 'signed-out') return;
            visitsRef.current = [];
            setVisits([]);
            setPin('');
            setUnlocked(false);
            setCount(0);
            setMessage('La sesión se cerró en otra pestaña. Se borraron los datos locales.');
        };
        return () => channel.close();
    }, []);

    async function unlock(event: React.FormEvent) {
        event.preventDefault();
        try {
            const entries = await listEncrypted();
            const data = await Promise.all(entries.map((entry) => readEncrypted(entry, pin)));
            visitsRef.current = data;
            setVisits(data);
            setUserId(entries[0]?.userId ?? '');
            setSelected(data[0]?.id ?? '');
            setUnlocked(true);
            setMessage('Los datos locales se cifran con tu PIN. No se envían hasta sincronizar.');
        } catch {
            setMessage('PIN incorrecto o datos locales dañados. No borraremos ningún trabajo.');
        }
    }

    function update(id: string, change: (visit: OfflineVisit) => OfflineVisit) {
        const next = visitsRef.current.map((visit) =>
            visit.id === id ? { ...change(visit), pending: true } : visit);
        visitsRef.current = next;
        setVisits(next);
        const updated = next.find((visit) => visit.id === id)!;
        saving.current = saving.current.catch(() => {}).then(() => saveEncrypted(updated, userId, pin))
            .then(() => { saveFailed.current = false; })
            .catch(() => {
                saveFailed.current = true;
                setMessage('No se pudo guardar en este dispositivo. No cierres la aplicación; libera espacio y vuelve a intentar.');
            });
    }

    async function syncOne(visit: OfflineVisit) {
        if (!visit.pending || !visit.completedAt || saveFailed.current) return;
        await saving.current;
        if (saveFailed.current) return;
        const response = await fetch('/api/panel/offline/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(12_000),
            body: JSON.stringify({
                syncId: visit.syncId,
                visitId: visit.id,
                expectedUpdatedAt: visit.expectedUpdatedAt,
                startedAt: visit.startedAt,
                pumpStartedAt: visit.pumpStartedAt,
                pumpStoppedAt: visit.pumpStoppedAt,
                completedAt: visit.completedAt,
                work: visit.work,
                existingProducts: visit.products,
                products: visit.addedProducts,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${visit.propertyName}: ${data.error || 'Sin conexión o sesión vencida.'}`);
        await removeEncrypted(visit.id);
        visitsRef.current = visitsRef.current.filter((entry) => entry.id !== visit.id);
        setVisits(visitsRef.current);
        setSelected((current) => current === visit.id ? visitsRef.current[0]?.id ?? '' : current);
        setCount(visitsRef.current.length);
    }

    async function sync() {
        if (!navigator.onLine) {
            setMessage('Sin conexión. Tu trabajo sigue cifrado y pendiente en este dispositivo.');
            return;
        }
        setSyncing(true);
        try {
            const pending = visitsRef.current.filter((visit) => visit.pending && visit.completedAt);
            for (const visit of pending) await syncOne(visit);
            setMessage(pending.length
                ? 'Visitas confirmadas por el servidor. Revisa el panel para ver el resultado.'
                : 'Aún no hay cierres pendientes de sincronizar.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No se pudo sincronizar. El trabajo local permanece guardado.');
        } finally {
            setSyncing(false);
        }
    }

    React.useEffect(() => {
        if (!unlocked) return;
        const onOnline = () => { void sync(); };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [unlocked, userId, pin]);

    const visit = visits.find((entry) => entry.id === selected);
    const editable = Boolean(visit && !visit.completedAt);
    const checklist = visit ? normalizeChecklist(visit.work.checklist) : null;
    const issue = visit && checklist
        ? getCompletionIssue(checklist, visit.work.pendingReason,
            Boolean(visit.pumpStartedAt && !visit.pumpStoppedAt), visit.work.workTypes)
        : null;

    return (
        <div className="space-y-4">
            {count === null && <p>Cargando almacenamiento local…</p>}
            {count === 0 && !unlocked && (
                <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                    No hay visitas descargadas. Con internet, abre «Hoy» y prepara las visitas primero.
                </p>
            )}
            {!unlocked && count !== null && count > 0 && (
                <form onSubmit={(event) => void unlock(event)} className="rounded-2xl border bg-white p-4">
                    <label className="block text-sm font-bold">PIN local
                        <input type="password" value={pin} onChange={(event) => setPin(event.target.value)}
                            autoComplete="off" required className="mt-1 block h-11 w-full rounded-xl border px-3" />
                    </label>
                    <button type="submit" className="panel-btn panel-btn-primary mt-3">Desbloquear visitas</button>
                </form>
            )}
            {message && <p role="status" className="rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-900">{message}</p>}
            {unlocked && (
                <>
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        {navigator.onLine ? 'Con conexión' : 'Sin conexión'} · Los cierres locales
                        solo quedan confirmados cuando desaparecen de esta lista tras sincronizar.
                        Si cierras sesión, los datos pendientes se borrarán de este dispositivo.
                        Los seguimientos de floculación se agendan desde el panel después de sincronizar.
                    </div>
                    <button type="button" onClick={() => void sync()} disabled={syncing || !visits.some((item) => item.completedAt && item.pending)}
                        className="panel-btn panel-btn-primary w-full">
                        {syncing ? 'Sincronizando…' : 'Sincronizar cierres pendientes'}
                    </button>
                    <div className="grid gap-2">
                        {visits.map((item) => (
                            <button type="button" key={item.id} onClick={() => setSelected(item.id)}
                                className={`rounded-xl border p-3 text-left text-sm font-bold ${selected === item.id ? 'border-sky-500 bg-sky-50' : 'bg-white'}`}>
                                {item.propertyName} · {item.completedAt ? 'Salida local, pendiente de sincronizar' :
                                    item.startedAt ? 'En curso' : 'Pendiente'}
                            </button>
                        ))}
                    </div>
                    {visit && checklist && (
                        <section className="space-y-4 rounded-2xl border bg-white p-4">
                            <h2 className="text-xl font-extrabold">{visit.propertyName}</h2>
                            <p className="text-sm">{visit.address}</p>
                            {visit.gateCode && <p className="rounded-lg bg-slate-100 p-2 text-sm">Portón: {visit.gateCode}</p>}
                            {visit.accessNotes && <p className="whitespace-pre-line text-sm">Acceso: {visit.accessNotes}</p>}
                            {visit.pumpNotes && <p className="whitespace-pre-line text-sm">Bomba: {visit.pumpNotes}</p>}
                            {visit.completedAt && navigator.onLine && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                                    <p>¿Hay un conflicto? Compara esta copia con la visita en el panel y corrige
                                        los datos manualmente. La copia local no se borra sola.</p>
                                    <a href={`/panel/visitas/${visit.id}`} target="_blank" rel="noopener noreferrer"
                                        className="mt-2 block font-bold text-sky-800 underline">Ver visita en el servidor ↗</a>
                                    <button type="button" className="mt-3 font-bold text-red-800 underline"
                                        onClick={() => {
                                            if (!window.confirm('Solo descarta esta copia después de confirmar que sus datos están en el servidor. Esta acción no se puede deshacer.')) return;
                                            void removeEncrypted(visit.id).then(() => {
                                                visitsRef.current = visitsRef.current.filter((item) => item.id !== visit.id);
                                                setVisits(visitsRef.current);
                                                setSelected(visitsRef.current[0]?.id ?? '');
                                                setCount(visitsRef.current.length);
                                            }).catch(() => setMessage('No se pudo borrar la copia local.'));
                                        }}>
                                        Ya resolví el conflicto; descartar copia local
                                    </button>
                                </div>
                            )}
                            {!visit.startedAt && (
                                <button type="button" onClick={() => update(visit.id, (current) =>
                                    ({ ...current, startedAt: new Date().toISOString(), status: 'in_progress' }))}
                                    className="panel-btn panel-btn-primary w-full">Registrar llegada local</button>
                            )}
                            {visit.startedAt && <p className="text-sm">Llegada: {new Date(visit.startedAt).toLocaleString('es-CR')}</p>}
                            {visit.startedAt && (
                                <>
                                    <div className="space-y-2">
                                        <h3 className="font-bold">Trabajos realizados</h3>
                                        {WORK_TYPES.map(({ key, label }) => (
                                            <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                                                <input type="checkbox" disabled={!editable}
                                                    checked={visit.work.workTypes.includes(key)}
                                                    onChange={() => update(visit.id, (current) => {
                                                        const types = current.work.workTypes.includes(key)
                                                            ? current.work.workTypes.filter((type) => type !== key)
                                                            : [...current.work.workTypes, key];
                                                        return types.length ? { ...current, work: { ...current.work, workTypes: types as WorkType[] } } : current;
                                                    })} />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="font-bold">Mantenimiento</h3>
                                        {tasksForTypes(visit.work.workTypes).map(({ key, label }) => (
                                            <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                                                <input type="checkbox" disabled={!editable} checked={checklist[key]}
                                                    onChange={() => update(visit.id, (current) => ({
                                                        ...current, work: { ...current.work, checklist: { ...current.work.checklist, [key]: !current.work.checklist[key] } },
                                                    }))} />{label}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="font-bold">Productos aplicados</h3>
                                        {visit.products.concat(visit.addedProducts).map((entry, index) => (
                                            <p key={index} className="text-sm">{productInfo(entry.product).label}: {entry.quantity} {productInfo(entry.product).unit}</p>
                                        ))}
                                        {editable && <form onSubmit={(event) => {
                                            event.preventDefault();
                                            const amount = Number(quantity);
                                            if (!Number.isFinite(amount) || amount < 0.01 || amount > 100000 ||
                                                Math.round(amount * 100) !== amount * 100) return;
                                            update(visit.id, (current) => ({
                                                ...current, addedProducts: [...current.addedProducts, { product, quantity: amount }],
                                            }));
                                            setQuantity('');
                                        }} className="flex flex-wrap gap-2">
                                            <select value={product} onChange={(event) => setProduct(event.target.value as ProductKey)}
                                                className="h-11 min-w-0 rounded-xl border px-2">
                                                {PRODUCTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                                            </select>
                                            <input aria-label="Cantidad aplicada" type="number" min=".01" max="100000" step=".01"
                                                value={quantity} onChange={(event) => setQuantity(event.target.value)}
                                                className="h-11 w-28 rounded-xl border px-2" required />
                                            <button className="panel-btn panel-btn-secondary">Agregar</button>
                                        </form>}
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="font-bold">Temporizador de bomba</h3>
                                        {!visit.pumpStartedAt && editable && <button type="button" className="panel-btn panel-btn-secondary"
                                            onClick={() => update(visit.id, (current) => ({ ...current, pumpStartedAt: new Date().toISOString() }))}>
                                            Registrar encendido local
                                        </button>}
                                        {visit.pumpStartedAt && <p className="text-sm">Encendido: {new Date(visit.pumpStartedAt).toLocaleString('es-CR')}</p>}
                                        {visit.pumpStartedAt && !visit.pumpStoppedAt && editable && <button type="button"
                                            className="panel-btn panel-btn-secondary"
                                            onClick={() => update(visit.id, (current) => ({ ...current, pumpStoppedAt: new Date().toISOString() }))}>
                                            Registrar apagado local
                                        </button>}
                                        {visit.pumpStoppedAt && <p className="text-sm">Apagado: {new Date(visit.pumpStoppedAt).toLocaleString('es-CR')}</p>}
                                        <p className="text-xs text-amber-800">
                                            Sin internet no hay avisos push garantizados. Usa la alarma del teléfono y verifica físicamente la bomba.
                                            Registra llaves de llenado pendientes cuando vuelvas a tener conexión.
                                        </p>
                                    </div>
                                    <label className="block text-sm font-bold">Notas
                                        <textarea disabled={!editable} value={visit.work.notes} maxLength={2000}
                                            onChange={(event) => update(visit.id, (current) => ({
                                                ...current, work: { ...current.work, notes: event.target.value },
                                            }))} className="mt-1 block w-full rounded-xl border p-2" />
                                    </label>
                                    {tasksForTypes(visit.work.workTypes).some(({ key }) => !checklist[key]) &&
                                        <label className="block text-sm font-bold">Tareas pendientes y motivo
                                            <textarea disabled={!editable} value={visit.work.pendingReason} maxLength={1000}
                                                onChange={(event) => update(visit.id, (current) => ({
                                                    ...current, work: { ...current.work, pendingReason: event.target.value },
                                                }))} className="mt-1 block w-full rounded-xl border p-2" />
                                        </label>}
                                    <div className="space-y-2 rounded-xl bg-amber-50 p-3">
                                        <h3 className="font-bold">Antes de salir: confirma físicamente</h3>
                                        {EXIT_STEPS.map(({ key, label }) => (
                                            <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                                                <input type="checkbox" disabled={!editable} checked={checklist[key]}
                                                    onChange={() => update(visit.id, (current) => ({
                                                        ...current, work: { ...current.work, checklist: { ...current.work.checklist, [key]: !current.work.checklist[key] } },
                                                    }))} />{label}
                                            </label>
                                        ))}
                                    </div>
                                    {issue && <p className="text-sm font-semibold text-amber-800">{issue}</p>}
                                    {editable && <button type="button" disabled={Boolean(issue) || saveFailed.current}
                                        onClick={() => update(visit.id, (current) => ({ ...current, completedAt: new Date().toISOString() }))}
                                        className="panel-btn w-full bg-emerald-700 text-white">
                                        Confirmar salida local (pendiente de sincronizar)
                                    </button>}
                                </>
                            )}
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
