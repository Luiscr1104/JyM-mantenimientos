import { fallbackVoice, resolveVoice, type VoiceSettings } from './voice-settings';

type DeviceHandlers = {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
};

export function speechSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function listSpanishVoices(): SpeechSynthesisVoice[] {
    if (!speechSupported()) return [];
    return window.speechSynthesis.getVoices().filter(({ lang }) => /^es(?:-|$)/i.test(lang));
}

/**
 * iOS tarda en publicar las voces nuevas y a veces no dispara `voiceschanged`.
 * Se despierta la síntesis con un gesto y se reintenta la lista varias veces.
 */
export async function refreshVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!speechSupported()) return [];
    const synth = window.speechSynthesis;
    try {
        synth.cancel();
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0;
        synth.speak(silent);
    } catch { /* Si iOS lo bloquea, la lista que ya existe sirve. */ }
    let latest = listSpanishVoices();
    for (let attempt = 0; attempt < 7; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const current = listSpanishVoices();
        if (current.length >= latest.length) latest = current;
    }
    return latest;
}

export function primeDeviceSpeech(settings: VoiceSettings): void {
    if (!speechSupported()) return;
    try {
        const synth = window.speechSynthesis;
        synth.cancel();
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0;
        const voice = resolveVoice(listSpanishVoices(), settings);
        if (voice) {
            silent.voice = voice;
            silent.lang = voice.lang;
        }
        synth.speak(silent);
    } catch { /* El botón de repetir permite otro gesto. */ }
}

/** Habla con una voz instalada en el teléfono y devuelve una función para cancelar. */
export function speakDeviceVoice(text: string, settings: VoiceSettings, handlers: DeviceHandlers): () => void {
    if (!speechSupported()) {
        handlers.onError?.();
        return () => {};
    }
    const synth = window.speechSynthesis;
    const voices = listSpanishVoices();
    const voice = resolveVoice(voices, settings) ?? fallbackVoice(voices);
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'es-ES';
    utterance.rate = 0.94;
    let done = false;
    let started = false;
    const timer = setTimeout(() => {
        if (started || done) return;
        done = true;
        try { synth.cancel(); } catch { /* Ya terminó. */ }
        handlers.onError?.();
    }, 6_000);
    utterance.onstart = () => { started = true; };
    utterance.onend = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        handlers.onEnd?.();
    };
    utterance.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        handlers.onError?.();
    };
    try {
        synth.resume();
        synth.speak(utterance);
    } catch {
        done = true;
        clearTimeout(timer);
        handlers.onError?.();
    }
    return () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { synth.cancel(); } catch { /* Ya terminó. */ }
    };
}
