import { addDays, getToday, isValidDate, weekdayIndex } from './dates';
import type { ReadAction } from './assistant-visit-read';

export type VoiceIntent = {
    action: 'create_visit' | 'chlorine_history' | 'start_visit' | 'complete_visit' | 'create_reminder' | ReadAction | 'unsupported';
    target: string;
    period: 'today' | 'visit_date' | 'this_week' | 'last_week' | 'weeks_ago' | 'week_of' |
        'previous' | 'latest' | 'this_month' | 'last_month' | 'unsupported';
    workType: 'routine' | 'unsupported';
    weeksAgo: number;
    anchorDate: string;
};

export function weekContaining(date: string) {
    const monday = addDays(date, -((weekdayIndex(date) + 6) % 7));
    return { from: monday, to: addDays(monday, 6) };
}

export function lastWeek(today = getToday()) {
    return weekContaining(addDays(today, -7));
}

export function requestedWeek(intent: VoiceIntent, today = getToday()) {
    switch (intent.period) {
        case 'this_week': return weekContaining(today);
        case 'last_week': return lastWeek(today);
        case 'weeks_ago':
            if (!Number.isInteger(intent.weeksAgo) || intent.weeksAgo < 0 || intent.weeksAgo > 520) return null;
            return weekContaining(addDays(today, -7 * intent.weeksAgo));
        case 'week_of':
            if (!isValidDate(intent.anchorDate) || intent.anchorDate > today) return null;
            return weekContaining(intent.anchorDate);
        default: return null;
    }
}

