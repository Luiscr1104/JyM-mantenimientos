import { addDays, isValidDate } from './dates';

export function isValidMonth(value: string | null): value is string {
    return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
        isValidDate(`${value}-01`));
}

export function addMonths(month: string, amount: number): string {
    const date = new Date(`${month}-15T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + amount);
    return date.toISOString().slice(0, 7);
}

/** Semana de lunes a domingo; null representa un espacio antes/después del mes. */
export function monthGrid(month: string): Array<string | null> {
    const first = new Date(`${month}-01T12:00:00Z`);
    const padding = (first.getUTCDay() + 6) % 7;
    const lastDay = Number(addDays(`${addMonths(month, 1)}-01`, -1).slice(-2));
    const cells: Array<string | null> = [
        ...Array<string | null>(padding).fill(null),
        ...Array.from({ length: lastDay }, (_, index) =>
            `${month}-${String(index + 1).padStart(2, '0')}`),
    ];
    while (cells.length % 7) cells.push(null);
    return cells;
}
