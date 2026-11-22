export type RouteMove = 'down' | 'end';

export function orderPendingVisits<T extends { visit: { id: string } }>(
    pending: T[],
    stops: Array<{ visitId: string }> = [],
): T[] {
    const byId = new Map(pending.map((row) => [row.visit.id, row]));
    const seen = new Set<string>();
    const fromPlan = stops.flatMap(({ visitId }) => {
        const row = byId.get(visitId);
        if (!row || seen.has(visitId)) return [];
        seen.add(visitId);
        return [row];
    });
    return [...fromPlan, ...pending.filter((row) => !seen.has(row.visit.id))];
}

export function movePendingVisit<T extends { visit: { id: string } }>(
    ordered: T[],
    visitId: string,
    move: RouteMove,
): T[] | null {
    const index = ordered.findIndex((row) => row.visit.id === visitId);
    if (index < 0 || index === ordered.length - 1) return null;

    const result = [...ordered];
    const [row] = result.splice(index, 1);
    result.splice(move === 'down' ? index + 1 : result.length, 0, row);
    return result;
}
