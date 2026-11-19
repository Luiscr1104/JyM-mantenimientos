export const WORK_TYPES = [
    { key: 'routine', label: 'Mantenimiento habitual' },
    { key: 'filter_backwash', label: 'Lavado de filtro' },
    { key: 'sand_replacement', label: 'Cambio de arena' },
    { key: 'pressure_wash', label: 'Hidrolavado de aceras' },
    { key: 'pool_wash', label: 'Lavado de piscina' },
    { key: 'flocculation', label: 'Floculación' },
    { key: 'flocculation_follow_up', label: 'Seguimiento de floculación' },
] as const;

export type WorkType = (typeof WORK_TYPES)[number]['key'];

export function workTypesLabel(types: readonly WorkType[]): string {
    return WORK_TYPES.filter(({ key }) => types.includes(key)).map(({ label }) => label).join(' · ');
}
