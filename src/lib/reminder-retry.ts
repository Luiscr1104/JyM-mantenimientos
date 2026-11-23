export const MAX_REMINDER_ATTEMPTS = 8;
export const REMINDER_RETRY_AFTER_MS = 60_000;
export const REMINDER_STALE_CLAIM_MS = 2 * 60_000;

export function canRetryReminder(
    delivery: { status: string; attempts: number; claimedAt: Date } | undefined,
    now: Date,
): boolean {
    if (!delivery) return true;
    if (delivery.attempts >= MAX_REMINDER_ATTEMPTS) return false;
    const elapsed = now.getTime() - delivery.claimedAt.getTime();
    return (delivery.status === 'retry' && elapsed >= REMINDER_RETRY_AFTER_MS) ||
        (delivery.status === 'sending' && elapsed >= REMINDER_STALE_CLAIM_MS);
}
