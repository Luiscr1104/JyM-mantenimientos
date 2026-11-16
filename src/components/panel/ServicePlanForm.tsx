import * as React from 'react';

interface PlanData {
    visitsPerWeek: number;
    preferredDays: string[];
    active: boolean;
}

interface Props {
    propertyId: string;
    initial: PlanData | null;
}

const DAYS = [
    { value: 'lunes', label: 'Lun' },
    { value: 'martes', label: 'Mar' },
    { value: 'miercoles', label: 'Mié' },
    { value: 'jueves', label: 'Jue' },
    { value: 'viernes', label: 'Vie' },
    { value: 'sabado', label: 'Sáb' },
    { value: 'domingo', label: 'Dom' },
];

const inputClass =
    'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100';
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';

export default function ServicePlanForm({ propertyId, initial }: Props) {
    const [visitsPerWeek, setVisitsPerWeek] = React.useState(
        String(initial?.visitsPerWeek ?? 1),
    );
    const [preferredDays, setPreferredDays] = React.useState<string[]>(
        initial?.preferredDays.slice(0, initial.visitsPerWeek) ?? [],
    );
    const [active, setActive] = React.useState(initial?.active ?? true);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');

    function toggleDay(day: string) {
        setPreferredDays((previous) =>
            previous.includes(day)
                ? previous.filter((item) => item !== day)
                : [...previous, day],
        );
        setMessage('');
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        setError('');

        try {
            const response = await fetch(`/api/panel/service-plans/${propertyId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    visitsPerWeek: Number(visitsPerWeek),
                    preferredDays,
                    active,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error ?? 'No se pudo guardar la frecuencia.');
                return;
            }

            setMessage('Frecuencia guardada.');
        } catch {
            setError('Error de conexión. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
            <div>
                <h2 className="text-base font-extrabold text-slate-900">Frecuencia de servicio</h2>
                <p className="mt-1 text-xs text-slate-500">
                    Con esto se sugieren las visitas del día automáticamente.
                </p>
            </div>

            {message && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                    {message}
                </div>
            )}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="visitsPerWeek" className={labelClass}>
                        Visitas por semana
                    </label>
                    <input
                        id="visitsPerWeek"
                        type="number"
                        min="0"
                        max="7"
                        inputMode="numeric"
                        value={visitsPerWeek}
                        onChange={(event) => setVisitsPerWeek(event.target.value)}
                        className={inputClass}
                    />
                </div>

                <label className="flex items-center gap-3 self-end rounded-xl border border-slate-300 bg-white px-4 py-3">
                    <input
                        type="checkbox"
                        checked={active}
                        onChange={(event) => setActive(event.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-sky-700 focus:ring-sky-200"
                    />
                    <span className="text-sm font-semibold text-slate-700">Plan activo</span>
                </label>
            </div>

            <div>
                <span className={labelClass}>Días preferidos (opcional)</span>
                <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => {
                        const selected = preferredDays.includes(day.value);
                        return (
                            <button
                                key={day.value}
                                type="button"
                                onClick={() => toggleDay(day.value)}
                                aria-pressed={selected}
                                className={[
                                    'h-10 min-w-14 rounded-xl border px-3 text-sm font-bold transition',
                                    selected
                                        ? 'border-sky-700 bg-sky-700 text-white'
                                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                                ].join(' ')}
                            >
                                {day.label}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                    Elige tantos días como visitas por semana. Si no eliges ninguno, se
                    reparten en días fijos.
                </p>
            </div>

            <div className="border-t border-slate-100 pt-5">
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-700 px-6 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? 'Guardando…' : 'Guardar frecuencia'}
                </button>
            </div>
        </form>
    );
}
