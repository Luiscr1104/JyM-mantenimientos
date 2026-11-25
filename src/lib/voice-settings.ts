import { preferredSpanishVoice } from './voice-preferences';

export type VoiceChoice = 'davefx' | 'carlfm' | 'device';

export type VoiceSettings = {
    choice: VoiceChoice;
    uri: string;
    name: string;
    lang: string;
};

export type VoiceLike = { voiceURI: string; name: string; lang: string };

const CHOICE_KEY = 'jym-voice-choice';
const URI_KEY = 'jym-voice-uri';
const NAME_KEY = 'jym-voice-name';
const LANG_KEY = 'jym-voice-lang';
const READY_KEY = 'jym-piper-ready';
const CHOICES: VoiceChoice[] = ['davefx', 'carlfm', 'device'];

// Davefx es la voz masculina por defecto en todos los teléfonos.
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
    choice: 'davefx',
    uri: '',
    name: '',
    lang: '',
};

export function isSpanishVoice(voice: { lang: string }): boolean {
    return /^es(?:-|$)/i.test(voice.lang);
}

export function spanishVoices<T extends { lang: string }>(voices: T[]): T[] {
    return voices.filter(isSpanishVoice);
}

export function readVoiceSettings(): VoiceSettings {
    try {
        const saved = localStorage.getItem(CHOICE_KEY);
        const choice = CHOICES.includes(saved as VoiceChoice) ? saved as VoiceChoice : DEFAULT_VOICE_SETTINGS.choice;
        return {
            choice,
            uri: localStorage.getItem(URI_KEY) ?? '',
            name: localStorage.getItem(NAME_KEY) ?? '',
            lang: localStorage.getItem(LANG_KEY) ?? '',
        };
    } catch {
        return { ...DEFAULT_VOICE_SETTINGS };
    }
}

export function writeVoiceSettings(patch: Partial<VoiceSettings>): VoiceSettings {
    const next = { ...readVoiceSettings(), ...patch };
    try {
        localStorage.setItem(CHOICE_KEY, next.choice);
        const values: Array<[string, string]> = [
            [URI_KEY, next.uri], [NAME_KEY, next.name], [LANG_KEY, next.lang],
        ];
        for (const [key, value] of values) {
            if (value) localStorage.setItem(key, value);
            else localStorage.removeItem(key);
        }
    } catch { /* Sin almacenamiento. */ }
    return next;
}

export function selectDeviceVoice(voice: VoiceLike): VoiceSettings {
    return writeVoiceSettings({
        choice: 'device', uri: voice.voiceURI, name: voice.name, lang: voice.lang,
    });
}

/**
 * Resuelve la voz guardada sin caer en Mónica en silencio: si hay una
 * preferencia explícita y ya no existe en el teléfono, devuelve undefined.
 */
export function resolveVoice<T extends VoiceLike>(voices: T[], settings: VoiceSettings): T | undefined {
    const available = spanishVoices(voices);
    const explicit = Boolean(settings.uri || settings.name);
    if (settings.uri) {
        const byUri = available.find((voice) => voice.voiceURI === settings.uri);
        if (byUri) return byUri;
    }
    if (settings.name) {
        const byName = available.find((voice) => voice.name === settings.name &&
            (!settings.lang || voice.lang.toLowerCase() === settings.lang.toLowerCase()));
        if (byName) return byName;
        const loose = available.find((voice) => voice.name === settings.name);
        if (loose) return loose;
    }
    if (explicit) return undefined;
    return preferredSpanishVoice(available) ?? available[0];
}

export function fallbackVoice<T extends VoiceLike>(voices: T[]): T | undefined {
    const available = spanishVoices(voices);
    return preferredSpanishVoice(available) ?? available[0];
}

export function voiceLabel(voice: { name: string; lang: string }): string {
    return `${voice.name} (${voice.lang})`;
}

// Marca de "ya se descargó al menos una vez". Si iOS borra el caché, el
// reproductor vuelve a descargar y muestra el progreso igualmente.
export function piperReady(choice: VoiceChoice): boolean {
    try {
        return choice !== 'device' && localStorage.getItem(READY_KEY) === choice;
    } catch {
        return false;
    }
}

export function markPiperReady(choice: VoiceChoice): void {
    if (choice === 'device') return;
    try {
        localStorage.setItem(READY_KEY, choice);
    } catch { /* Sin almacenamiento. */ }
}

export function clearPiperReady(): void {
    try {
        localStorage.removeItem(READY_KEY);
    } catch { /* Sin almacenamiento. */ }
}
