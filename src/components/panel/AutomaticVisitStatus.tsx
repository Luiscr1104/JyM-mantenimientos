import * as React from 'react';
import { listLocal, refreshToday, syncAll } from '@/lib/automatic-visits';
import { listEncrypted } from '@/lib/offline-storage';
import { getToday } from '@/lib/dates';

const REFRESH_INTERVAL = 5 * 60_000;
const PREFETCH_INTERVAL = 15 * 60_000;

function readStamp(key: string): number {
    try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}

function writeStamp(key: string, value: number) {
    try { localStorage.setItem(key, String(value)); } catch { /* El almacenamiento puede estar desactivado. */ }
}

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
        let running = false;
        let lastAttempt = 0;
        let lastRefresh = 0;
        let lastPrefetch = 0;
        const refreshKey = `jym-auto-refresh-${userId}`;
        const prefetchKey = `jym-auto-prefetch-${userId}`;
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
        async function connected(force = false) {
            if (!userId || !navigator.onLine || document.hidden || running ||
                (!force && Date.now() - lastAttempt < 60_000)) return;
            running = true;
            lastAttempt = Date.now();
            try {
                const prepare = async () => {
                    await syncAll(userId);
                    if (!force && Date.now() - Math.max(lastRefresh, readStamp(refreshKey)) < REFRESH_INTERVAL) {
                        prepared = true;
                        if (active) setError('');
                        return;
                    }
                    const ids = await refreshToday(userId);
                    prepared = true;
                    lastRefresh = Date.now();
                    writeStamp(refreshKey, lastRefresh);
                    if (active) setError('');

                    if (!('serviceWorker' in navigator)) return;
                    // No esperar indefinidamente a un service worker que no pudo instalarse.
                    const registration = await navigator.serviceWorker.getRegistration('/panel');
                    if (!registration?.active) return;
                    const snapshot = JSON.stringify({ date: getToday(), ids });
                    const previous = (() => {
                        try { return JSON.parse(localStorage.getItem(prefetchKey) ?? 'null') as {
                            snapshot: string; at: number;
                        } | null; } catch { return null; }
                    })();
                    if (previous?.snapshot === snapshot &&
                        Date.now() - Math.max(lastPrefetch, previous.at) < PREFETCH_INTERVAL) return;
                    const channel = new MessageChannel();
                    channel.port1.onmessage = (event) => {
                        if (event.data?.ok) {
                            lastPrefetch = Date.now();
                            try {
                                localStorage.setItem(prefetchKey, JSON.stringify({ snapshot, at: lastPrefetch }));
                            } catch { /* La caché del navegador sigue disponible. */ }
                        } else if (active) {
                            setError('Algunas páginas no quedaron disponibles sin internet. Abre Hoy con una conexión estable.');
                        }
                        channel.port1.close();
                    };
                    registration.active.postMessage({ type: 'prefetch-visits', ids, date: getToday() }, [channel.port2]);
                };
                if (navigator.locks) {
                    await navigator.locks.request(`jym-auto-refresh-${userId}`, { ifAvailable: true },
                        async (lock) => { if (lock) await prepare(); });
                } else {
                    await prepare();
                }
            } catch (reason) {
                console.warn('[offline.refresh]', reason);
                if (active) setError(`No se pudo actualizar la copia local. ${
                    reason instanceof Error ? reason.message : 'Verifica la conexión y el espacio disponible.'
                }`);
            } finally {
                running = false;
                await update();
            }
        }
        void update();
        if (navigator.onLine) void connected();
        const onOnline = () => { void connected(true); };
        const onFocus = () => { void connected(); };
        const onChange = () => { void update(); };
        window.addEventListener('online', onOnline);
        window.addEventListener('focus', onFocus);
        window.addEventListener('jym-visits-changed', onChange);
        const interval = window.setInterval(() => { void connected(); }, 60_000);
        return () => {
            active = false;
            window.removeEventListener('online', onOnline);
            window.removeEventListener('focus', onFocus);
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
