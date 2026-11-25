import * as React from 'react';
import { LoaderCircle, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import { listSpanishVoices, primeDeviceSpeech, refreshVoices, speakDeviceVoice } from '@/lib/device-voice';
import { piperPlayer } from '@/lib/piper-player';
import { PIPER_DOWNLOAD_MB, PIPER_LABEL } from '@/lib/piper-protocol';
import {
    DEFAULT_VOICE_SETTINGS, piperReady, readVoiceSettings, resolveVoice, selectDeviceVoice,
    transcriptDebugEnabled, voiceLabel, writeTranscriptDebug, writeVoiceSettings,
    type VoiceChoice, type VoiceSettings,
} from '@/lib/voice-settings';

const sample = 'Hola, soy Luis. Te ayudaré con las visitas y los recordatorios.';

export default function VoiceSettings() {
    const [settings, setSettings] = React.useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
    const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
    const [ready, setReady] = React.useState(false);
    const [refreshing, setRefreshing] = React.useState(false);
    const [testing, setTesting] = React.useState(false);
    const [progress, setProgress] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [debugTranscript, setDebugTranscript] = React.useState(false);
    const testRun = React.useRef(0);

    React.useEffect(() => {
        const initial = readVoiceSettings();
        setSettings(initial);
        setReady(piperReady(initial.choice));
        setVoices(listSpanishVoices());
        setDebugTranscript(transcriptDebugEnabled());
        const update = () => setVoices(listSpanishVoices());
        window.speechSynthesis?.addEventListener('voiceschanged', update);
        const onHide = () => piperPlayer.dispose();
        window.addEventListener('pagehide', onHide);
        return () => {
            window.speechSynthesis?.removeEventListener('voiceschanged', update);
            window.removeEventListener('pagehide', onHide);
            piperPlayer.stop();
        };
    }, []);

    const resolved = React.useMemo(() => resolveVoice(voices, settings), [voices, settings]);
    const missing = settings.choice === 'device' && Boolean(settings.uri || settings.name) && !resolved;
    const label = settings.choice === 'device'
        ? missing ? 'No disponible en este teléfono' : resolved ? voiceLabel(resolved) : 'Automática'
        : `${PIPER_LABEL[settings.choice]} (Piper)`;

    function choose(choice: VoiceChoice) {
        piperPlayer.stop();
        testRun.current++;
        setTesting(false);
        setProgress('');
        setNotice('');
        const next = writeVoiceSettings({ choice });
        setSettings(next);
        setReady(piperReady(choice));
    }

    function chooseDevice(uri: string) {
        if (!uri) {
            const next = writeVoiceSettings({ uri: '', name: '', lang: '' });
            setSettings(next);
            return;
        }
        const voice = voices.find((item) => item.voiceURI === uri);
        if (!voice) return;
        setSettings(selectDeviceVoice(voice));
        setNotice('');
    }

    async function updateList() {
        setRefreshing(true);
        setNotice('');
        const next = await refreshVoices();
        setVoices(next);
        setRefreshing(false);
        if (!next.length) {
            setNotice('No se encontraron voces en español. Instala una en los ajustes del teléfono y cierra la app por completo antes de reintentar.');
        }
    }

    function stopTest() {
        testRun.current++;
        piperPlayer.stop();
        setTesting(false);
        setProgress('');
    }

    function testVoice() {
        if (testing) {
            stopTest();
            return;
        }
        testRun.current++;
        const run = testRun.current;
        setTesting(true);
        setNotice('');
        if (settings.choice === 'device') {
            primeDeviceSpeech(settings);
            speakDeviceVoice(sample, settings, {
                onEnd: () => { if (testRun.current === run) setTesting(false); },
                onError: () => {
                    if (testRun.current !== run) return;
                    setTesting(false);
                    setNotice('No se pudo reproducir la voz. Revisa el volumen y que el teléfono no esté en silencio.');
                },
            });
            return;
        }
        const choice = settings.choice;
        piperPlayer.unlock();
        setProgress(ready ? 'Preparando la voz…' : `Descargando ${PIPER_LABEL[choice]}: 0 %`);
        piperPlayer.preload(choice, ({ loaded, total }) => {
            if (testRun.current !== run || !total) return;
            const percent = Math.min(100, Math.round((loaded / total) * 100));
            setProgress(`Descargando ${PIPER_LABEL[choice]}: ${percent} %`);
        }).then(() => {
            if (testRun.current !== run) return;
            setReady(true);
            setProgress('');
            piperPlayer.speak(sample, choice, {
                onEnd: () => { if (testRun.current === run) setTesting(false); },
                onError: (message) => {
                    if (testRun.current !== run) return;
                    setTesting(false);
                    setNotice(message);
                },
            });
        }).catch((reason: unknown) => {
            if (testRun.current !== run) return;
            setTesting(false);
            setProgress('');
            setNotice(reason instanceof Error ? reason.message : 'No se pudo descargar la voz.');
        });
    }

    async function clearDownload() {
        stopTest();
        await piperPlayer.clearCache();
        setReady(false);
        setNotice('Voz descargada borrada. Se volverá a descargar la próxima vez que la uses.');
    }

    return (
        <section id="voz" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">Voz de Luis</h2>
            <p className="mt-1 text-xs text-slate-500">
                Se guarda solo en este teléfono. El asistente la usa al hablar y al leer las respuestas.
            </p>

            <label htmlFor="luis-voice-choice" className="mt-4 block text-xs font-bold text-slate-700">
                Voz
            </label>
            <select
                id="luis-voice-choice"
                value={settings.choice}
                onChange={(event) => choose(event.target.value as VoiceChoice)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
                <option value="davefx">Davefx · masculina (recomendada)</option>
                <option value="carlfm">Carlfm · masculina ligera</option>
                <option value="device">Voz instalada en el teléfono</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Voz en uso: <strong className="text-slate-700">{label}</strong></p>

            {settings.choice !== 'device' && (
                <div className="mt-3 space-y-2">
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {ready
                            ? `Ya está descargada en este teléfono (≈${PIPER_DOWNLOAD_MB[settings.choice]} MB). Se genera en el teléfono, sin API de pago.`
                            : `La primera vez descarga el modelo y los recursos de voz (≈${PIPER_DOWNLOAD_MB[settings.choice]} MB). Después funciona sin volver a descargar.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={testVoice}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-bold text-white">
                            {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                            {testing ? 'Detener' : ready ? 'Probar voz' : 'Descargar y probar'}
                        </button>
                        {ready && <button type="button" onClick={() => void clearDownload()}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700">
                            <Trash2 className="h-4 w-4" /> Borrar descarga
                        </button>}
                    </div>
                    {progress && <p className="text-xs font-semibold text-sky-800">{progress}</p>}
                </div>
            )}

            {settings.choice === 'device' && (
                <div className="mt-3 space-y-2">
                    {voices.length > 0 ? (
                        <select
                            aria-label="Voz instalada en el teléfono"
                            value={resolved?.voiceURI ?? ''}
                            onChange={(event) => chooseDevice(event.target.value)}
                            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                        >
                            <option value="">Automática (masculina si existe)</option>
                            {voices.map((voice) => (
                                <option key={voice.voiceURI} value={voice.voiceURI}>{voiceLabel(voice)}</option>
                            ))}
                        </select>
                    ) : (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Este navegador no ha publicado aún las voces del teléfono. Toca «Actualizar lista».
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={testVoice}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-bold text-white">
                            {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                            {testing ? 'Detener' : 'Probar voz'}
                        </button>
                        <button type="button" onClick={() => void updateList()} disabled={refreshing}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 disabled:opacity-60">
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar lista
                        </button>
                    </div>
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Apple no permite usar las voces de Siri en aplicaciones web: si instaló una, el teléfono
                        usará otra. Para añadir una voz, ve a Ajustes → Accesibilidad → Contenido leído → Voces →
                        Español, descárgala y luego toca «Actualizar lista». Puede hacer falta cerrar y abrir la app.
                    </p>
                </div>
            )}

            {missing && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    La voz guardada ya no está en este teléfono. Elige otra de la lista.
                </p>
            )}

            <label className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <input
                    type="checkbox"
                    checked={debugTranscript}
                    onChange={(event) => {
                        setDebugTranscript(event.target.checked);
                        writeTranscriptDebug(event.target.checked);
                    }}
                    className="mt-0.5 h-4 w-4"
                />
                <span className="text-xs text-slate-600">
                    <strong className="block text-slate-700">Mostrar la frase que entiende el asistente</strong>
                    Diagnóstico opcional: el asistente muestra el texto transcrito antes de responder.
                    Se guarda solo en este teléfono.
                </span>
            </label>

            {notice && <p role="status" className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{notice}</p>}
        </section>
    );
}
