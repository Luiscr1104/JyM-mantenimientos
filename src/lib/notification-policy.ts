/** Dueños habilitados por rol y una cuenta técnica autorizada explícitamente. */
export function mayReceiveNotifications(userId: string, role: 'owner' | 'tech', technicianId: string | null) {
    return role === 'owner' || userId === technicianId;
}
