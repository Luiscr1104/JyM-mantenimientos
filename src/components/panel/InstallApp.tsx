import * as React from 'react';

interface InstallPrompt extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallApp() {
    const [prompt, setPrompt] = React.useState<InstallPrompt | null>(null);
    const [installed, setInstalled] = React.useState(false);

    React.useEffect(() => {
        setInstalled(window.matchMedia('(display-mode: standalone)').matches ||
            ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true));
        const available = (event: Event) => {
            event.preventDefault();
            setPrompt(event as InstallPrompt);
        };
        const onInstalled = () => { setInstalled(true); setPrompt(null); };
        window.addEventListener('beforeinstallprompt', available);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', available);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900">Instalar panel en el teléfono</h2>
            {installed ? <p className="mt-2 text-sm text-emerald-800">La PWA ya está abierta como aplicación.</p> : (
                <>
                    <p className="mt-2 text-sm text-slate-600">
                        En iPhone, abre esta página en Safari y usa Compartir → Añadir a pantalla de inicio.
                        En Android, usa el botón o el menú del navegador → Instalar aplicación.
                    </p>
                    {prompt && <button type="button" className="panel-btn panel-btn-primary mt-3"
                        onClick={() => {
                            void prompt.prompt().then(() => prompt.userChoice).then((choice) => {
                                if (choice.outcome === 'accepted') setPrompt(null);
                            });
                        }}>Instalar aplicación</button>}
                </>
            )}
        </section>
    );
}
