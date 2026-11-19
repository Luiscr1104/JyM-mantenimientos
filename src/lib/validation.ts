import { z } from 'zod';
import { isValidDate } from './dates';
import { EXIT_STEPS, EXTRA_TASKS, TASKS } from './visit-work';
import { PRODUCTS } from './products';
import { WORK_TYPES } from './visit-types';

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

export const dateStringSchema = z
    .string()
    .refine(isValidDate, 'Fecha inválida');

export const visitInputSchema = z.object({
    propertyId: z.string().uuid('Propiedad inválida'),
    scheduledFor: dateStringSchema,
    workType: z.enum(WORK_TYPES.filter(({ key }) => key !== 'flocculation_follow_up').map(({ key }) => key))
        .optional().default('routine'),
    orderIndex: z.coerce.number().int().min(0).optional(),
});

export const visitStatusSchema = z.enum(['scheduled', 'in_progress', 'completed', 'skipped']);

export const visitActionSchema = z.enum(['start', 'complete', 'skip', 'reopen', 'delete']);

const checklistKeys = [...TASKS, ...EXTRA_TASKS, ...EXIT_STEPS].map(({ key }) => key);
export const visitWorkInputSchema = z.object({
    workTypes: z.array(z.enum(WORK_TYPES.map(({ key }) => key))).min(1).max(WORK_TYPES.length)
        .refine((types) => new Set(types).size === types.length, 'No repitas tipos de trabajo'),
    checklist: z.record(z.string(), z.boolean()).refine(
        (value) => Object.keys(value).length === checklistKeys.length &&
            checklistKeys.every((key) => typeof value[key] === 'boolean'),
        'Checklist inválido',
    ),
    notes: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
    pendingReason: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
});
export const pumpActionSchema = z.enum(['start', 'stop']);
export const visitProductSchema = z.object({
    product: z.enum(PRODUCTS.map(({ key }) => key)),
    quantity: z.number().finite().min(0.01).max(100_000)
        .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-8, 'Máximo dos decimales'),
});
export const waterFillInputSchema = z.object({
    visitId: z.uuid().optional(),
    propertyId: z.uuid().optional(),
    minutes: z.number().int().min(1).max(720),
}).refine((value) => Boolean(value.visitId) !== Boolean(value.propertyId), {
    message: 'Selecciona una visita o una propiedad',
});

export const PREFERRED_DAYS = [
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
    'domingo',
] as const;

const preferredDaysSchema = z.preprocess(
    (value) => {
        if (typeof value === 'string') return value ? value.split(',') : [];
        if (Array.isArray(value)) return value;
        return [];
    },
    z.array(z.enum(PREFERRED_DAYS)).default([]),
);

export const servicePlanInputSchema = z.object({
    visitsPerWeek: z.coerce
        .number()
        .int('Usa un número entero')
        .min(0, 'Mínimo 0')
        .max(7, 'Máximo 7'),
    preferredDays: preferredDaysSchema,
    active: z
        .preprocess(
            (value) => value === true || value === 'true' || value === 'on' || value === 1,
            z.boolean(),
        )
        .default(true),
}).superRefine((plan, context) => {
    const uniqueDays = new Set(plan.preferredDays);
    if (uniqueDays.size !== plan.preferredDays.length) {
        context.addIssue({ code: 'custom', message: 'No repitas días preferidos', path: ['preferredDays'] });
    }
    if (plan.preferredDays.length > 0 && plan.preferredDays.length !== plan.visitsPerWeek) {
        context.addIssue({
            code: 'custom',
            message: 'Selecciona tantos días como visitas por semana, o deja los días vacíos',
            path: ['preferredDays'],
        });
    }
});

export const passwordInputSchema = z.object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
});

export type ClientInput = z.infer<typeof clientInputSchema>;
export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type LeadInput = z.infer<typeof leadInputSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type VisitInput = z.infer<typeof visitInputSchema>;
export type ServicePlanInput = z.infer<typeof servicePlanInputSchema>;

/** Convierte cadenas vacías en null para la base de datos. */
export function nullIfEmpty(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function firstError(error: z.ZodError): string {
    return error.issues[0]?.message ?? 'Datos inválidos';
}
