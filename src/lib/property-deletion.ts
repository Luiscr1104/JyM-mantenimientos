export interface PropertyDeletionFacts {
    visits: Array<{
        status: 'scheduled' | 'in_progress' | 'completed' | 'skipped';
        startedAt: Date | null;
        completedAt: Date | null;
        pumpStartedAt: Date | null;
        pumpStoppedAt: Date | null;
        checklist: Record<string, boolean> | null;
        notes: string | null;
        pendingReason: string | null;
    }>;
    hasProducts: boolean;
    hasWaterTask: boolean;
    hasOpenWaterTask: boolean;
}

export function propertyDeletionIssue(facts: PropertyDeletionFacts): string | null {
    if (facts.hasOpenWaterTask) {
        return 'Hay una llave pendiente. Confirma físicamente que quedó cerrada antes de intentar eliminar la propiedad.';
    }
    if (facts.hasWaterTask || facts.hasProducts || facts.visits.some((visit) =>
        visit.status !== 'scheduled' || visit.startedAt !== null ||
        visit.completedAt !== null || visit.pumpStartedAt !== null ||
        visit.pumpStoppedAt !== null || visit.checklist !== null ||
        Boolean(visit.notes?.trim()) || Boolean(visit.pendingReason?.trim())
    )) {
        return 'Esta propiedad tiene historial de trabajo. No se puede borrar sin trasladar antes esos datos a la propiedad correcta.';
    }
    return null;
}
