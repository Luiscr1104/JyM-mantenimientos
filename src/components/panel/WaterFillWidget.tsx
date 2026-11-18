import * as React from 'react';

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
    initial, visitId, propertyId, propertyName, canCreate = false,
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
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Llaves de llenado pendientes</h2>
            <p className="mt-1 text-xs text-amber-900">
                Solo se muestran dentro del panel. No hay alarmas ni avisos con la aplicación cerrada:
                pon también una alarma en el teléfono.
            </p>
            {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
            {message && <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">{message}</p>}

            {tasks.length > 0 && <ul className="mt-4 space-y-3">
                {tasks.map((task) => {
                    const overdue = new Date(task.dueAt).getTime() <= now;
                    return <li key={task.id} className="rounded-xl border border-amber-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="font-extrabold text-slate-900">Llave abierta · {task.propertyName}</p>
                                <p className="mt-1 text-sm text-slate-600">
                                    Registrada {timeFormat.format(new Date(task.createdAt))} · revisión {timeFormat.format(new Date(task.dueAt))}
                                </p>
                            </div>
                            <strong role="timer" suppressHydrationWarning className={overdue ? 'text-red-700' : 'text-amber-800'}>
                                {remainingLabel(task.dueAt, now)}
                            </strong>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" disabled={busy} onClick={() => void close(task.id)}
                                className="min-h-12 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white disabled:opacity-50">
                                Confirmar llave cerrada
                            </button>
                            <a href={task.visitId ? `/panel/visitas/${task.visitId}` : `/panel/propiedades/${task.propertyId}`}
                                className="inline-flex min-h-12 items-center rounded-xl border border-amber-300 px-4 text-sm font-semibold text-amber-900">
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
                            className="min-h-12 rounded-xl bg-amber-700 px-5 text-sm font-bold text-white disabled:opacity-50">
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
