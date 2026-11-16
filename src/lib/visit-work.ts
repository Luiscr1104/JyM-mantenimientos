export const TASKS = [
    { key: 'inspect', label: 'Revisar piscina y equipos' },
    { key: 'debris', label: 'Retirar residuos y limpiar canastas' },
    { key: 'clean', label: 'Realizar la limpieza correspondiente' },
    { key: 'water', label: 'Revisar el agua y anotar observaciones' },
    { key: 'filter', label: 'Verificar filtro y bomba según las instrucciones' },
] as const;

export const EXIT_STEPS = [
    { key: 'exitEquipment', label: 'Equipos en el estado indicado para esta propiedad' },
    { key: 'exitTools', label: 'Herramientas y productos recogidos' },
    { key: 'exitAccess', label: 'Accesos asegurados según las instrucciones' },
] as const;

export type VisitChecklistKey = (typeof TASKS)[number]['key'] | (typeof EXIT_STEPS)[number]['key'];
export type WorkChecklist = Record<VisitChecklistKey, boolean>;

export function emptyChecklist(): WorkChecklist {
    return Object.fromEntries([...TASKS, ...EXIT_STEPS].map(({ key }) => [key, false])) as WorkChecklist;
}

export function normalizeChecklist(value: Record<string, boolean> | null): WorkChecklist {
    const result = emptyChecklist();
    for (const key of Object.keys(result) as VisitChecklistKey[]) {
        result[key] = value?.[key] === true;
    }
    return result;
}

export function getCompletionIssue(
    checklist: WorkChecklist,
    pendingReason: string | null,
    pumpRunning: boolean,
): string | null {
    if (pumpRunning) return 'Detén y verifica la bomba antes de cerrar la visita.';
    if (EXIT_STEPS.some(({ key }) => !checklist[key])) {
        return 'Confirma los tres pasos de salida antes de completar.';
    }
    if (TASKS.some(({ key }) => !checklist[key]) && (pendingReason?.trim().length ?? 0) < 10) {
        return 'Explica qué tareas quedaron pendientes (mínimo 10 caracteres).';
    }
    return null;
}