function spokenParts(date: string) {
    const parts = new Intl.DateTimeFormat('es-CR', {
        timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
    }).formatToParts(new Date(`${date}T12:00:00Z`));
    return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function spokenDate(date: string, today = getToday()) {
    const { weekday, day, month } = spokenParts(date);
    return `${weekday} ${day} de ${month}${date.slice(0, 4) !== today.slice(0, 4) ? ` de ${date.slice(0, 4)}` : ''}`;
}

export function spokenWeek(from: string, to: string, today = getToday()) {
    const start = spokenParts(from);
    const end = spokenParts(to);
    if (from.slice(0, 7) === to.slice(0, 7)) {
        return `del ${start.weekday} ${start.day} al ${end.weekday} ${end.day} de ${end.month}` +
            (to.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${to.slice(0, 4)}`);
    }
    return `del ${spokenDate(from, today)} al ${spokenDate(to, today)}`;
}

const MONTHS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

export type VisitDateResult =
    | { date: string; reason?: never }
    | { date?: never; reason: 'missing' | 'ambiguous' | 'past' | 'invalid' | 'year' };

// La fecha de escritura se deriva de la frase real, nunca de una fecha inventada por el modelo.
export function requestedVisitDate(text: string, today = getToday()): VisitDateResult {
    const phrase = normalizeName(text);
    const dayPhrase = phrase.replace(/\b(?:por|en|de) la manana\b/g, '');
    const options: VisitDateResult[] = [];
    if (/\bpasado manana\b/.test(dayPhrase)) options.push({ date: addDays(today, 2) });
    else if (/\bmanana\b/.test(dayPhrase)) options.push({ date: addDays(today, 1) });
    if (/\bhoy\b/.test(phrase)) options.push({ date: today });

    const daysAhead = phrase.match(/\ben (\d{1,3}) dias?\b/);
    if (daysAhead) options.push(Number(daysAhead[1]) > 0 && Number(daysAhead[1]) <= 365
        ? { date: addDays(today, Number(daysAhead[1])) } : { reason: 'invalid' });

    const weekday = phrase.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g);
    if (weekday?.length) {
        const offset = (DAYS.indexOf(weekday[0]) - weekdayIndex(today) + 7) % 7;
        options.push(weekday.length > 1 ? { reason: 'ambiguous' }
            : offset ? { date: addDays(today, offset) } : { reason: 'ambiguous' });
    }
    const dates = phrase.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)(?: de(?:l)? (\d{4}))?\b/g);
    if (dates?.length) {
        if (dates.length > 1) options.push({ reason: 'ambiguous' });
        else {
            const match = dates[0].match(/^(\d{1,2}) de ([a-z]+)(?: de(?:l)? (\d{4}))?$/)!;
            const day = Number(match[1]);
            const month = MONTHS.indexOf(match[2] === 'setiembre' ? 'septiembre' : match[2]) + 1;
            const year = Number(match[3] ?? today.slice(0, 4));
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            options.push(!isValidDate(date) ? { reason: 'invalid' } : !match[3] && date < today
                ? { reason: 'year' } : { date });
        }
    }
    // Un ISO explícito también sirve para fechas pronunciadas por el dictado con números.
    const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    if (iso?.length) options.push(iso.length === 1 && isValidDate(iso[0])
        ? { date: iso[0] } : { reason: 'ambiguous' });

    if (!options.length) return { reason: 'missing' };
    if (options.length > 1 &&
        (options.some((option) => !option.date) || options.some((option) => option.date !== options[0].date))) {
        return { reason: 'ambiguous' };
    }
    const result = options[0];
    if (result.date && result.date < today) return { reason: 'past' };
    if (result.date && result.date > addDays(today, 365)) return { reason: 'invalid' };
    return result;
}

export function normalizeName(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
}

// El reconocimiento puede confundir una frase breve; un "sí" aislado nunca escribe datos.
export function voiceConfirmation(value: string): 'confirm' | 'cancel' | 'unknown' {
    const phrase = normalizeName(value);
    if (/^(si confirmo|si confirma|confirmo la visita|confirmar visita|confirmo visita)$/.test(phrase)) {
        return 'confirm';
    }
    if (/^(no|no confirmo|cancelar|cancela|cancelo|no crear visita)$/.test(phrase)) {
        return 'cancel';
    }
    return 'unknown';
}

export function findPropertyMatches<T extends { property: { alias: string }; client: { name: string } }>(
    rows: T[], target: string,
): T[] {
    const fullName = normalizeName(target);
    const exactAlias = rows.filter(({ property }) => normalizeName(property.alias) === fullName);
    if (exactAlias.length) return exactAlias;
    const name = fullName.replace(/^(?:la |el )?(?:casa|piscina|propiedad) (?:de |del )?/, '').trim();
    if (name.length < 2) return [];
    const exact = rows.filter(({ property, client }) =>
        normalizeName(property.alias) === name || normalizeName(client.name) === name);
    if (exact.length) return exact;
    const token = ` ${name} `;
    return rows.filter(({ property, client }) =>
        ` ${normalizeName(property.alias)} `.includes(token) ||
        ` ${normalizeName(client.name)} `.includes(token));
}

export function findClarificationMatches<T extends { property: { alias: string }; client: { name: string } }>(
    candidates: T[], phrase: string,
) {
    const target = normalizeName(phrase)
        .replace(/^(?:(?:es|me refiero a|se trata de|quiero|el de|la de) )+/, '');
    const exactAlias = candidates.filter(({ property }) =>
        normalizeName(property.alias) === target.replace(/^(?:la |el )/, ''));
    if (exactAlias.length) return exactAlias;
    const direct = findPropertyMatches(candidates, target);
    if (direct.length) return direct;
    return findPropertyMatches(candidates, target.replace(/^(?:la |el )?(?:casa|piscina|propiedad) (?:de |del )?/, ''));
}

export function clarificationOption(phrase: string): number | null {
    const text = normalizeName(phrase);
    const match = text.match(/^(?:(?:la )?opcion |(?:el )?numero |la |el )?(uno|dos|tres|cuatro|cinco|primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao]|[1-5])$/);
    const words = ['uno', 'dos', 'tres', 'cuatro', 'cinco'];
    const ordinals = ['primer', 'segund', 'tercer', 'cuart', 'quint'];
    if (!match) return null;
    const value = match[1];
    return /^\d$/.test(value) ? Number(value) : words.indexOf(value) + 1 ||
        ordinals.findIndex((ordinal) => value.startsWith(ordinal)) + 1 || null;
}
