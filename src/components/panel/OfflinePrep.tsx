import * as React from 'react';
import { listEncrypted, readEncrypted, saveEncrypted } from '@/lib/offline-storage';
import type { OfflineVisit } from '@/lib/offline-visit';

export default function OfflinePrep() {
    const [pin, setPin] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');

    async function prepare(event: React.FormEvent) {
        event.preventDefault();
        if (pin.length < 8) return;
        setBusy(true);
        setMessage('');
        try {
            if (!crypto.subtle || !indexedDB || !('serviceWorker' in navigator)) {
                throw new Error('Este dispositivo no permite guardar visitas offline de forma segura.');
            }
            const response = await fetch('/api/panel/offline/prepare', { cache: 'no-store' });
            if (!response.ok) throw new Error('Inicia sesión y vuelve a intentar la descarga.');
            const data = await response.json() as { userId: string; visits: OfflineVisit[] };
            const existing = await listEncrypted();
            if (existing.some((entry) => entry.userId !== data.userId)) {
                throw new Error('Hay datos de otra cuenta en el dispositivo. Cierra sesión para borrarlos.');
            }
            if (existing.length) {
                try { await readEncrypted(existing[0], pin); } catch {
                    throw new Error('PIN incorrecto. Usa el mismo PIN para las visitas ya descargadas.');
                }
            }
            for (const visit of data.visits) {
                if (existing.some((entry) => entry.id === visit.id && entry.pending)) continue;
                await saveEncrypted(visit, data.userId, pin);
            }
            await navigator.serviceWorker.register('/sw.js', { scope: '/panel' });
            await navigator.serviceWorker.ready;
            // La primera visita a esta pantalla guarda también su HTML sin datos privados
            // y los recursos React/CSS necesarios para abrirla sin red después.
            window.location.assign('/panel/sin-conexion');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No se pudieron preparar las visitas.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-extrabold text-slate-900">Preparar visitas sin conexión</h2>
            <p className="mt-1 text-xs text-slate-600">
                Descarga las visitas de hoy antes de salir. Luego se abrirá la pantalla offline.
                Un PIN de al menos 8 caracteres cifra los datos
                en este dispositivo. Recuérdalo: sin él no podrás recuperar las visitas guardadas.
                No se reemplazan trabajos pendientes de sincronizar.
            </p>
            <form onSubmit={(event) => void prepare(event)} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-sm font-semibold">
                    PIN local
                    <input type="password" minLength={8} required value={pin}
                        onChange={(event) => setPin(event.target.value)} autoComplete="off"
                        className="mt-1 block h-11 w-48 rounded-xl border border-slate-300 px-3" />
                </label>
                <button type="submit" disabled={busy} className="panel-btn panel-btn-primary">
                    {busy ? 'Descargando…' : 'Descargar visitas de hoy'}
                </button>
            </form>
            {message && <p role="status" className="mt-2 text-sm font-semibold text-slate-700">{message}</p>}
            <a href="/panel/sin-conexion" className="mt-3 inline-block font-bold text-sky-800 underline">
                Abrir visitas sin conexión →
            </a>
        </section>
    );
}
