/**
 * Contexto y revisión de la transcripción de Whisper. Sin dependencias de
 * servidor para poder probar el prompt y los umbrales con datos reales.
 */
export type TranscriptionSegment = {
    text?: string;
    no_speech_prob?: number;
    avg_logprob?: number;
    compression_ratio?: number;
};

export type TranscriptionResult = {
    text?: unknown;
    segments?: TranscriptionSegment[];
};

export type TranscriptionAssessment =
    | { kind: 'ok'; text: string }
    | { kind: 'empty'; text: string }
    | { kind: 'unclear'; text: string };

export const TRANSCRIPTION_BASE_PROMPT =
    'Asistente de mantenimiento de piscinas en Costa Rica. Comandos: crear visita, iniciar visita, ' +
    'cerrar visita, recordatorio, cloro, bomba, filtro, productos, sí confirmo, cancelar.';

const MAX_PROMPT_LENGTH = 520;
const MAX_NAMES = 40;

/** Nombres propios del negocio: es donde Whisper falla más al dictar. */
export function buildTranscriptionPrompt(
    rows: ReadonlyArray<{ property: { alias: string }; client: { name: string } }>,
): string {
    const seen = new Set<string>();
    let prompt = TRANSCRIPTION_BASE_PROMPT;
    let added = 0;
    for (const row of rows) {
        for (const value of [row.client.name, row.property.alias]) {
            const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
            if (!clean || clean.length > 60) continue;
            const key = clean.toLocaleLowerCase('es');
            if (seen.has(key)) continue;
            seen.add(key);
            const candidate = `${prompt}${added === 0 ? ' Nombres:' : ','} ${clean}`;
            // Se corta entre nombres completos: un alias a medias confunde más que ayuda.
            if (`${candidate}.`.length > MAX_PROMPT_LENGTH) return `${prompt}.`;
            prompt = candidate;
            added++;
            if (added >= MAX_NAMES) return `${prompt}.`;
        }
    }
    return added ? `${prompt}.` : prompt;
}

const NO_SPEECH_LIMIT = 0.6;
const LOGPROB_LIMIT = -1.2;
const COMPRESSION_LIMIT = 2.4;

/**
 * Whisper puede inventar frases con silencio o ruido. `verbose_json` trae
 * señales por segmento: se descarta el silencio y se pide repetir si la
 * confianza es muy baja, en vez de crear una visita equivocada.
 */
export function reviewTranscription(result: TranscriptionResult): TranscriptionAssessment {
    const text = typeof result.text === 'string'
        ? result.text.replace(/\s+/g, ' ').trim().slice(0, 400)
        : '';
    const segments = Array.isArray(result.segments)
        ? result.segments.filter((segment): segment is TranscriptionSegment =>
            Boolean(segment) && typeof segment === 'object' && Boolean((segment.text ?? '').trim()))
        : [];
    if (!text) return { kind: 'empty', text: '' };
    if (!segments.length) return { kind: 'ok', text };

    const spoken = segments.filter((segment) => (segment.no_speech_prob ?? 0) < NO_SPEECH_LIMIT);
    if (!spoken.length) return { kind: 'empty', text };
    // No aceptar el texto completo si incluye fragmentos posiblemente inventados
    // durante el silencio (podrían cambiar un nombre o una confirmación).
    if (spoken.length !== segments.length) return { kind: 'unclear', text };

    const averageLogprob = spoken.reduce((sum, segment) => sum + (segment.avg_logprob ?? 0), 0) / spoken.length;
    const compression = Math.max(...spoken.map((segment) => segment.compression_ratio ?? 0));
    if (averageLogprob < LOGPROB_LIMIT || compression > COMPRESSION_LIMIT) {
        return { kind: 'unclear', text };
    }
    return { kind: 'ok', text };
}
