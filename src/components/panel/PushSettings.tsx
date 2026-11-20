import * as React from 'react';

function vapidBytes(value: string): Uint8Array<ArrayBuffer> {
    const padded = (value + '='.repeat((4 - value.length % 4) % 4))
        .replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export default function PushSettings({ publicKey }: { publicKey: string }) {
    const [enabled, setEnabled] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator &&
        'PushManager' in window && 'Notification' in window;

    React.useEffect(() => {
        if (!supported) return;
        void navigator.serviceWorker.ready.then(async (worker) => {
            const subscription = await worker.pushManager.getSubscription();
            setEnabled(Boolean(subscription));
            if (subscription && publicKey) {
                // Si se reasignó la cuenta destinataria, restablecemos el registro
                // del dispositivo ya autorizado sin volver a pedir permiso.
                await fetch('/api/panel/notifications/subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(subscription),
                });
            }
        }).catch(() => setMessage('No se pudo comprobar la suscripción de este dispositivo.'));
    }, [supported, publicKey]);

    async function toggle() {
        setBusy(true);
        setMessage('');
        try {
            // iOS exige pedir permiso directamente desde el gesto del usuario.
            if (!enabled && Notification.permission !== 'granted' &&
                await Notification.requestPermission() !== 'granted') {
                throw new Error('Debes permitir las notificaciones en este dispositivo.');
            }
            const worker = await navigator.serviceWorker.ready;
            if (enabled) {
                const subscription = await worker.pushManager.getSubscription();
                if (subscription) {
                    const response = await fetch('/api/panel/notifications/subscription', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint: subscription.endpoint }),
                    });
                    if (!response.ok) throw new Error('No se pudo desactivar en el servidor.');
                    await subscription.unsubscribe();
                }
                setEnabled(false);
                setMessage('Avisos desactivados en este dispositivo.');
                return;
            }
            const subscription = await worker.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidBytes(publicKey),
            });
            const response = await fetch('/api/panel/notifications/subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription),
            });
            if (!response.ok) {
                await subscription.unsubscribe();
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'No se pudo registrar el dispositivo.');
            }
            setEnabled(true);
            setMessage('Dispositivo suscrito. Los avisos dependen de que esté activo el programador.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No se pudo cambiar la suscripción.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900">Avisos en este dispositivo</h2>
            <p className="mt-2 text-xs text-slate-600">
                Recordatorios de llaves abiertas y bomba después de 30 minutos. No sustituyen una alarma
                ni verifican el estado físico. En iPhone, añade primero el panel a la pantalla de inicio.
            </p>
            {!publicKey && <p className="mt-2 text-sm text-amber-800">Faltan claves VAPID en el servidor.</p>}
            {!supported && <p className="mt-2 text-sm text-amber-800">Este navegador no admite notificaciones push.</p>}
            {supported && publicKey && (
                <button type="button" onClick={() => void toggle()} disabled={busy}
                    className="panel-btn panel-btn-secondary mt-3">
                    {busy ? 'Un momento…' : enabled ? 'Desactivar avisos' : 'Activar avisos'}
                </button>
            )}
            {message && <p role="status" className="mt-2 text-sm font-semibold text-slate-700">{message}</p>}
        </section>
    );
}
