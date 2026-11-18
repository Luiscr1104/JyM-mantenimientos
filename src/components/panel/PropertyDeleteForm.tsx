import * as React from 'react';

interface Props {
    propertyId: string;
    clientId: string;
    clientName: string;
    alias: string;
    address: string;
    scheduledVisits: number;
    issue: string | null;
}

export default function PropertyDeleteForm({
    propertyId, clientId, clientName, alias, address, scheduledVisits, issue,
}: Props) {
    const [open, setOpen] = React.useState(false);
    const [confirmation, setConfirmation] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');

    async function remove(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || confirmation !== 'ELIMINAR') return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`/api/panel/properties/${propertyId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, confirmation }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error ?? 'No se pudo eliminar la propiedad.');
            window.location.assign(`/panel/clientes/${clientId}?ok=property-deleted`);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Error de conexión.');
            setBusy(false);
        }
    }

    return (
        <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900">Eliminar propiedad duplicada</h2>
            {issue ? (
                <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    {issue}
                </p>
            ) : (
                <>
                    <p className="mt-2 text-sm text-slate-600">
                        Solo se eliminará esta propiedad. El cliente y sus otras propiedades permanecerán.
                    </p>
                    <button type="button" onClick={() => setOpen((previous) => !previous)}
                        className="panel-btn panel-btn-danger mt-4">
                        {open ? 'Cancelar' : 'Eliminar esta propiedad…'}
                    </button>
                    {open && (
                        <form onSubmit={remove} className="mt-4 space-y-4 rounded-xl border border-red-300 bg-red-50 p-4">
                            <p className="text-sm font-semibold text-red-900">
                                Vas a eliminar <strong>{alias}</strong> · {address}, del cliente <strong>{clientName}</strong>.
                            </p>
                            <p className="text-sm text-red-900">
                                Se eliminarán su frecuencia y {scheduledVisits}{' '}
                                {scheduledVisits === 1 ? 'visita programada sin trabajo registrado' :
                                    'visitas programadas sin trabajo registrado'}.
                                Esta acción no se puede deshacer.
                            </p>
                            <label className="block text-sm font-semibold text-slate-800">
                                Escribe ELIMINAR para confirmar
                                <input type="text" autoComplete="off" value={confirmation}
                                    onChange={(event) => setConfirmation(event.target.value)}
                                    className="mt-2 h-12 w-full rounded-xl border border-red-300 bg-white px-3 text-base" />
                            </label>
                            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
                            <button type="submit" disabled={busy || confirmation !== 'ELIMINAR'}
                                className="panel-btn w-full bg-red-700 text-white hover:bg-red-800 sm:w-auto">
                                {busy ? 'Eliminando…' : 'Eliminar propiedad definitivamente'}
                            </button>
                        </form>
                    )}
                </>
            )}
        </section>
    );
}
