import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import { db, personalReminders } from '@/db';
import { getToday } from '@/lib/dates';

export async function listMyReminders(userId: string, date = getToday()) {
    return db.select().from(personalReminders)
        .where(and(eq(personalReminders.userId, userId), isNull(personalReminders.completedAt),
            lte(personalReminders.dueDate, date)))
        .orderBy(asc(personalReminders.dueDate), asc(personalReminders.dueAt), asc(personalReminders.createdAt))
        .limit(100);
}

export async function createMyReminder(userId: string, requestId: string, title: string, dueDate: string, dueAt: Date | null) {
    const [reminder] = await db.insert(personalReminders)
        .values({ userId, requestId, title, dueDate, dueAt }).onConflictDoNothing({
            target: personalReminders.requestId,
        }).returning();
    return reminder ?? null;
}

export async function completeMyReminder(userId: string, id: string) {
    const [reminder] = await db.update(personalReminders)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(personalReminders.id, id), eq(personalReminders.userId, userId),
            isNull(personalReminders.completedAt))).returning({ id: personalReminders.id });
    return Boolean(reminder);
}
