import * as React from 'react';

const MapPicker = React.lazy(() => import('./MapPicker'));

interface SettingsData {
    companyName: string;
    baseAddress: string;
    baseLat: number | null;
    baseLng: number | null;
}

interface Props {
    initial: SettingsData;
}

const inputClass =
    'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100';
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';

export default function SettingsForm({ initial }: Props) {
    const [form, setForm] = React.useState(initial);
    const [mounted, setMounted] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        setMounted(true);
    }, []);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        setError('');

        try {
            const response = await fetch('/api/panel/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error ?? 'No se pudieron guardar los ajustes.');
                setSaving(false);
                return;
            }

            setMessage('Ajustes guardados.');
            setSaving(false);
        } catch {
            setError('Error de conexión. Intenta de nuevo.');
            setSaving(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
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

            <div>
                <label htmlFor="companyName" className={labelClass}>
                    Nombre de la empresa
                </label>
                <input
                    id="companyName"
                    value={form.companyName}
                    onChange={(event) =>
                        setForm((previous) => ({ ...previous, companyName: event.target.value }))
                    }
                    className={inputClass}
                    placeholder="JyM Mantenimientos"
                />
            </div>

            <div>
                <label htmlFor="baseAddress" className={labelClass}>
                    Dirección base de las rutas
                </label>
                <input
                    id="baseAddress"
                    value={form.baseAddress}
                    onChange={(event) =>
                        setForm((previous) => ({ ...previous, baseAddress: event.target.value }))
                    }
                    className={inputClass}
                    placeholder="Ej. La Fortuna centro, Alajuela"
                />
                <p className="mt-1 text-xs text-slate-500">
                    Desde aquí se calculará el recorrido de cada día.
                </p>
            </div>

            <div>
                <span className={labelClass}>Ubicación de la base en el mapa</span>
                {mounted ? (
                    <React.Suspense
                        fallback={
                            <div className="flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                                Cargando mapa…
                            </div>
                        }
                    >
                        <MapPicker
                            lat={form.baseLat}
                            lng={form.baseLng}
                            onChange={(lat, lng) =>
                                setForm((previous) => ({ ...previous, baseLat: lat, baseLng: lng }))
                            }
                        />
                    </React.Suspense>
                ) : (
                    <div className="flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                        Cargando mapa…
                    </div>
                )}
            </div>

            <div className="border-t border-slate-100 pt-5">
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-700 px-6 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? 'Guardando…' : 'Guardar ajustes'}
                </button>
            </div>
        </form>
    );
}
