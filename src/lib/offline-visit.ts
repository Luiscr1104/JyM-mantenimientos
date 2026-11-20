import { z } from 'zod';
import { visitProductSchema, visitWorkInputSchema } from './validation';
import type { WorkType } from './visit-types';
import type { ProductKey } from './products';

export interface OfflineVisit {
    id: string;
    propertyName: string;
    address: string;
    gateCode: string | null;
    accessNotes: string | null;
    pumpNotes: string | null;
    date: string;
    expectedUpdatedAt: string;
    status: 'scheduled' | 'in_progress';
    startedAt: string | null;
    pumpStartedAt: string | null;
    pumpStoppedAt: string | null;
    completedAt: string | null;
    work: {
        workTypes: WorkType[];
        checklist: Record<string, boolean>;
        notes: string;
        pendingReason: string;
    };
    products: Array<{ product: ProductKey; quantity: number }>;
    addedProducts: Array<{ product: ProductKey; quantity: number }>;
    syncId: string;
    pending: boolean;
}

const recordedAt = z.iso.datetime({ offset: true }).nullable();
export const offlineSyncSchema = z.object({
    syncId: z.uuid(),
    visitId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    startedAt: recordedAt,
    pumpStartedAt: recordedAt,
    pumpStoppedAt: recordedAt,
    completedAt: recordedAt,
    work: visitWorkInputSchema,
    existingProducts: z.array(visitProductSchema).max(100),
    products: z.array(visitProductSchema).max(100),
});
