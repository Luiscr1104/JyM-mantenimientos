import * as React from 'react';
import { AlertCircle, LoaderCircle, Mic, Square, Volume2, X } from 'lucide-react';
import { voiceConfirmation } from '@/lib/voice-assistant';
import { listSpanishVoices, primeDeviceSpeech, speakDeviceVoice, speechSupported } from '@/lib/device-voice';
import { piperPlayer } from '@/lib/piper-player';
import { PIPER_DOWNLOAD_MB, PIPER_LABEL } from '@/lib/piper-protocol';
import {
    DEFAULT_VOICE_SETTINGS, piperReady, readVoiceSettings, resolveVoice, writeVoiceSettings,
    type VoiceSettings,
} from '@/lib/voice-settings';

type Answer = {
    kind: 'message' | 'preview' | 'clarification';
    message: string;
    token?: string;
    contextToken?: string;
};
type Phase = 'idle' | 'starting' | 'recording' | 'processing' | 'speaking';

const audioTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

async function postJson(url: string, body: unknown): Promise<Answer> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la solicitud.');
    return data as Answer;
}

export default function VoiceConversation() {
    const [open, setOpen] = React.useState(false);
    const [phase, setPhase] = React.useState<Phase>('idle');
    const [status, setStatus] = React.useState('');
    const [needsReplay, setNeedsReplay] = React.useState(false);
    const [hasAnswer, setHasAnswer] = React.useState(false);
    const [settings, setSettings] = React.useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
    const [deviceLabel, setDeviceLabel] = React.useState('');
    const [needsSetup, setNeedsSetup] = React.useState(false);
    const settingsRef = React.useRef<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const streamRef = React.useRef<MediaStream | null>(null);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const stopDetectorRef = React.useRef<(() => void) | null>(null);
    const deviceCancelRef = React.useRef<(() => void) | null>(null);
    const sessionRef = React.useRef(0);
    const speechRef = React.useRef(0);
    const activeRef = React.useRef(false);
    const pendingRef = React.useRef<string | null>(null);
    const contextRef = React.useRef<string | null>(null);
    const previewHeardRef = React.useRef(false);
    const lastSpokenRef = React.useRef<{ message: string; previewToken?: string; reListen: boolean } | null>(null);
    const previewSpeechRef = React.useRef<{ message: string; token: string } | null>(null);

    function stopRecording() {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        stopDetectorRef.current?.();
        stopDetectorRef.current = null;
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.onstop = null;
            recorderRef.current.stop();
        }
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }

    function stopSpeech() {
        speechRef.current++;
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
        deviceCancelRef.current?.();
        deviceCancelRef.current = null;
        piperPlayer.stop();
        window.speechSynthesis?.cancel();
    }

    function close() {
        activeRef.current = false;
        sessionRef.current++;
        pendingRef.current = null;
        contextRef.current = null;
        previewHeardRef.current = false;
        previewSpeechRef.current = null;
        stopRecording();
        stopSpeech();
        setNeedsSetup(false);
        setPhase('idle');
        setOpen(false);
    }

    React.useEffect(() => {
        const initial = readVoiceSettings();
        settingsRef.current = initial;
        setSettings(initial);
        setDeviceLabel(resolveVoice(listSpanishVoices(), initial)?.name ?? '');
        const onHidden = () => { if (document.visibilityState === 'hidden') close(); };
        const onPageHide = () => piperPlayer.dispose();
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('pagehide', onPageHide);
        return () => {
            document.removeEventListener('visibilitychange', onHidden);
            window.removeEventListener('pagehide', onPageHide);
            activeRef.current = false;
            sessionRef.current++;
            stopRecording();
            stopSpeech();
        };
    }, []);

    function primeSpeech() {
        primeDeviceSpeech(settingsRef.current);
    }

    function speak(message: string, previewToken?: string, reListen = true, visible = false) {
        lastSpokenRef.current = { message, previewToken, reListen };
        setHasAnswer(true);
        setStatus(visible ? message : '');
        stopSpeech();
        const session = sessionRef.current;
        const speechId = speechRef.current;
        const current = () => activeRef.current && sessionRef.current === session && speechRef.current === speechId;
        const finished = () => {
            if (!current()) return;
            if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
            if (previewToken && pendingRef.current === previewToken) previewHeardRef.current = true;
            setNeedsReplay(false);
            setPhase('idle');
            if (reListen && document.visibilityState === 'visible' && navigator.onLine) {
                autoTimerRef.current = setTimeout(() => {
                    if (current() && document.visibilityState === 'visible') void startRecording(false, true);
                }, 450);
            }
        };
        const failed = () => {
            if (!current()) return;
            setNeedsReplay(true);
            setPhase('idle');
        };
        setNeedsReplay(false);
        setPhase('speaking');

        if (settingsRef.current.choice !== 'device') {
            const choice = settingsRef.current.choice;
            piperPlayer.speak(message, choice, {
                onProgress: ({ loaded, total }) => {
                    if (!current() || !total) return;
                    setStatus(`Descargando la voz: ${Math.min(100, Math.round((loaded / total) * 100))} %`);
                },
                onEnd: finished,
                onError: (error) => {
                    if (!current()) return;
                    setStatus(error);
                    failed();
                },
            });
            return;
        }

        if (!speechSupported()) {
            failed();
            return;
        }
        const voices = listSpanishVoices();
        const resolved = resolveVoice(voices, settingsRef.current);
        const explicit = Boolean(settingsRef.current.uri || settingsRef.current.name);
        if (explicit && !resolved) {
            // Una preferencia guardada que desapareció no debe terminar en
            // Mónica sin avisar: mejor pedir que se elija otra voz.
            setStatus('La voz que elegiste ya no está en este teléfono. Elige otra en Ajustes o descarga la voz de Luis.');
            failed();
            return;
        }
        deviceCancelRef.current = speakDeviceVoice(message, settingsRef.current, {
            onEnd: finished,
            onError: () => failed(),
        });
    }

    /** Avisos operativos (micrófono, red): no deben disparar una descarga de 93 MB. */
    function announce(message: string) {
        const choice = settingsRef.current.choice;
        if (choice === 'device' || piperReady(choice)) {
            speak(message, undefined, false, true);
            return;
        }
        stopSpeech();
        setPhase('idle');
        setStatus(message);
    }

    function deliver(answer: Answer) {
        if (answer.kind === 'preview' && answer.token) {
            pendingRef.current = answer.token;
            contextRef.current = null;
            previewHeardRef.current = false;
            const message = `${answer.message} Si estás de acuerdo, di: sí confirmo. Para cancelar, di: cancelar.`;
            previewSpeechRef.current = { message, token: answer.token };
            speak(message, answer.token);
        } else if (answer.kind === 'clarification' && answer.contextToken) {
            pendingRef.current = null;
            contextRef.current = answer.contextToken;
            previewSpeechRef.current = null;
            speak(answer.message);
        } else {
            pendingRef.current = null;
            contextRef.current = answer.contextToken ?? null;
            previewHeardRef.current = false;
            previewSpeechRef.current = null;
            speak(answer.message);
        }
    }

    async function confirm(token: string, confirmation: string, session: number) {
        pendingRef.current = null; // Evita enviar una segunda confirmación del mismo turno.
        previewSpeechRef.current = null;
        setPhase('processing');
        setStatus('Creando visita');
        try {
            const result = await postJson('/api/panel/assistant/confirm', { token, confirmation });
            if (activeRef.current && sessionRef.current === session) deliver(result);
        } catch (reason) {
            if (activeRef.current && sessionRef.current === session) {
                speak(reason instanceof Error ? reason.message : 'No se pudo crear la visita. Vuelve a pedirla.', undefined, false, true);
            }
        }
    }

    async function handleSpeech(text: string, session: number) {
        if (!activeRef.current || sessionRef.current !== session) return;
        const token = pendingRef.current;
        if (token) {
            const decision = voiceConfirmation(text);
            if (decision === 'cancel') {
                pendingRef.current = null;
                contextRef.current = null;
                previewHeardRef.current = false;
                previewSpeechRef.current = null;
                speak('Cancelado. No se creó ninguna visita.');
            } else if (decision === 'confirm') {
                if (!previewHeardRef.current) {
                    speak('Antes de confirmar, toca el altavoz para escuchar la visita propuesta.', undefined, false, true);
                } else {
                    await confirm(token, text, session);
                }
            } else {
                speak('Para esta visita, di: sí confirmo, o: cancelar. Si deseas otra petición, cancela primero.', undefined, true, true);
            }
            return;
        }
        const contextToken = contextRef.current;
        if (contextToken && voiceConfirmation(text) === 'cancel') {
            contextRef.current = null;
            speak('De acuerdo, cancelado. Puedes hacer otra pregunta.');
            return;
        }
        setPhase('processing');
        setStatus('Consultando');
        try {
            const answer = await postJson('/api/panel/assistant/interpret', { text, ...(contextToken ? { contextToken } : {}) });
            if (activeRef.current && sessionRef.current === session) deliver(answer);
        } catch (reason) {
            if (activeRef.current && sessionRef.current === session) {
                contextRef.current = null;
                speak(reason instanceof Error ? reason.message : 'No pude entenderte. Inténtalo de nuevo.', undefined, false, true);
            }
        }
    }

    async function sendAudio(blob: Blob, mimeType: string, session: number) {
        if (!activeRef.current || sessionRef.current !== session) return;
        if (blob.size < 100 || blob.size > 2_000_000) {
            speak('La grabación quedó vacía o es demasiado larga. Vuelve a intentarlo.', undefined, false, true);
            return;
        }
        setPhase('processing');
        setStatus('Escuchando la grabación');
        try {
            const form = new FormData();
            form.append('audio', blob, mimeType.startsWith('audio/mp4') ? 'voz.m4a' :
                mimeType.startsWith('audio/ogg') ? 'voz.ogg' : 'voz.webm');
            const response = await fetch('/api/panel/assistant/transcribe', {
                method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error ?? 'No se pudo transcribir tu voz.');
            if (activeRef.current && sessionRef.current === session) await handleSpeech(data.text, session);
        } catch (reason) {
            if (activeRef.current && sessionRef.current === session) {
                speak(reason instanceof Error ? reason.message : 'No pude escuchar tu frase. Inténtalo de nuevo.', undefined, false, true);
            }
        }
    }

    function watchForSilence(stream: MediaStream, recorder: MediaRecorder, session: number) {
        const AudioContextClass = window.AudioContext;
        if (!AudioContextClass) return null;
        let audio: AudioContext;
        try { audio = new AudioContextClass(); } catch { return null; }
        if (audio.state === 'suspended') void audio.resume().catch(() => {});
        const source = audio.createMediaStreamSource(stream);
        const analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let frame = 0;
        let speechStarted = 0;
        let lastLoud = 0;
        let loudSince = 0;
        const detected = { heardSpeech: false };
        const check = () => {
            if (!activeRef.current || sessionRef.current !== session || recorder.state !== 'recording') return;
            analyser.getByteTimeDomainData(samples);
            let energy = 0;
            for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
            const loud = Math.sqrt(energy / samples.length) > 0.02;
            const now = performance.now();
            if (loud) {
                if (!loudSince) loudSince = now;
                if (!speechStarted && now - loudSince > 120) {
                    speechStarted = now;
                    detected.heardSpeech = true;
                }
                if (speechStarted) lastLoud = now;
            } else {
                loudSince = 0;
            }
            if (speechStarted && now - speechStarted > 450 && now - lastLoud > 1_300) {
                recorder.stop();
                return;
            }
            frame = requestAnimationFrame(check);
        };
        frame = requestAnimationFrame(check);
        stopDetectorRef.current = () => {
            cancelAnimationFrame(frame);
            source.disconnect();
            analyser.disconnect();
            void audio.close().catch(() => {});
        };
        return detected;
    }

    async function startRecording(preservePrime = false, automatic = false) {
        // No capturar audio mientras el dispositivo habla: evita confirmar su propia respuesta.
        if (!preservePrime) stopSpeech();
        setNeedsReplay(false);
        if (!navigator.onLine) {
            announce('Para usar el asistente de voz necesitas conexión a internet.');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            announce('Este navegador no permite grabar audio desde la aplicación.');
            return;
        }
        setPhase('starting');
        setStatus('Activando micrófono');
        const session = sessionRef.current;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!activeRef.current || sessionRef.current !== session) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;
            const mimeType = audioTypes.find((type) => MediaRecorder.isTypeSupported(type));
            if (!mimeType) throw new Error('Este teléfono no permite grabar en un formato compatible.');
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks: BlobPart[] = [];
            recorderRef.current = recorder;
            recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
            recorder.onerror = () => {
                stopRecording();
                if (activeRef.current && sessionRef.current === session) {
                    announce('La grabación falló. Inténtalo de nuevo.');
                }
            };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
                stopRecording();
                void sendAudio(blob, blob.type, session);
            };
            recorder.start();
            setPhase('recording');
            setStatus('Grabando');
            const detection = automatic ? watchForSilence(stream, recorder, session) : null;
            if (automatic && !detection) {
                stopRecording();
                setPhase('idle');
                setStatus('Toca el micrófono para hablar: este dispositivo no admite escucha automática.');
                return;
            }
            timerRef.current = setTimeout(() => {
                if (recorder.state !== 'recording') return;
                if (automatic) {
                    if (detection?.heardSpeech) recorder.stop();
                    else {
                        stopRecording();
                        setPhase('idle'); // Sin voz: no gastar cuota ni escuchar indefinidamente.
                        setStatus('Luis espera una nueva petición');
                    }
                } else recorder.stop();
            }, automatic ? 12_000 : 20_000);
        } catch (reason) {
            stopRecording();
            if (activeRef.current && sessionRef.current === session) {
                announce(reason instanceof Error && reason.name === 'NotAllowedError'
                    ? 'Permite el acceso al micrófono para esta aplicación en los ajustes del teléfono.'
                    : reason instanceof Error ? reason.message : 'No pude abrir el micrófono.');
            }
        }
    }

    function beginListening() {
        if (settingsRef.current.choice === 'device') primeSpeech();
        else piperPlayer.unlock();
        void startRecording(true);
    }

    function downloadVoice() {
        const choice = settingsRef.current.choice;
        if (choice === 'device') return;
        const session = sessionRef.current;
        piperPlayer.unlock();
        setNeedsSetup(false);
        setNeedsReplay(false);
        setPhase('starting');
        setStatus('Descargando la voz: 0 %');
        piperPlayer.preload(choice, ({ loaded, total }) => {
            if (!activeRef.current || sessionRef.current !== session || !total) return;
            setStatus(`Descargando la voz: ${Math.min(100, Math.round((loaded / total) * 100))} %`);
        }).then(() => {
            if (!activeRef.current || sessionRef.current !== session) return;
            piperPlayer.speak('Hola, soy Luis. Te ayudaré con las visitas y los recordatorios.', choice, {
                onStart: () => { if (sessionRef.current === session) setPhase('speaking'); },
                onEnd: () => { if (activeRef.current && sessionRef.current === session) void startRecording(true); },
                onError: (error) => {
                    if (!activeRef.current || sessionRef.current !== session) return;
                    setNeedsSetup(true);
                    setNeedsReplay(true);
                    setPhase('idle');
                    setStatus(error);
                },
            });
        }).catch((reason: unknown) => {
            if (!activeRef.current || sessionRef.current !== session) return;
            setNeedsSetup(true);
            setNeedsReplay(true);
            setPhase('idle');
            setStatus(reason instanceof Error ? reason.message : 'No se pudo descargar la voz.');
        });
    }

    function useDeviceVoice() {
        const next = writeVoiceSettings({ choice: 'device' });
        settingsRef.current = next;
        setSettings(next);
        setDeviceLabel(resolveVoice(listSpanishVoices(), next)?.name ?? '');
        setNeedsSetup(false);
        setStatus('');
        beginListening();
    }

    function openAssistant() {
        const initial = readVoiceSettings();
        settingsRef.current = initial;
        setSettings(initial);
        setDeviceLabel(resolveVoice(listSpanishVoices(), initial)?.name ?? '');
        activeRef.current = true;
        sessionRef.current++;
        pendingRef.current = null;
        contextRef.current = null;
        previewHeardRef.current = false;
        previewSpeechRef.current = null;
        lastSpokenRef.current = null;
        setHasAnswer(false);
        setNeedsReplay(false);
        setStatus('');
        setOpen(true);
        if (initial.choice !== 'device' && !piperReady(initial.choice)) {
            setNeedsSetup(true);
            setPhase('idle');
            return;
        }
        setNeedsSetup(false);
        beginListening();
    }

    const voiceName = settings.choice === 'device'
        ? deviceLabel || 'la del teléfono'
        : `${PIPER_LABEL[settings.choice]} (Piper)`;

    return (
        <>
            <button type="button" onClick={openAssistant}
                className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-sky-700 text-white shadow-lg hover:bg-sky-800 lg:bottom-6"
                aria-label="Hablar con Luis, asistente virtual">
                <img src="/agent.png" alt="" className="h-12 w-12 rounded-full object-cover object-top" />
            </button>
            {open && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center"
                onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
                <section role="dialog" aria-modal="true" aria-labelledby="voice-title"
                    className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
                    <h2 id="voice-title" className="sr-only">Luis, asistente virtual</h2>
                    <div className="flex justify-end">
                        <button type="button" onClick={close} aria-label="Cerrar asistente"
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="relative mx-auto my-5 h-24 w-24">
                        <img src="/agent.png" alt="Luis, asistente virtual"
                            className={`h-24 w-24 rounded-full border-4 object-cover object-top shadow-sm ${phase === 'recording' ? 'animate-pulse border-red-500' : 'border-sky-200'}`} />
                        <div aria-hidden="true" className="absolute -bottom-1 -right-1 rounded-full bg-white p-1 text-sky-700">
                            {phase === 'processing' || phase === 'starting'
                                ? <LoaderCircle className="h-7 w-7 animate-spin" />
                                : needsReplay ? <AlertCircle className="h-7 w-7 text-amber-600" />
                                    : phase === 'speaking' ? <Volume2 className="h-7 w-7" />
                                        : <Mic className="h-7 w-7" />}
                        </div>
                    </div>
                    <p className="mb-3 text-sm font-bold text-slate-800">Luis <span className="font-normal text-slate-500">· asistente virtual</span></p>

                    <div className="mx-auto mb-3 flex max-w-xs items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs">
                        <span className="text-slate-600">Voz: <strong className="text-slate-800">{voiceName}</strong></span>
                        <a href="/panel/ajustes#voz" onClick={close}
                            className="font-semibold text-sky-800 underline">Cambiar</a>
                    </div>

                    <p role="status" aria-live="polite"
                        className={`mx-auto mb-3 min-h-[1rem] max-w-xs text-xs ${needsReplay ? 'text-amber-800' : 'text-slate-600'}`}>
                        {status}
                    </p>

                    {needsSetup ? <div className="mx-auto mb-2 max-w-xs rounded-xl border border-sky-200 bg-sky-50 p-3 text-left">
                        <p className="text-xs font-bold text-sky-900">Preparar la voz masculina</p>
                        <p className="mt-1 text-xs text-slate-600">
                            Se descarga una sola vez (~{settings.choice === 'device' ? 0 : PIPER_DOWNLOAD_MB[settings.choice]} MB)
                            y queda guardada en este teléfono.
                        </p>
                        <button type="button" onClick={downloadVoice}
                            className="mt-2 w-full rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white">
                            Descargar y probar
                        </button>
                        <button type="button" onClick={useDeviceVoice}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                            Usar la voz del teléfono
                        </button>
                        <a href="/panel/ajustes#voz" onClick={close}
                            className="mt-2 block text-center text-xs font-semibold text-sky-800 underline">
                            Elegir en Ajustes
                        </a>
                    </div> : <>
                        {phase === 'idle' && !pendingRef.current && <button type="button"
                            onClick={() => {
                                if (settings.choice === 'device') primeSpeech();
                                else piperPlayer.unlock();
                                speak('Hola, soy Luis. Te ayudaré con las visitas y los recordatorios.', undefined, false);
                            }}
                            className="mb-3 rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-800">
                            Probar voz
                        </button>}
                        <div className="flex items-center justify-center gap-5 pb-4">
                            <button type="button" disabled={phase === 'processing' || phase === 'starting' || phase === 'speaking'}
                                onClick={() => phase === 'recording' ? recorderRef.current?.stop() : void startRecording()}
                                aria-label={phase === 'recording' ? 'Detener grabación' : 'Hablar de nuevo'}
                                className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-700 text-white shadow-md disabled:opacity-40">
                                {phase === 'recording' ? <Square className="h-6 w-6" aria-hidden="true" /> :
                                    <Mic className="h-7 w-7" aria-hidden="true" />}
                            </button>
                            {hasAnswer && <button type="button" disabled={phase !== 'idle'}
                                onClick={() => {
                                    const preview = previewSpeechRef.current;
                                    const last = lastSpokenRef.current;
                                    if (preview && !previewHeardRef.current) speak(preview.message, preview.token);
                                    else if (last) speak(last.message, last.previewToken, last.reListen);
                                }}
                                aria-label="Repetir respuesta en voz alta"
                                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-sky-200 text-sky-800 disabled:opacity-40">
                                <Volume2 className="h-6 w-6" aria-hidden="true" />
                            </button>}
                        </div>
                    </>}
                </section>
            </div>}
        </>
    );
}
