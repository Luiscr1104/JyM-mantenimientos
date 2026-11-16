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
