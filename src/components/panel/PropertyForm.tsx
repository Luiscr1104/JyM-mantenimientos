import * as React from 'react';

const MapPicker = React.lazy(() => import('./MapPicker'));

interface PropertyData {
    id: string;
    clientId: string;
    alias: string;
    address: string;
    lat: number | null;
    lng: number | null;
    gateCode: string | null;
    accessNotes: string | null;
    poolType: string | null;
    volumeM3: number | null;
    pumpNotes: string | null;
    filterType: string | null;
    sanitation: string | null;
}

interface Props {
    mode?: 'create' | 'edit';
    clientId: string;
    clientName?: string;
    property?: PropertyData;
}

const inputClass =
    'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100';
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';

export default function PropertyForm({
    mode = 'create',
    clientId,
    clientName,
    property,
}: Props) {
    const [form, setForm] = React.useState({
        alias: property?.alias ?? '',
        address: property?.address ?? '',
        lat: property?.lat ?? null,
        lng: property?.lng ?? null,
        gateCode: property?.gateCode ?? '',
        accessNotes: property?.accessNotes ?? '',
        poolType: property?.poolType ?? '',
        volumeM3: property?.volumeM3 != null ? String(property.volumeM3) : '',
        pumpNotes: property?.pumpNotes ?? '',
        filterType: property?.filterType ?? '',
        sanitation: property?.sanitation ?? '',
    });
    const [mounted, setMounted] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        setMounted(true);
    }, []);

    function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
        setForm((previous) => ({ ...previous, [key]: value }));
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError('');

        try {
            const endpoint =
                mode === 'create'
                    ? '/api/panel/properties'
                    : `/api/panel/properties/${property?.id}`;
            const response = await fetch(endpoint, {
                method: mode === 'create' ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, clientId }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error ?? 'No se pudo guardar la propiedad.');
                setSaving(false);
                return;
            }

            window.location.assign(`/panel/propiedades/${data.id ?? property?.id}`);
        } catch {
            setError('Error de conexión. Intenta de nuevo.');
            setSaving(false);
        }
    }

    const backHref =
        mode === 'edit' && property
            ? `/panel/propiedades/${property.id}`
            : `/panel/clientes/${clientId}`;

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                >
                    {error}
                </div>
            )}

            {clientName && (
                <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    Cliente: <span className="font-bold">{clientName}</span>
                </p>
            )}

            <section className="space-y-4">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
                    Ubicación y acceso
                </h2>

                <div>
                    <label htmlFor="alias" className={labelClass}>
                        Nombre de la propiedad *
                    </label>
                    <input
                        id="alias"
                        required
                        value={form.alias}
                        onChange={(event) => update('alias', event.target.value)}
                        className={inputClass}
                        placeholder="Ej. Casa Luna · Airbnb"
                    />
                </div>

                <div>
                    <label htmlFor="address" className={labelClass}>
                        Dirección *
                    </label>
                    <input
                        id="address"
                        required
                        value={form.address}
                        onChange={(event) => update('address', event.target.value)}
                        className={inputClass}
                        placeholder="Ej. La Fortuna, 300 m norte de la iglesia"
                    />
                </div>

                <div>
                    <span className={labelClass}>Ubicación en el mapa</span>
                    {mounted ? (
                        <React.Suspense
                            fallback={
                                <div className="flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                                    Cargando mapa…
                                </div>
                            }
                        >
                            <MapPicker
                                lat={form.lat}
                                lng={form.lng}
                                onChange={(lat, lng) => {
                                    setForm((previous) => ({ ...previous, lat, lng }));
                                }}
                            />
                        </React.Suspense>
                    ) : (
                        <div className="flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                            Cargando mapa…
                        </div>
                    )}
                    {form.lat == null && (
                        <p className="mt-1 text-xs text-amber-700">
                            Sin ubicación la propiedad no podrá entrar en las rutas optimizadas.
                        </p>
                    )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                        <label htmlFor="gateCode" className={labelClass}>
                            Código de portón / llave
                        </label>
                        <input
                            id="gateCode"
                            value={form.gateCode}
                            onChange={(event) => update('gateCode', event.target.value)}
                            className={inputClass}
                            placeholder="Ej. 1234 o candado azul"
                        />
                    </div>
                    <div>
                        <label htmlFor="accessNotes" className={labelClass}>
                            Notas de acceso
                        </label>
                        <input
                            id="accessNotes"
                            value={form.accessNotes}
                            onChange={(event) => update('accessNotes', event.target.value)}
                            className={inputClass}
                            placeholder="Ej. Entrar por la puerta lateral"
                        />
                    </div>
                </div>
            </section>

            <section className="space-y-4 border-t border-slate-100 pt-6">
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
                    La piscina
                </h2>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                        <label htmlFor="poolType" className={labelClass}>
                            Tipo de piscina
                        </label>
                        <input
                            id="poolType"
                            list="pool-types"
                            value={form.poolType}
                            onChange={(event) => update('poolType', event.target.value)}
                            className={inputClass}
                            placeholder="Rectangular, riñón…"
                        />
                        <datalist id="pool-types">
                            <option value="Rectangular" />
                            <option value="Riñón" />
                            <option value="Irregular" />
                            <option value="Infinity" />
                            <option value="Jacuzzi" />
                        </datalist>
                    </div>

                    <div>
                        <label htmlFor="volumeM3" className={labelClass}>
                            Volumen (m³)
                        </label>
                        <input
                            id="volumeM3"
                            type="number"
                            min="0"
                            step="0.1"
                            inputMode="decimal"
                            value={form.volumeM3}
                            onChange={(event) => update('volumeM3', event.target.value)}
                            className={inputClass}
                            placeholder="Ej. 32"
                        />
                    </div>

                    <div>
                        <label htmlFor="filterType" className={labelClass}>
                            Filtro
                        </label>
                        <input
                            id="filterType"
                            list="filter-types"
                            value={form.filterType}
                            onChange={(event) => update('filterType', event.target.value)}
                            className={inputClass}
                            placeholder="Arena, cartucho…"
                        />
                        <datalist id="filter-types">
                            <option value="Arena" />
                            <option value="Cartucho" />
                            <option value="Diatomeas" />
                        </datalist>
                    </div>

                    <div>
                        <label htmlFor="sanitation" className={labelClass}>
                            Sanitización
                        </label>
                        <input
                            id="sanitation"
                            list="sanitation-types"
                            value={form.sanitation}
                            onChange={(event) => update('sanitation', event.target.value)}
                            className={inputClass}
                            placeholder="Cloro, sal…"
                        />
                        <datalist id="sanitation-types">
                            <option value="Cloro" />
                            <option value="Sal" />
                            <option value="Ozono" />
                            <option value="UV" />
                            <option value="Mixto" />
                        </datalist>
                    </div>
                </div>

                <div>
                    <label htmlFor="pumpNotes" className={labelClass}>
                        Notas de bomba y equipos
                    </label>
                    <textarea
                        id="pumpNotes"
                        rows={3}
                        value={form.pumpNotes}
                        onChange={(event) => update('pumpNotes', event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                        placeholder="Ej. Bomba Hayward 1.5 HP, timer manual, válvula pegada"
                    />
                </div>
            </section>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <a
                    href={backHref}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                    Cancelar
                </a>
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-700 px-6 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? 'Guardando…' : mode === 'create' ? 'Crear propiedad' : 'Guardar cambios'}
                </button>
            </div>
        </form>
    );
}
