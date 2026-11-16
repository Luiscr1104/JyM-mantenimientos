import { db, routePlans, settings } from '@/db';
import type { SettingsInput } from '@/lib/validation';

const KEYS = {
    companyName: 'company_name',
    baseAddress: 'base_address',
    baseLat: 'base_lat',
    baseLng: 'base_lng',
} as const;

export interface AppSettings {
    companyName: string;
    baseAddress: string;
    baseLat: number | null;
    baseLng: number | null;
}

export async function getSettings(): Promise<AppSettings> {
    const rows = await db.select().from(settings);
    const values = new Map(rows.map((row) => [row.key, row.value ?? '']));

    const lat = values.get(KEYS.baseLat);
    const lng = values.get(KEYS.baseLng);

    return {
        companyName: values.get(KEYS.companyName) || 'JyM Mantenimientos',
        baseAddress: values.get(KEYS.baseAddress) ?? '',
        baseLat: lat ? Number(lat) : null,
        baseLng: lng ? Number(lng) : null,
    };
}

export async function saveSettings(input: SettingsInput): Promise<AppSettings> {
    const previous = await getSettings();
    const entries: Array<[string, string]> = [
        [KEYS.companyName, input.companyName ?? ''],
        [KEYS.baseAddress, input.baseAddress ?? ''],
        [KEYS.baseLat, input.baseLat != null ? String(input.baseLat) : ''],
        [KEYS.baseLng, input.baseLng != null ? String(input.baseLng) : ''],
    ];

    for (const [key, value] of entries) {
        await db
            .insert(settings)
            .values({ key, value })
            .onConflictDoUpdate({
                target: settings.key,
                set: { value, updatedAt: new Date() },
            });
    }

    if (previous.baseLat !== (input.baseLat ?? null) ||
        previous.baseLng !== (input.baseLng ?? null)) {
        await db.delete(routePlans);
    }
    return getSettings();
}
