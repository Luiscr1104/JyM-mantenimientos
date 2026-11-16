export const TIMEZONE = 'America/Costa_Rica';

export const WEEKDAYS = [
    'domingo',
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_LOOKUP: Record<string, Weekday> = {
    domingo: 'domingo',
    sunday: 'domingo',
    sun: 'domingo',
    '0': 'domingo',
    '7': 'domingo',
    lunes: 'lunes',
    monday: 'lunes',
    mon: 'lunes',
    '1': 'lunes',
    martes: 'martes',
    tuesday: 'martes',
    tue: 'martes',
    '2': 'martes',
    miercoles: 'miercoles',
    miércoles: 'miercoles',
    wednesday: 'miercoles',
    wed: 'miercoles',
    '3': 'miercoles',
    jueves: 'jueves',
    thursday: 'jueves',
    thu: 'jueves',
    '4': 'jueves',
    viernes: 'viernes',
    friday: 'viernes',
    fri: 'viernes',
    '5': 'viernes',
    sabado: 'sabado',
    sábado: 'sabado',
    saturday: 'sabado',
    sat: 'sabado',
    '6': 'sabado',
};

/** Días sugeridos cuando el plan no define días preferidos. 0 = domingo. */
const DEFAULT_DAYS: Record<number, number[]> = {
    0: [],
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
};

export function getToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

export function isValidDate(value: string | null | undefined): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
    const [year, month, day] = date.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + days, 12));
    return next.toISOString().slice(0, 10);
}

export function weekdayIndex(date: string): number {
    const label = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        weekday: 'short',
    }).format(new Date(`${date}T12:00:00Z`));

    const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };

    return map[label] ?? 0;
}

export function weekdayName(index: number): string {
    return WEEKDAYS[((index % 7) + 7) % 7];
}

export function normalizeDay(value: string): Weekday | null {
    return WEEKDAY_LOOKUP[value.trim().toLowerCase()] ?? null;
}

/**
 * Decide si una propiedad toca visitar en la fecha. Si el plan tiene días
 * preferidos se respetan; si no, se reparten las visitas semanales en días
 * fijos para que la sugerencia sea predecible.
 */
export function matchesPreferredDay(
    preferredDays: string[] | null | undefined,
    date: string,
    visitsPerWeek: number,
): boolean {
    if (visitsPerWeek <= 0) return false;
    const normalized = (preferredDays ?? [])
        .map(normalizeDay)
        .filter((day): day is Weekday => day !== null);

    const weekday = weekdayIndex(date);

    if (normalized.length > 0) {
        // Planes antiguos pueden contener más días que visitas semanales.
        return [...new Set(normalized)].slice(0, visitsPerWeek).includes(WEEKDAYS[weekday]);
    }

    const days = DEFAULT_DAYS[Math.min(7, Math.max(0, visitsPerWeek))] ?? [1];
    return days.includes(weekday);
}

export function formatLongDate(date: string): string {
    const label = new Intl.DateTimeFormat('es-CR', {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(`${date}T12:00:00Z`));

    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatCompactDate(date: string): string {
    return new Intl.DateTimeFormat('es-CR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: 'short',
    }).format(new Date(`${date}T12:00:00Z`));
}
