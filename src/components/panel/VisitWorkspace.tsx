import * as React from 'react';
import VisitProducts, { type ProductEntry } from './VisitProducts';
import WaterFillWidget, { type OpenWaterTask } from './WaterFillWidget';
import { formatDateTime, formatVisitDuration, visitStatusLabel, visitStatusStyle } from '@/lib/format';
import { addDays, formatLongDate, getToday } from '@/lib/dates';
import { WORK_TYPES, type WorkType } from '@/lib/visit-types';
import {
    EXIT_STEPS,
    getCompletionIssue,
    normalizeChecklist,
    tasksForTypes,
    type VisitChecklistKey,
    type WorkChecklist,
} from '@/lib/visit-work';

type Status = 'scheduled' | 'in_progress' | 'completed' | 'skipped';
type SaveState = 'saved' | 'pending' | 'saving' | 'error';
type EventKind = 'arrival' | 'departure' | 'reopen' | 'skip';

interface VisitEventInfo {
    kind: EventKind;
    occurredAt: string;
    actor: string | null;
}

const eventLabels: Record<EventKind, string> = {
    arrival: 'Llegada',
    departure: 'Salida',
    reopen: 'Visita reabierta',
    skip: 'Visita omitida / salida',
};

interface Props {
    id: string;
    date: string;
    propertyId: string;
    propertyName: string;
    initialProducts: ProductEntry[];
    initialWaterTasks: OpenWaterTask[];
    initialFollowUp: { id: string; scheduledFor: string } | null;
    initialEvents: VisitEventInfo[];
    initial: {
        status: Status;
        workTypes: WorkType[];
        startedAt: string | null;
        completedAt: string | null;
        leftAt: string | null;
        checklist: Record<string, boolean> | null;
        notes: string | null;
        pendingReason: string | null;
        pumpStartedAt: string | null;
        pumpStoppedAt: string | null;
    };
}

interface Draft {
    workTypes: WorkType[];
    checklist: WorkChecklist;
    notes: string;
    pendingReason: string;
}

const saveLabels: Record<SaveState, string> = {
    saved: 'Progreso guardado',
    pending: 'Cambios sin guardar',
    saving: 'Guardando…',
    error: 'Error al guardar',
};

