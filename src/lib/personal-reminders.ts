import { getToday } from './dates';
import { requestedVisitDate, normalizeName } from './voice-assistant';

export function reminderSchedule(text: string, today = getToday(), now = new Date()) {
    const requested = requestedVisitDate(text, today);
    if (requested.reason && requested.reason !== 'missing') return { error: 'Aclara la fecha del recordatorio.' };
    const dueDate = requested.date ?? today;
    const normalized = normalizeName(text);
    const timeMentioned = /\b(?:a las|a la|a eso de las)\b/.test(normalized);
    const time = normalized.match(/\ba las (\d{1,2})(?: (\d{2}))?(?: de la (manana|tarde|noche)| (am|pm))?\b/);
    if (timeMentioned && !time) return { error: 'Dime la hora con números, por ejemplo: a las 4 de la tarde.' };
    if (!time) return { dueDate, dueAt: null };
    let hour = Number(time[1]);
    const minute = Number(time[2] ?? 0);
    const half = time[3] === 'manana' || time[4] === 'am' ? 'am'
        : time[3] === 'tarde' || time[3] === 'noche' || time[4] === 'pm' ? 'pm' : null;
    if (hour > 23 || minute > 59 || (half && (hour < 1 || hour > 12)) || (!half && hour < 12)) {
        return { error: 'Aclara la hora, por ejemplo: a las 4 de la tarde o a las 16:30.' };
    }
    if (half) hour = hour % 12 + (half === 'pm' ? 12 : 0);
    // Costa Rica permanece UTC-6 todo el año.
    const dueAt = new Date(`${dueDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-06:00`);
    if (dueAt <= now) return { error: 'Esa hora ya pasó. Dime una hora o día futuro.' };
    return { dueDate, dueAt };
}
