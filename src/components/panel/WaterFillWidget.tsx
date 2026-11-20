import * as React from 'react';
import { Droplets } from 'lucide-react';

export interface OpenWaterTask {
    id: string;
    propertyId: string;
    propertyName: string;
    visitId: string | null;
    createdAt: string;
    dueAt: string;
    delayMinutes: number;
}

interface Props {
    initial: OpenWaterTask[];
    visitId?: string;
    propertyId?: string;
    propertyName?: string;
    canCreate?: boolean;
    compact?: boolean;
}

function remainingLabel(dueAt: string, now: number) {
    const minutes = Math.ceil((new Date(dueAt).getTime() - now) / 60_000);
    if (minutes < 0) return `Atrasada ${Math.abs(minutes)} min`;
    if (minutes === 0) return 'Es hora de revisar';
    return `Volver en ${minutes} min`;
}

const timeFormat = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    hour: '2-digit',
    minute: '2-digit',
});

export default function WaterFillWidget({
    initial, visitId, propertyId, propertyName, canCreate = false, compact = false,
}: Props) {
    const [tasks, setTasks] = React.useState(initial);
    const [minutes, setMinutes] = React.useState('30');
    const [now, setNow] = React.useState(Date.now());
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const [message, setMessage] = React.useState('');

    React.useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(interval);
    }, []);

    async function create(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!propertyId || !propertyName) return;
        if (!navigator.onLine) { setError('Registra la llave al recuperar internet; mientras tanto usa una alarma del teléfono.'); return; }
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch('/api/panel/water-fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(visitId ? { visitId } : { propertyId }),
                    minutes: Number(minutes),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error ?? 'No se pudo guardar la tarea.');
            setTasks((current) => [...current, { ...data.task, propertyName }]);
            setMessage('Llave registrada. La tarea seguirá en Hoy hasta confirmar su cierre.');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Error de conexión.');
        } finally {
            setBusy(false);
        }
    }

    async function close(id: string) {
        if (!navigator.onLine) { setError('Comprueba físicamente la llave y confirma su cierre al recuperar internet.'); return; }
        if (!window.confirm('¿Comprobaste físicamente que la llave quedó cerrada?')) return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(`/api/panel/water-fill/${id}/close`, { method: 'POST' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error ?? 'No se pudo cerrar la tarea.');
            setTasks((current) => current.filter((task) => task.id !== id));
            setMessage('Llave cerrada y confirmada.');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Error de conexión.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className={compact
            ? 'rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-4 shadow-sm sm:p-5'
            : 'rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5'}>
            {compact ? (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                            <Droplets className="h-5 w-5" />
                        </span>
                        <h2 className="min-w-0 flex-1 text-base font-extrabold text-slate-900">
                            Llaves de llenado pendientes
                        </h2>
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-900">
                            {tasks.length}
                        </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-amber-900">
                        Pon también una alarma en el teléfono. Si José activó los avisos, recibirá un recordatorio al vencer el plazo.
                    </p>
                </>
            ) : (
                <>
                    <h2 className="text-lg font-extrabold text-slate-900">Llaves de llenado pendientes</h2>
                    <p className="mt-1 text-xs text-amber-900">
                        Permanecen visibles en «Hoy». Si José activó los avisos, recibirá un recordatorio
                        cuando venza el plazo. Pon también una alarma en el teléfono.
                    </p>
                </>
            )}
            {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
            {message && <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">{message}</p>}

            {tasks.length > 0 && <ul className={compact ? 'mt-3 space-y-2' : 'mt-4 space-y-3'}>
                {tasks.map((task) => {
                    const overdue = new Date(task.dueAt).getTime() <= now;
                    const href = task.visitId ? `/panel/visitas/${task.visitId}` : `/panel/propiedades/${task.propertyId}`;
                    return compact ? <li key={task.id} className="min-w-0 rounded-xl border border-amber-200/80 bg-white p-3 shadow-sm lg:flex lg:items-center lg:justify-between lg:gap-4">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                            <span aria-hidden="true"
                                className={`water-flow-icon relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                    overdue
                                        ? 'water-flow-icon--overdue border-red-200 bg-red-50 text-red-700'
                                        : 'border-sky-200 bg-sky-50 text-sky-700'
                                }`}>
                                <Droplets className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-extrabold text-slate-900">{task.propertyName}</p>
                                <p className="text-xs text-slate-600">
                                    Revisar {timeFormat.format(new Date(task.dueAt))} · abierta {timeFormat.format(new Date(task.createdAt))}
                                </p>
                            </div>
                            <strong role="timer" suppressHydrationWarning
                                className={`rounded-lg px-2 py-1 text-xs whitespace-nowrap ${overdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                                {remainingLabel(task.dueAt, now)}
                            </strong>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 lg:mt-0 lg:flex lg:shrink-0">
                            <button type="button" disabled={busy} onClick={() => void close(task.id)}
                                className="panel-btn min-h-11 bg-emerald-700 px-2 text-xs text-white hover:bg-emerald-800 sm:px-3 sm:text-sm">
                                Confirmar cierre
                            </button>
                            <a href={href}
                                className="panel-btn min-h-11 border border-amber-300 px-2 text-xs text-amber-900 hover:bg-amber-50 sm:px-3 sm:text-sm">
                                {task.visitId ? 'Ver visita' : 'Ver propiedad'}
                            </a>
                        </div>
                    </li> : <li key={task.id} className="min-w-0 rounded-xl border border-amber-200 bg-white p-3 sm:p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span
                                    aria-hidden="true"
                                    className={`water-flow-icon relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                                        overdue
                                            ? 'water-flow-icon--overdue border-red-200 bg-red-50 text-red-700'
                                            : 'border-sky-200 bg-sky-50 text-sky-700'
                                    }`}
                                >
                                    <Droplets className="h-6 w-6" />
                                </span>
                                <div className="min-w-0">
                                    <p className="break-words font-extrabold text-slate-900">Llave abierta · {task.propertyName}</p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Registrada {timeFormat.format(new Date(task.createdAt))} · revisión {timeFormat.format(new Date(task.dueAt))}
                                    </p>
                                </div>
                            </div>
                            <strong role="timer" suppressHydrationWarning
                                className={`rounded-lg px-2 py-1 text-sm ${overdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                                {remainingLabel(task.dueAt, now)}
                            </strong>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <button type="button" disabled={busy} onClick={() => void close(task.id)}
                                className="panel-btn w-full bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto">
                                Confirmar llave cerrada
                            </button>
                            <a href={href}
                                className="panel-btn w-full border border-amber-300 text-amber-900 sm:w-auto">
                                {task.visitId ? 'Ver visita' : 'Ver propiedad'}
                            </a>
                        </div>
                    </li>;
                })}
            </ul>}

            {canCreate && tasks.length === 0 && (
                <form onSubmit={create} className="mt-4 space-y-3">
                    <label className="block text-sm font-bold text-slate-800" htmlFor="water-minutes">
                        Volver en X minutos
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <input id="water-minutes" type="number" inputMode="numeric" min="1" max="720" required
                            value={minutes} onChange={(event) => setMinutes(event.target.value)}
                            className="h-12 w-28 rounded-xl border border-amber-300 bg-white px-3 text-base" />
                        <button type="submit" disabled={busy || !minutes}
                            className="panel-btn bg-amber-700 text-white hover:bg-amber-800">
                            {busy ? 'Guardando…' : 'Dejar llave abierta'}
                        </button>
                    </div>
                </form>
            )}
            {tasks.length === 0 && !canCreate && (
                <p className="mt-4 text-sm text-slate-600">No hay llaves pendientes.</p>
            )}
        </section>
    );
}
