// SpeechSynthesisVoice no expone género: usar nombres conocidos y permitir elegir manualmente.
const MALE_NAMES = /\b(jorge|juan|diego|carlos|pablo|alvaro|álvaro|raul|raúl|federico|miguel|antonio|enrique|mateo)\b/i;

export function preferredSpanishVoice<T extends { lang: string; name: string }>(voices: T[]): T | undefined {
    const spanish = voices.filter(({ lang }) => /^es(?:-|$)/i.test(lang));
    return spanish.find(({ name, lang }) => lang.toLowerCase() === 'es-cr' && MALE_NAMES.test(name)) ??
        spanish.find(({ name }) => MALE_NAMES.test(name));
}
