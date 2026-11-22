import { addDays, weekdayIndex } from './dates';

export type ReportPeriod = 'week' | 'month';

export function reportRange(date: string, period: ReportPeriod) {
    if (period === 'month') {
        const start = `${date.slice(0, 7)}-01`;
        const [year, month] = start.split('-').map(Number);
        const end = addDays(new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10), -1);
        return { start, end };
    }

    const start = addDays(date, -((weekdayIndex(date) + 6) % 7));
    return { start, end: addDays(start, 6) };
}

export function shiftReportDate(start: string, period: ReportPeriod, amount: -1 | 1): string {
    if (period === 'week') return addDays(start, amount * 7);
    const [year, month] = start.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1 + amount, 1, 12)).toISOString().slice(0, 10);
}
