import { addDays, getToday, isValidDate, weekdayIndex } from './dates';
import { normalizeName } from './voice-assistant';

export type ReadAction = 'visit_summary' | 'today_briefing' | 'property_pending' |
    'visit_compare' | 'chlorine_month' | 'visit_duration';

const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function pastVisitSelection(text: string, today = getToday()) {
    const phrase = normalizeName(text);
    if (/\b(?:anterior|previa)\b/.test(phrase)) return { mode: 'previous' as const };
    if (/\bhoy\b/.test(phrase)) return { mode: 'date' as const, date: today };
    if (/\banteayer\b/.test(phrase)) return { mode: 'date' as const, date: addDays(today, -2) };
    if (/\bayer\b/.test(phrase)) return { mode: 'date' as const, date: addDays(today, -1) };
    const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    const dates = phrase.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)(?: de(?:l)? (\d{4}))?\b/g);
    if ((iso?.length ?? 0) + (dates?.length ?? 0) > 1) return { mode: 'ambiguous' as const };
    if (iso?.length) return isValidDate(iso[0]) && iso[0] <= today
        ? { mode: 'date' as const, date: iso[0] } : { mode: 'ambiguous' as const };
    if (dates?.length) {
        const match = dates[0].match(/^(\d{1,2}) de ([a-z]+)(?: de(?:l)? (\d{4}))?$/)!;
        const month = months.indexOf(match[2] === 'setiembre' ? 'septiembre' : match[2]) + 1;
        const date = `${match[3] ?? today.slice(0, 4)}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        return isValidDate(date) && date <= today
            ? { mode: 'date' as const, date } : { mode: 'ambiguous' as const };
    }
    return { mode: 'latest' as const };
}

export function monthForQuestion(text: string, today = getToday()) {
    const phrase = normalizeName(text);
    const date = new Date(`${today}T12:00:00Z`);
    if (/\b(?:mes pasado|mes anterior)\b/.test(phrase)) {
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() - 1);
    }
    else if (/\b(?:este mes|mes actual)\b/.test(phrase)) { /* mes corriente */ }
    else if (/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\b/.test(phrase)) {
        return null; // No adivinar año de un mes absoluto.
    }
    const month = date.toISOString().slice(0, 7);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12))
        .toISOString().slice(0, 10);
    return { from: `${month}-01`, to: last < today ? last : today, month };
}

export function weekForDuration(text: string, today = getToday()) {
    const monday = addDays(today, -((weekdayIndex(today) + 6) % 7) -
        (/\bsemana pasada\b/.test(normalizeName(text)) ? 7 : 0));
    return { from: monday, to: addDays(monday, 6) };
}

export function visitMinutes(start: Date | null, end: Date | null) {
    if (!start || !end || end.getTime() < start.getTime()) return null;
    return Math.round((end.getTime() - start.getTime()) / 60_000);
}
