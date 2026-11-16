import * as React from 'react';

interface ClientData {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    status: 'active' | 'inactive';
}

interface Props {
    mode?: 'create' | 'edit';
    client?: ClientData;
}

const inputClass =
    'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100';
const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-700';

export default function ClientForm({ mode = 'create', client }: Props) {
    const [form, setForm] = React.useState({
        name: client?.name ?? '',
        phone: client?.phone ?? '',
        email: client?.email ?? '',
        notes: client?.notes ?? '',
        status: client?.status ?? ('active' as 'active' | 'inactive'),
    });
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
        setForm((previous) => ({ ...previous, [key]: value }));
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError('');

        try {
            const endpoint =
                mode === 'create' ? '/api/panel/clients' : `/api/panel/clients/${client?.id}`;
            const response = await fetch(endpoint, {
                method: mode === 'create' ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error ?? 'No se pudo guardar el cliente.');
                setSaving(false);
                return;
            }

            window.location.assign(`/panel/clientes/${data.id ?? client?.id}`);
        } catch {
            setError('Error de conexión. Intenta de nuevo.');
            setSaving(false);
        }
    }

    const backHref = mode === 'edit' && client ? `/panel/clientes/${client.id}` : '/panel/clientes';

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                >
                    {error}
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label htmlFor="name" className={labelClass}>
                        Nombre del cliente *
                    </label>
                    <input
                        id="name"
                        required
                        value={form.name}
                        onChange={(event) => update('name', event.target.value)}
                        className={inputClass}
                        placeholder="Ej. María Rodríguez"
                    />
                </div>

                <div>
                    <label htmlFor="phone" className={labelClass}>
                        Teléfono / WhatsApp
                    </label>
                    <input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(event) => update('phone', event.target.value)}
                        className={inputClass}
                        placeholder="+506 8888 8888"
                    />
                </div>

                <div>
                    <label htmlFor="email" className={labelClass}>
                        Correo
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(event) => update('email', event.target.value)}
                        className={inputClass}
                        placeholder="cliente@correo.com"
                    />
                </div>

                <div>
                    <label htmlFor="status" className={labelClass}>
                        Estado
                    </label>
                    <select
                        id="status"
                        value={form.status}
                        onChange={(event) =>
                            update('status', event.target.value as 'active' | 'inactive')
                        }
                        className={inputClass}
                    >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                    </select>
                </div>

                <div className="sm:col-span-2">
                    <label htmlFor="notes" className={labelClass}>
                        Notas
                    </label>
                    <textarea
                        id="notes"
                        value={form.notes}
                        onChange={(event) => update('notes', event.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                        placeholder="Preferencias de horario, forma de pago, detalles importantes…"
                    />
                </div>
            </div>

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
                    {saving ? 'Guardando…' : mode === 'create' ? 'Crear cliente' : 'Guardar cambios'}
                </button>
            </div>
        </form>
    );
}
