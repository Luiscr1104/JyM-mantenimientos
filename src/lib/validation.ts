import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
    value === '' || value === null || value === undefined ? undefined : value;

const optionalText = (max: number) =>
    z.preprocess(
        (value) => (value === null || value === undefined ? '' : value),
        z.string().trim().max(max),
    );

const optionalEmail = z.preprocess(
    (value) => (value === null || value === undefined ? '' : value),
    z.union([z.literal(''), z.string().trim().email('Correo inválido')]),
);

const optionalNumber = (min: number, max: number) =>
    z.preprocess(emptyToUndefined, z.coerce.number().min(min).max(max).optional());

export const clientInputSchema = z.object({
    name: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
    phone: optionalText(40),
    email: optionalEmail,
    notes: optionalText(2000),
    status: z.enum(['active', 'inactive']).default('active'),
});

export const propertyInputSchema = z.object({
    clientId: z.string().uuid('Cliente inválido'),
    alias: z.string().trim().min(2, 'El alias es obligatorio').max(120),
    address: z.string().trim().min(3, 'La dirección es obligatoria').max(300),
    lat: optionalNumber(-90, 90),
    lng: optionalNumber(-180, 180),
    gateCode: optionalText(60),
    accessNotes: optionalText(2000),
    poolType: optionalText(80),
    volumeM3: optionalNumber(0, 5000),
    pumpNotes: optionalText(1000),
    filterType: optionalText(80),
    sanitation: optionalText(80),
});

export const leadInputSchema = z.object({
    name: z.string().trim().min(2, 'El nombre es obligatorio').max(120),
    phone: z.string().trim().min(6, 'El teléfono es obligatorio').max(40),
    email: optionalEmail,
    message: z.string().trim().min(10, 'Cuéntanos un poco más').max(2000),
    // Honeypot: los humanos lo dejan vacío.
    website: z.string().max(0).optional().default(''),
});

export const leadStatusSchema = z.enum(['new', 'contacted', 'quoted', 'won', 'lost']);

export const settingsInputSchema = z.object({
    companyName: optionalText(120),
    baseAddress: optionalText(300),
    baseLat: optionalNumber(-90, 90),
    baseLng: optionalNumber(-180, 180),
});

export const passwordInputSchema = z.object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
});

export type ClientInput = z.infer<typeof clientInputSchema>;
export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type LeadInput = z.infer<typeof leadInputSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;

/** Convierte cadenas vacías en null para la base de datos. */
export function nullIfEmpty(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function firstError(error: z.ZodError): string {
    return error.issues[0]?.message ?? 'Datos inválidos';
}
