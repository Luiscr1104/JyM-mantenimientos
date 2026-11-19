const TIMEZONE = 'America/Costa_Rica';

export function formatDate(value: Date | string): string {
    return new Intl.DateTimeFormat('es-CR', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
    return new Intl.DateTimeFormat('es-CR', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

export function formatTime(value: Date | string): string {
    return new Intl.DateTimeFormat('es-CR', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

export function formatVisitDuration(start: Date | string | null, end: Date | string | null): string | null {
    if (!start || !end) return null;
    const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
    return formatDuration(seconds);
}

export function formatRelative(value: Date | string): string {
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.round(diffMs / 60_000);

    if (minutes < 1) return 'ahora mismo';
    if (minutes < 60) return `hace ${minutes} min`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;

    const days = Math.round(hours / 24);
    if (days < 30) return `hace ${days} d`;

    return formatDate(date);
}

const LEAD_STATUS_LABELS: Record<string, string> = {
    new: 'Nuevo',
    contacted: 'Contactado',
    quoted: 'Cotizado',
    won: 'Ganado',
    lost: 'Perdido',
};

export function leadStatusLabel(status: string): string {
    return LEAD_STATUS_LABELS[status] ?? status;
}

const LEAD_STATUS_STYLES: Record<string, string> = {
    new: 'bg-sky-100 text-sky-800 border-sky-200',
    contacted: 'bg-amber-100 text-amber-800 border-amber-200',
    quoted: 'bg-violet-100 text-violet-800 border-violet-200',
    won: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    lost: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function leadStatusStyle(status: string): string {
    return LEAD_STATUS_STYLES[status] ?? LEAD_STATUS_STYLES.lost;
}

const VISIT_STATUS_LABELS: Record<string, string> = {
    scheduled: 'Pendiente',
    in_progress: 'En curso',
    completed: 'Completada',
    skipped: 'Omitida',
};

export function visitStatusLabel(status: string): string {
    return VISIT_STATUS_LABELS[status] ?? status;
}

const VISIT_STATUS_STYLES: Record<string, string> = {
    scheduled: 'bg-slate-100 text-slate-700 border-slate-200',
    in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
    completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    skipped: 'bg-slate-100 text-slate-400 border-slate-200',
};

export function visitStatusStyle(status: string): string {
    return VISIT_STATUS_STYLES[status] ?? VISIT_STATUS_STYLES.scheduled;
}

export function formatDistance(meters: number | null | undefined): string {
    if (meters == null || !Number.isFinite(meters)) return '—';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds)) return '—';

    const totalMinutes = Math.round(seconds / 60);
    if (totalMinutes < 60) return `${totalMinutes} min`;

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