function elapsed(start: string, end: string | null, now: number) {
    const seconds = Math.max(0, Math.floor(((end ? new Date(end).getTime() : now) -
        new Date(start).getTime()) / 1000));
    return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(
        Math.floor((seconds % 3600) / 60),
    ).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function VisitWorkspace({
    id, date, propertyId, propertyName, initial, initialProducts, initialWaterTasks,
    initialFollowUp, initialEvents,
}: Props) {
    const [status, setStatus] = React.useState<Status>(initial.status);
    const [draft, setDraft] = React.useState<Draft>({
        workTypes: initial.workTypes,
        checklist: normalizeChecklist(initial.checklist),
        notes: initial.notes ?? '',
        pendingReason: initial.pendingReason ?? '',
    });
    const [pumpStartedAt, setPumpStartedAt] = React.useState(initial.pumpStartedAt);
    const [pumpStoppedAt, setPumpStoppedAt] = React.useState(initial.pumpStoppedAt);
    const [startedAt, setStartedAt] = React.useState(initial.startedAt);
    const [leftAt, setLeftAt] = React.useState(initial.leftAt ?? initial.completedAt);
    const [events, setEvents] = React.useState(initialEvents);
    const [followUp, setFollowUp] = React.useState(initialFollowUp);
    const [followUpDate, setFollowUpDate] = React.useState(() => addDays(date > getToday() ? date : getToday(), 1));
    const [now, setNow] = React.useState(Date.now());
    const [saveState, setSaveState] = React.useState<SaveState>('saved');
    const [dirty, setDirty] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const queue = React.useRef<Promise<void>>(Promise.resolve());
    const version = React.useRef(0);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const running = Boolean(pumpStartedAt && !pumpStoppedAt);
    const selectedTasks = tasksForTypes(draft.workTypes);
    const completedTasks = selectedTasks.filter(({ key }) => draft.checklist[key]).length;
    const issue = getCompletionIssue(draft.checklist, draft.pendingReason, running, draft.workTypes);
    const editable = status === 'in_progress';

    React.useEffect(() => {
        if (!running) return;
        const interval = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(interval);
    }, [running]);

    React.useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (!dirty && saveState !== 'saving') return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty, saveState]);

    async function request(url: string, method: 'POST' | 'PUT', body: unknown) {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la acción.');
        return data;
    }

    function persist(value: Draft, revision: number): Promise<void> {
        const job = queue.current.catch(() => {}).then(async () => {
            setSaveState('saving');
            await request(`/api/panel/visits/${id}/work`, 'PUT', value);
            if (revision === version.current) {
                setSaveState('saved');
                setDirty(false);
                setError('');
            }
        }).catch((reason: unknown) => {
            setSaveState('error');
            setError(reason instanceof Error ? reason.message : 'No se pudo guardar el progreso.');
            throw reason;
        });
        queue.current = job;
        return job;
    }

    React.useEffect(() => {
        if (!dirty || !editable) return;
        const revision = ++version.current;
        timer.current = setTimeout(() => {
            timer.current = null;
            void persist(draft, revision).catch(() => {});
        }, 650);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
        };
    }, [draft, dirty, editable]);

    function edit(value: Draft) {
        setDraft(value);
        setDirty(true);
        setSaveState('pending');
        setError('');
    }

    async function saveNow() {
        if (!editable) return false;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        const revision = ++version.current;
        try {
            await persist(draft, revision);
            return true;
        } catch {
            return false;
        }
    }

    async function start() {
        setBusy(true);
        setError('');
        try {
            const data = await request(`/api/panel/visits/${id}`, 'POST', { action: 'start' });
            setStatus(data.visit.status);
            setStartedAt(data.visit.startedAt);
            setEvents((current) => [...current, { kind: 'arrival', occurredAt: data.visit.startedAt, actor: null }]);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo iniciar la visita.');
        } finally {
            setBusy(false);
        }
    }

    async function pump(action: 'start' | 'stop') {
        setBusy(true);
        setError('');
        try {
            const data = await request(`/api/panel/visits/${id}/pump`, 'POST', { action });
            setPumpStartedAt(data.visit.pumpStartedAt);
            setPumpStoppedAt(data.visit.pumpStoppedAt);
            setNow(Date.now());
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la bomba.');
        } finally {
            setBusy(false);
        }
    }

    async function complete() {
        setBusy(true);
        setError('');
        if (!(await saveNow())) {
            setBusy(false);
            return;
        }
        try {
            const data = await request(`/api/panel/visits/${id}`, 'POST', { action: 'complete' });
            setStatus(data.visit.status);
            setLeftAt(data.visit.leftAt);
            setEvents((current) => [...current, { kind: 'departure', occurredAt: data.visit.completedAt, actor: null }]);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo completar la visita.');
        } finally {
            setBusy(false);
        }
    }

    async function scheduleFollowUp(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const data = await request(`/api/panel/visits/${id}/follow-up`, 'POST', { date: followUpDate });
            setFollowUp(data.visit);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo agendar el seguimiento.');
        } finally {
            setBusy(false);
        }
    }

    function toggle(key: VisitChecklistKey) {
        edit({ ...draft, checklist: { ...draft.checklist, [key]: !draft.checklist[key] } });
    }

    return (
        <div className="space-y-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Estado:
                <span aria-live="polite" className={`rounded-full border px-3 py-1 text-xs font-bold ${visitStatusStyle(status)}`}>
                    {visitStatusLabel(status)}
                </span>
            </p>
            {(startedAt || leftAt || events.length > 0) && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                    <h2 className="font-extrabold text-slate-900">Tiempo en la propiedad</h2>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-slate-700">
                        {startedAt && <p>Llegada: <strong>{formatDateTime(startedAt)}</strong></p>}
                        {leftAt && <p>Salida: <strong>{formatDateTime(leftAt)}</strong></p>}
                        {formatVisitDuration(startedAt, leftAt) && (
                            <p>Duración: <strong>{formatVisitDuration(startedAt, leftAt)}</strong></p>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Horas reales registradas en Costa Rica.</p>
                    {events.length > 0 && (
                        <details className="mt-2 text-xs text-slate-600">
                            <summary className="cursor-pointer font-semibold text-sky-700">Ver historial</summary>
                            <ul className="mt-2 space-y-1">
                                {events.map((entry, index) => (
                                    <li key={`${entry.occurredAt}-${index}`}>
                                        {eventLabels[entry.kind]} · {formatDateTime(entry.occurredAt)}
                                        {entry.actor && ` · ${entry.actor}`}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </section>
            )}
            {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
                    {error}
                </div>
            )}
            {status === 'scheduled' && (
                <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                    <p className="mb-4 text-sm text-sky-900">Al llegar a la propiedad, registra la hora para iniciar la parada.</p>
                    <button type="button" onClick={start} disabled={busy}
                        className="panel-btn panel-btn-primary panel-btn-main w-full sm:w-auto">
                        {busy ? 'Registrando…' : 'Marcar llegada'}
                    </button>
                </section>
            )}
            {status === 'completed' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-900">
                    Salida registrada. El trabajo y las horas están disponibles para consulta.
                    <a href={`/panel/ruta?date=${date}`} className="mt-3 block font-bold text-sky-800 underline">Volver a la ruta</a>
                </div>
            )}
            {status === 'skipped' && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                    Visita omitida. Reábrela desde la agenda si necesitas trabajar en ella.
                </div>
            )}
            {editable && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-700">Trabajo: {completedTasks}/{selectedTasks.length} pasos</span>
                    <a href="#antes-de-salir" className="inline-flex min-h-12 items-center font-bold text-sky-800 underline">
                        Ir a «Antes de salir» ↓
                    </a>
                </div>
            )}

            {(editable || status === 'completed') && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <h2 className="text-lg font-extrabold text-slate-900">Tipos de mantenimiento</h2>
                    <p className="mt-1 text-xs text-slate-500">Selecciona los trabajos realizados en esta parada.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {WORK_TYPES.map(({ key, label }) => (
                            <label key={key} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
                                <input type="checkbox" disabled={!editable} checked={draft.workTypes.includes(key)}
                                    onChange={() => {
                                        const workTypes = draft.workTypes.includes(key)
                                            ? draft.workTypes.filter((type) => type !== key)
                                            : [...draft.workTypes, key];
                                        if (workTypes.length > 0) edit({ ...draft, workTypes });
                                    }}
                                    className="h-5 w-5 shrink-0 accent-sky-700" />
                                {label}
                            </label>
                        ))}
                    </div>
                </section>
            )}

            {(editable || status === 'completed') && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-extrabold text-slate-900">Mantenimiento</h2>
                    <span className="text-sm font-bold text-sky-700">{completedTasks}/{selectedTasks.length}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                    Lista de trabajo provisional; confirmar los pasos con José.
                </p>
                <div className="mt-4 space-y-2">
                    {selectedTasks.map(({ key, label }) => (
                        <label key={key} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
                            <input type="checkbox" disabled={!editable} checked={draft.checklist[key]}
                                onChange={() => toggle(key)} className="h-6 w-6 shrink-0 accent-sky-700" />
                            {label}
                        </label>
                    ))}
                </div>
            </section>}

            {status === 'completed' && draft.workTypes.includes('flocculation') && (
                <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
                    <h2 className="text-lg font-extrabold text-slate-900">Seguimiento de floculación</h2>
                    {followUp ? (
                        <p className="mt-2 text-sm text-slate-700">
                            Visita programada para {formatLongDate(followUp.scheduledFor)}.{' '}
                            <a href={`/panel/visitas/${followUp.id}`} className="font-bold text-sky-800 underline">
                                Ver visita
                            </a>
                        </p>
                    ) : (
                        <form onSubmit={(event) => void scheduleFollowUp(event)} className="mt-2 space-y-3">
                            <p className="text-sm text-slate-700">
                                Generalmente se revisa al día siguiente; confirma o cambia la fecha.
                            </p>
                            <div className="flex flex-wrap items-end gap-2">
                                <label className="text-sm font-semibold text-slate-700">
                                    Fecha de regreso
                                    <input type="date" required min={addDays(date, 1)} value={followUpDate}
                                        onChange={(event) => setFollowUpDate(event.target.value)}
                                        className="mt-1 block h-12 rounded-xl border border-slate-300 bg-white px-3 text-base" />
                                </label>
                                <button type="submit" disabled={busy} className="panel-btn panel-btn-primary">
                                    {busy ? 'Agendando…' : 'Agendar seguimiento'}
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            )}

            {(editable || status === 'completed') && <VisitProducts
                visitId={id} editable={editable || status === 'completed'} initial={initialProducts} />}

            {(editable || status === 'completed' || initialWaterTasks.length > 0) && <WaterFillWidget initial={initialWaterTasks}
                visitId={id} propertyId={propertyId} propertyName={propertyName}
                canCreate={editable} />}

            {(editable || status === 'completed') && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-lg font-extrabold text-slate-900">Temporizador de bomba</h2>
                <p className="mt-1 text-xs text-slate-500">
                    Solo registra tiempo; no controla la bomba. Si José activó los avisos,
                    recibirá un recordatorio a los 30 minutos. Usa también una alarma del teléfono.
                </p>
                <p role="timer" className="my-4 font-mono text-4xl font-extrabold tabular-nums text-slate-900">
                    {pumpStartedAt ? elapsed(pumpStartedAt, pumpStoppedAt, now) : '00:00:00'}
                </p>
                {!pumpStartedAt && editable && (
                    <button type="button" disabled={busy} onClick={() => pump('start')}
                        className="panel-btn panel-btn-primary w-full sm:w-auto">
                        Registrar encendido
                    </button>
                )}
                {running && editable && (
                    <button type="button" disabled={busy} onClick={() => pump('stop')}
                        className="panel-btn w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto">
                        Registrar apagado
                    </button>
                )}
                {pumpStoppedAt && <p className="text-sm font-semibold text-emerald-800">Tiempo registrado. Verifica físicamente el estado del equipo.</p>}
            </section>}

            {(editable || status === 'completed') && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div>
                    <label htmlFor="visit-notes" className="block text-sm font-bold text-slate-800">Notas de la visita</label>
                    <textarea id="visit-notes" rows={3} maxLength={2000} disabled={!editable}
                        value={draft.notes} onChange={(event) => edit({ ...draft, notes: event.target.value })}
                        placeholder="Observaciones, mediciones, problemas encontrados…"
                        className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-sky-600 disabled:bg-slate-50" />
                </div>
                {completedTasks < selectedTasks.length && (
                    <div>
                        <label htmlFor="pending-reason" className="block text-sm font-bold text-amber-900">
                            ¿Qué quedó pendiente y por qué? *
                        </label>
                        <textarea id="pending-reason" rows={2} maxLength={1000} disabled={!editable}
                            value={draft.pendingReason} onChange={(event) => edit({ ...draft, pendingReason: event.target.value })}
                            placeholder="Ej.: No se pudo limpiar el filtro porque no había acceso al cuarto de máquinas."
                            className="mt-2 w-full rounded-xl border border-amber-300 p-3 text-sm text-slate-900 outline-none focus:border-amber-600 disabled:bg-slate-50" />
                    </div>
                )}
            </section>}

            {(editable || status === 'completed') && <section id="antes-de-salir" className="scroll-mt-20 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
                <h2 className="text-lg font-extrabold text-slate-900">Antes de salir</h2>
                <p className="mt-1 text-sm text-amber-900">Confirma el estado real; no asumas que los equipos deben quedar apagados.</p>
                <div className="mt-4 space-y-2">
                    {EXIT_STEPS.map(({ key, label }) => (
                        <label key={key} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800">
                            <input type="checkbox" disabled={!editable} checked={draft.checklist[key]}
                                onChange={() => toggle(key)} className="h-6 w-6 shrink-0 accent-sky-700" />
                            {label}
                        </label>
                    ))}
                </div>
            </section>}

            {editable && (
                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p aria-live="polite" className="text-sm font-semibold text-slate-600">{saveLabels[saveState]}</p>
                    <button type="button" disabled={busy} onClick={() => void saveNow()}
                        className="panel-btn w-full border border-sky-300 bg-sky-50 text-sky-800 sm:w-auto">
                        Guardar ahora
                    </button>
                    {issue && <p className="text-sm font-semibold text-amber-800">{issue}</p>}
                    <button type="button" disabled={busy || Boolean(issue)} onClick={complete}
                        className="panel-btn panel-btn-main w-full bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto">
                        {busy ? 'Registrando…' : 'Confirmar salida'}
                    </button>
                </section>
            )}
        </div>
    );
}
