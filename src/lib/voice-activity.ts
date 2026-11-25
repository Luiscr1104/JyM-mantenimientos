/**
 * Decide cuándo termina una frase hablada. Es lógica pura para poder probarla
 * sin micrófono: el componente solo le entrega el nivel RMS y el tiempo.
 */
export type VoiceActivityOptions = {
    /** Nivel RMS a partir del cual se considera que hay voz. */
    threshold?: number;
    /** Tiempo seguido por encima del umbral para dar por iniciada la voz. */
    speechStartMs?: number;
    /** Voz mínima antes de aceptar un corte por silencio. */
    minSpeechMs?: number;
    /** Silencio seguido que cierra la frase. */
    silenceMs?: number;
    /** Margen inicial: un ruido al abrir el micrófono no debe cortar la espera. */
    graceMs?: number;
};

export type VoiceDecision = 'listen' | 'finish';

export const VOICE_THRESHOLD = 0.02;
export const SPEECH_START_MS = 120;
export const MIN_SPEECH_MS = 450;
export const SILENCE_MS = 1_300;
export const GRACE_MS = 1_200;

export type VoiceActivity = {
    /** La frase ya tuvo voz suficiente para enviarse. */
    readonly heardSpeech: boolean;
    /** Muestras del analizador recibidas. 0 indica que el audio no llegó. */
    readonly frames: number;
    update(rms: number, now: number): VoiceDecision;
    /**
     * Al llegar al tope de grabación: solo se descarta si el analizador
     * funcionó y de verdad no hubo voz. Sin muestras, se envía para no perder
     * la primera frase (típico de un AudioContext suspendido en iOS).
     */
    canSendOnTimeout(unavailable?: boolean): boolean;
};

export function createVoiceActivity(options: VoiceActivityOptions = {}): VoiceActivity {
    const threshold = options.threshold ?? VOICE_THRESHOLD;
    const speechStartMs = options.speechStartMs ?? SPEECH_START_MS;
    const minSpeechMs = options.minSpeechMs ?? MIN_SPEECH_MS;
    const silenceMs = options.silenceMs ?? SILENCE_MS;
    const graceMs = options.graceMs ?? GRACE_MS;

    let frames = 0;
    let firstAt = 0;
    let loudSince: number | null = null;
    let speechStarted: number | null = null;
    let lastLoud = 0;
    let heardSpeech = false;

    return {
        get heardSpeech() { return heardSpeech; },
        get frames() { return frames; },
        update(rms: number, now: number): VoiceDecision {
            if (!frames) firstAt = now;
            frames++;
            const loud = Number.isFinite(rms) && rms > threshold;
            if (loud) {
                if (loudSince === null) loudSince = now;
                if (speechStarted === null && now - loudSince >= speechStartMs) {
                    speechStarted = now;
                    heardSpeech = true;
                    lastLoud = now;
                }
                if (speechStarted !== null) lastLoud = now;
            } else {
                loudSince = null;
            }
            if (speechStarted !== null &&
                now - firstAt >= graceMs &&
                now - speechStarted >= minSpeechMs &&
                now - lastLoud >= silenceMs) return 'finish';
            return 'listen';
        },
        canSendOnTimeout(unavailable = false): boolean {
            return unavailable || frames === 0 || heardSpeech;
        },
    };
}
