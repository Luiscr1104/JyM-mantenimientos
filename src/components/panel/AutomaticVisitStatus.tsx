import * as React from 'react';
import { listLocal, refreshToday, syncAll } from '@/lib/automatic-visits';
import { listEncrypted } from '@/lib/offline-storage';
import { getToday } from '@/lib/dates';

export default function AutomaticVisitStatus({ userId }: { userId: string }) {
    const [pending, setPending] = React.useState(0);
    const [conflicts, setConflicts] = React.useState(0);
    const [conflictId, setConflictId] = React.useState('');
    const [ready, setReady] = React.useState(false);
    const [error, setError] = React.useState('');
    const [legacy, setLegacy] = React.useState(false);
    React.useEffect(() => {
        let active = true;
        let prepared = false;
        async function update() {
            try {
                const visits = await listLocal(userId);
                if (!active) return;
                setPending(visits.filter((visit) => visit.pending).length);
                setConflicts(visits.filter((visit) => visit.conflict).length);
                setConflictId(visits.find((visit) => visit.conflict)?.id ?? '');
                setReady(prepared || visits.length > 0);
                setLegacy((await listEncrypted()).some((entry) => entry.pending && entry.userId === userId));
            } catch { if (active) setError('El almacenamiento del teléfono no está disponible.'); }
        }
        async function connected() {
            try {
                await syncAll(userId);
                const ids = await refreshToday(userId);
                prepared = true;
                if ('serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.ready;
                    if (registration.active) {
                        const channel = new MessageChannel();
                        channel.port1.onmessage = (event) => {
                            if (active && !event.data?.ok) {
                                setError('Algunas páginas no quedaron disponibles sin internet. Abre Hoy con una conexión estable.');
                            }
                            channel.port1.close();
                        };
                        registration.active.postMessage({ type: 'prefetch-visits', ids, date: getToday() }, [channel.port2]);
                    }
                }
                if (active) setError('');
            } catch { if (active) setError('No se pudo actualizar la copia local. Verifica la conexión y el espacio disponible.'); }
            await update();
        }
        void update();
        if (navigator.onLine) void connected();
        const onOnline = () => { void connected(); };
        const onChange = () => { void update(); };
        window.addEventListener('online', onOnline);
        window.addEventListener('focus', onOnline);
        window.addEventListener('jym-visits-changed', onChange);
        const interval = window.setInterval(() => { if (navigator.onLine) void connected(); }, 60_000);
        return () => {
            active = false;
            window.removeEventListener('online', onOnline);
            window.removeEventListener('focus', onOnline);
            window.removeEventListener('jym-visits-changed', onChange);
            window.clearInterval(interval);
        };
    }, [userId]);
    return (pending > 0 || conflicts > 0 || error || !ready || legacy) ? (
        <div role="status" className={`mb-4 rounded-xl border px-3 py-2 text-sm font-semibold ${
            conflicts || error ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}>
            {conflicts > 0 ? `${conflicts} visita(s) con conflicto: conserva los cambios locales y revísalos.` :
                pending > 0 ? `${pending} visita(s) pendiente(s) de sincronizar. Se reintentará automáticamente.` :
                    error || 'Abre el panel con internet para preparar las visitas de hoy automáticamente.'}
            {conflictId && <a href={`/panel/visitas/${conflictId}`} className="ml-2 underline">Revisar visita →</a>}
            {legacy && <a href="/panel/sin-conexion" className="ml-2 underline">
                Hay cierres del sistema anterior con PIN; ábrelos para sincronizarlos antes de cerrar sesión.
            </a>}
        </div>
    ) : null;
}
