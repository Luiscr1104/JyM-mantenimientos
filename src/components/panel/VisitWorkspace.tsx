import * as React from 'react';
import {
    EXIT_STEPS,
    TASKS,
    getCompletionIssue,
    normalizeChecklist,
    type VisitChecklistKey,
    type WorkChecklist,
} from '@/lib/visit-work';

type Status = 'scheduled' | 'in_progress' | 'completed' | 'skipped';
type SaveState = 'saved' | 'pending' | 'saving' | 'error';

interface Props {
    id: string;
    date: string;
    initial: {
        status: Status;
        checklist: Record<string, boolean> | null;
        notes: string | null;
        pendingReason: string | null;
        pumpStartedAt: string | null;
        pumpStoppedAt: string | null;
    };
}

interface Draft {
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

export default function VisitWorkspace({ id, date, initial }: Props) {
    const [status, setStatus] = React.useState<Status>(initial.status);
    const [draft, setDraft] = React.useState<Draft>({
        checklist: normalizeChecklist(initial.checklist),
        notes: initial.notes ?? '',
        pendingReason: initial.pendingReason ?? '',
    });
    const [pumpStartedAt, setPumpStartedAt] = React.useState(initial.pumpStartedAt);
    const [pumpStoppedAt, setPumpStoppedAt] = React.useState(initial.pumpStoppedAt);
    const [now, setNow] = React.useState(Date.now());
    const [saveState, setSaveState] = React.useState<SaveState>('saved');
    const [dirty, setDirty] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const queue = React.useRef<Promise<void>>(Promise.resolve());
    const version = React.useRef(0);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const running = Boolean(pumpStartedAt && !pumpStoppedAt);
    const completedTasks = TASKS.filter(({ key }) => draft.checklist[key]).length;
    const issue = getCompletionIssue(draft.checklist, draft.pendingReason, running);
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
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'No se pudo completar la visita.');
        } finally {
            setBusy(false);
        }
    }

    function toggle(key: VisitChecklistKey) {
        edit({ ...draft, checklist: { ...draft.checklist, [key]: !draft.checklist[key] } });
    }

    return (
        <div className="space-y-5">
            {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
                    {error}
                </div>
            )}
            {status === 'scheduled' && (
                <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                    <p className="mb-4 text-sm text-sky-900">Cuando llegues, inicia esta visita para registrar el trabajo.</p>
                    <button type="button" onClick={start} disabled={busy}
                        className="h-14 w-full rounded-2xl bg-sky-700 px-6 text-base font-extrabold text-white disabled:opacity-50 sm:w-auto">
                        {busy ? 'Iniciando…' : 'Iniciar visita'}
                    </button>
                </section>
            )}
            {status === 'completed' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-900">
                    Visita completada. El registro está disponible para consulta.
                    <a href={`/panel/ruta?date=${date}`} className="mt-3 block font-bold text-sky-800 underline">Volver a la ruta</a>
                </div>
            )}
            {status === 'skipped' && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                    Visita omitida. Reábrela desde la agenda si necesitas trabajar en ella.
                </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-extrabold text-slate-900">Mantenimiento</h2>
                    <span className="text-sm font-bold text-sky-700">{completedTasks}/{TASKS.length}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                    Lista provisional: José debe confirmar los pasos reales de cada servicio.
                </p>
                <div className="mt-4 space-y-2">
                    {TASKS.map(({ key, label }) => (
                        <label key={key} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
                            <input type="checkbox" disabled={!editable} checked={draft.checklist[key]}
                                onChange={() => toggle(key)} className="h-6 w-6 shrink-0 accent-sky-700" />
                            {label}
                        </label>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-900">Temporizador de bomba</h2>
                <p className="mt-1 text-xs text-slate-500">
                    Solo registra tiempo. No controla la bomba ni avisa con la aplicación cerrada.
                </p>
                <p role="timer" className="my-4 font-mono text-4xl font-extrabold tabular-nums text-slate-900">
                    {pumpStartedAt ? elapsed(pumpStartedAt, pumpStoppedAt, now) : '00:00:00'}
                </p>
                {!pumpStartedAt && editable && (
                    <button type="button" disabled={busy} onClick={() => pump('start')}
                        className="h-12 w-full rounded-xl bg-sky-700 px-5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">
                        Registrar encendido
                    </button>
                )}
                {running && editable && (
                    <button type="button" disabled={busy} onClick={() => pump('stop')}
                        className="h-12 w-full rounded-xl bg-amber-600 px-5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">
                        Registrar apagado
                    </button>
                )}
                {pumpStoppedAt && <p className="text-sm font-semibold text-emerald-800">Tiempo registrado. Verifica físicamente el estado del equipo.</p>}
            </section>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                    <label htmlFor="visit-notes" className="block text-sm font-bold text-slate-800">Notas de la visita</label>
                    <textarea id="visit-notes" rows={3} maxLength={2000} disabled={!editable}
                        value={draft.notes} onChange={(event) => edit({ ...draft, notes: event.target.value })}
                        placeholder="Observaciones, mediciones, problemas encontrados…"
                        className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-sky-600 disabled:bg-slate-50" />
                </div>
                {completedTasks < TASKS.length && (
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
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
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
            </section>

            {editable && (
                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p aria-live="polite" className="text-sm font-semibold text-slate-600">{saveLabels[saveState]}</p>
                    <button type="button" disabled={busy} onClick={() => void saveNow()}
                        className="h-11 w-full rounded-xl border border-sky-300 bg-sky-50 px-5 text-sm font-bold text-sky-800 disabled:opacity-50 sm:w-auto">
                        Guardar ahora
                    </button>
                    {issue && <p className="text-sm font-semibold text-amber-800">{issue}</p>}
                    <button type="button" disabled={busy || Boolean(issue)} onClick={complete}
                        className="h-14 w-full rounded-2xl bg-emerald-700 px-6 text-base font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                        {busy ? 'Guardando…' : 'Completar visita'}
                    </button>
                </section>
            )}
        </div>
    );
}
