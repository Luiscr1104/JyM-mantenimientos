import * as React from 'react';

function vapidBytes(value: string): Uint8Array<ArrayBuffer> {
    const padded = (value + '='.repeat((4 - value.length % 4) % 4))
        .replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function activeWorker(): Promise<ServiceWorkerRegistration> {
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => window.setTimeout(() =>
            reject(new Error('No se pudo activar el servicio de avisos. Reabre el panel con internet.')), 12_000)),
    ]);
}

async function post(url: string, body: unknown, method = 'POST') {
    const response = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo contactar al servicio de avisos.');
    return data;
}

export default function PushSettings({ publicKey }: { publicKey: string }) {
    const [subscription, setSubscription] = React.useState<PushSubscription | null>(null);
    const [enabled, setEnabled] = React.useState(false);
    const [checking, setChecking] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [cronLastRun, setCronLastRun] = React.useState<string | null>(null);
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator &&
        'PushManager' in window && 'Notification' in window;

    React.useEffect(() => {
        if (!supported || !publicKey) { setChecking(false); return; }
        let active = true;
        void (async () => {
            try {
                const worker = await activeWorker();
                const current = await worker.pushManager.getSubscription();
                const status = await post('/api/panel/notifications/status', { endpoint: current?.endpoint });
                if (!active) return;
                setSubscription(current);
                setEnabled(Boolean(current && status.registered));
                setCronLastRun(typeof status.cronLastRun === 'string' ? status.cronLastRun : null);
                if (current && !status.registered) {
                    setMessage('Este teléfono tiene permiso, pero aún no está registrado para esta cuenta. Pulsa «Activar avisos».');
                } else if (current && status.registered && Notification.permission !== 'granted') {
                    setMessage('El registro existe, pero los permisos del navegador están bloqueados. Puedes desactivarlo aquí.');
                }
            } catch (error) {
                if (active) setMessage(error instanceof Error ? error.message : 'No se pudo comprobar este teléfono.');
            } finally {
                if (active) setChecking(false);
            }
        })();
        return () => { active = false; };
    }, [supported, publicKey]);

    async function toggle() {
        if (busy) return;
        setBusy(true);
        setMessage('');
        try {
            if (!enabled && Notification.permission !== 'granted' &&
                await Notification.requestPermission() !== 'granted') {
                throw new Error('Permite las notificaciones en los ajustes de este teléfono.');
            }
            const worker = await activeWorker();
            const current = await worker.pushManager.getSubscription();
            if (enabled) {
                if (current) {
                    await post('/api/panel/notifications/subscription', {
                        endpoint: current.endpoint,
                    }, 'DELETE');
                    await current.unsubscribe();
                }
                setSubscription(null);
                setEnabled(false);
                setMessage('Avisos desactivados solo en este teléfono. Los demás dispositivos continúan activos.');
                return;
            }
            // Un endpoint local sin registro en el servidor puede haber expirado
            // o pertenecer a una sesión anterior. Renovarlo antes de vincularlo.
            if (current) await current.unsubscribe();
            const next = await worker.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidBytes(publicKey),
            });
            try {
                await post('/api/panel/notifications/subscription', next.toJSON());
            } catch (error) {
                await next.unsubscribe();
                throw error;
            }
            setSubscription(next);
            setEnabled(true);
            setMessage('Avisos activos en este teléfono. Los demás dispositivos autorizados también pueden recibir el mismo recordatorio.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No se pudo cambiar la suscripción.');
        } finally {
            setBusy(false);
        }
    }

    async function testNotification() {
        if (!subscription || busy) return;
        setBusy(true);
        setMessage('');
        try {
            await post('/api/panel/notifications/test', { endpoint: subscription.endpoint });
            setMessage('Prueba aceptada por el servicio push. Comprueba si aparece en este teléfono; la aceptación no garantiza su visualización.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No se pudo enviar la prueba.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900">Avisos en este dispositivo</h2>
            <p className="mt-2 text-xs text-slate-600">
                Llaves al vencer el plazo indicado y bombas tras 30 minutos. Cada cuenta activa sus propios teléfonos.
                Los avisos no sustituyen una alarma ni verifican el estado físico. En iPhone, instala primero el panel.
            </p>
            {supported && publicKey && !checking && <p className={`mt-2 text-xs font-semibold ${
                cronLastRun && Date.now() - new Date(cronLastRun).getTime() < 5 * 60_000
                    ? 'text-emerald-800' : 'text-amber-800'
            }`}>{cronLastRun && Date.now() - new Date(cronLastRun).getTime() < 5 * 60_000
                    ? 'Programador activo · comprobación reciente.'
                    : 'No se ha comprobado una ejecución reciente del programador. Las pruebas inmediatas no verifican los recordatorios.'}</p>}
            {!publicKey && <p className="mt-2 text-sm text-amber-800">Faltan claves VAPID en el servidor.</p>}
            {!supported && <p className="mt-2 text-sm text-amber-800">Este navegador no admite notificaciones push.</p>}
            {supported && publicKey && (
                <>
                    <p role="status" className={`mt-3 text-sm font-bold ${
                        enabled && Notification.permission === 'granted' ? 'text-emerald-800' : 'text-amber-800'
                    }`}>{checking ? 'Comprobando permiso y registro…' :
                        enabled && Notification.permission === 'granted' ? 'Activo y registrado en este dispositivo' :
                            enabled ? 'Registrado, pero sin permiso de notificaciones' : 'No activo en este dispositivo'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void toggle()} disabled={busy || checking}
                            className="panel-btn panel-btn-secondary">
                            {busy ? 'Un momento…' : enabled ? 'Desactivar en este teléfono' : 'Activar avisos'}
                        </button>
                        {enabled && Notification.permission === 'granted' &&
                            <button type="button" onClick={() => void testNotification()} disabled={busy}
                            className="panel-btn panel-btn-primary">Enviar prueba a este teléfono</button>}
                    </div>
                </>
            )}
            {message && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
        </section>
    );
}
