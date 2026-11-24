import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { GROQ_API_KEY } from 'astro:env/server';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db, properties, visitProducts, visits } from '@/db';
import { getToday } from '@/lib/dates';
import { EXIT_STEPS, normalizeChecklist, tasksForTypes } from '@/lib/visit-work';
import { reminderSchedule } from '@/lib/personal-reminders';
import {
    monthForQuestion, pastVisitSelection, weekForDuration, type ReadAction,
} from '@/lib/assistant-visit-read';
import {
    clarificationOption, findClarificationMatches, findPropertyMatches, normalizeName, requestedVisitDate,
    requestedWeek, spokenDate, spokenWeek, voiceConfirmation,
    type VoiceIntent,
} from '@/lib/voice-assistant';
import { listPropertiesWithClient } from './properties';
import { createMyReminder } from './personal-reminders';
import { applyVisitAction, createVisit, getVisitWithProperty, listVisitsByDate } from './visits';
import { completeVisitByVoice, VisitWorkError } from './visit-work';
import { readProperty, readTodayBriefing } from './assistant-visit-queries';

const READ_ACTIONS = [
    'visit_summary', 'today_briefing', 'property_pending', 'visit_compare', 'chlorine_month', 'visit_duration',
] as const;
function isReadAction(action: VoiceIntent['action']): action is ReadAction {
    return (READ_ACTIONS as readonly string[]).includes(action);
}

const intentSchema = z.object({
    action: z.enum(['create_visit', 'chlorine_history', 'start_visit', 'complete_visit', 'create_reminder',
        ...READ_ACTIONS, 'unsupported']),
    target: z.string().trim().max(100),
    period: z.enum(['today', 'visit_date', 'this_week', 'last_week', 'weeks_ago', 'week_of',
        'previous', 'latest', 'this_month', 'last_month', 'unsupported']),
    workType: z.enum(['routine', 'unsupported']),
    weeksAgo: z.number().int().min(0).max(520),
    anchorDate: z.string().max(10),
});

const previewSchema = z.object({
    action: z.enum(['create_visit', 'start_visit', 'complete_visit', 'create_reminder']).default('create_visit'),
    userId: z.uuid(),
    propertyId: z.uuid().optional(),
    visitId: z.uuid().optional(),
    date: z.iso.date(),
    workType: z.literal('routine').optional(),
    title: z.string().min(3).max(160).optional(),
    requestId: z.uuid().optional(),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
    checkedKeys: z.array(z.string().max(40)).max(25).optional(),
    expires: z.number().int(),
});
const stepsSchema = z.object({
    userId: z.uuid(), visitId: z.uuid(), date: z.iso.date(),
    checkedKeys: z.array(z.string().max(40)).max(25),
    expires: z.number().int(),
});
const clarificationSchema = z.object({
    userId: z.uuid(),
    action: z.enum(['create_visit', 'chlorine_history', 'start_visit', 'complete_visit', ...READ_ACTIONS]),
    date: z.iso.date(),
    from: z.iso.date(),
    to: z.iso.date(),
    candidateIds: z.array(z.uuid()).min(2).max(30),
    selection: z.enum(['date', 'previous', 'latest']).optional(),
    attempts: z.number().int().min(0).max(3),
    expires: z.number().int(),
});
type Clarification = z.infer<typeof clarificationSchema>;
type PropertyRow = Awaited<ReturnType<typeof listPropertiesWithClient>>[number];
const readContextSchema = z.object({
    userId: z.uuid(), propertyId: z.uuid(), date: z.iso.date(), expires: z.number().int(),
});

const GROQ_URL = 'https://api.groq.com/openai/v1';

export class AssistantError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

function apiKey() {
    if (!GROQ_API_KEY) throw new AssistantError('Falta configurar GROQ_API_KEY en el servidor.', 503);
    return GROQ_API_KEY;
}

async function groqResponse(path: string, init: RequestInit) {
    let response: Response;
    try {
        response = await fetch(`${GROQ_URL}${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${apiKey()}`, ...init.headers },
            signal: AbortSignal.timeout(25_000),
        });
    } catch {
        throw new AssistantError('No se pudo contactar a Groq. Comprueba la conexión e inténtalo de nuevo.', 503);
    }
    if (!response.ok) {
        if (response.status === 429) throw new AssistantError('Groq alcanzó su límite gratuito. Inténtalo más tarde.', 503);
        console.error('[voice.groq]', response.status);
        throw new AssistantError('No se pudo procesar la voz. Revisa la clave de Groq o inténtalo más tarde.', 503);
    }
    return response.json();
}

export async function transcribeAudio(file: File) {
    const types: Record<string, string> = {
        'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
        'audio/webm': 'webm', 'audio/ogg': 'ogg',
    };
    const mime = file.type.split(';')[0].toLowerCase();
    const extension = types[mime];
    if (!extension || file.size < 100 || file.size > 2_000_000) {
        throw new AssistantError('Audio no válido. Graba una frase de hasta 20 segundos (máximo 2 MB).');
    }
    const form = new FormData();
    form.append('file', file, `comando.${extension}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    form.append('response_format', 'json');
    const result = await groqResponse('/audio/transcriptions', { method: 'POST', body: form }) as { text?: unknown };
    const text = typeof result.text === 'string' ? result.text.trim().slice(0, 400) : '';
    if (!text) throw new AssistantError('No se entendió la grabación. Inténtalo de nuevo.');
    return text;
}

export async function interpretSpeech(text: string): Promise<VoiceIntent> {
    const result = await groqResponse('/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'openai/gpt-oss-20b',
            temperature: 0,
            messages: [
                { role: 'system', content: `Clasifica únicamente comandos de un panel de mantenimiento de piscinas. No ejecutes nada.
Devuelve create_visit para agendar una visita hoy o futura, start_visit para INICIAR una visita ya programada,
complete_visit para TERMINAR/CERRAR una visita en curso, create_reminder para crear una tarea o recordatorio personal
(por ejemplo comprar concentrado para el perro Negro, arreglar llavero de Olga), y chlorine_history para cloro.
Consultas SIN CAMBIAR DATOS: visit_summary para resumir una visita de hoy, anterior o de una fecha;
today_briefing para «qué me falta hoy» (sin target);
property_pending para pendientes/observaciones de la última visita de una propiedad;
visit_compare para comparar la visita más reciente con la anterior;
chlorine_month para total de cloro de este mes o el mes pasado (unidades separadas);
visit_duration para tiempo trabajado en visitas de una propiedad esta semana o la semana pasada.
No clasifiques «qué hizo Olga hoy» como crear/iniciar/cerrar; solo leer. No inventes registros.
Extrae target como nombre o alias tal como se menciona en la frase; jamás inventes uno.
Para create_reminder target es la tarea concreta (sin «recuérdame» ni la fecha/hora); debe ser texto literal de la frase.
Para start_visit y complete_visit target es el nombre/alias mencionado; si dice «la visita» sin nombre, target="".
period para cloro: this_week (esta semana), last_week (la pasada), weeks_ago (hace N semanas),
week_of (la semana que contiene un día con día, mes Y año explícitos). Para weeks_ago escribe N en weeksAgo;
para week_of usa anchorDate YYYY-MM-DD solo si el año se dijo. Si no se dijo año, usa week_of con anchorDate vacío.
Para consultas de resumen usa period=today, previous, visit_date o latest; para cloro mensual
this_month o last_month; para tiempo this_week o last_week. Para las demás opciones
weeksAgo=0 y anchorDate="". create_visit usa period=today si dice hoy,
o visit_date para mañana, pasado mañana, un día de la semana o una fecha concreta.
No calcules la fecha de la visita: el servidor la comprobará en las palabras del usuario.
Una semana de cloro es lunes a domingo. Cloro en fechas futuras o intervalos arbitrarios: unsupported.
workType: routine si se pide mantenimiento habitual o no se menciona tipo de trabajo; unsupported si se solicita otro tipo.
En recordatorios sin fecha, permite create_reminder: por defecto aparecerá hoy. Para iniciar/cerrar sin nombre,
permite target vacío; el servidor solo aceptará si hay exactamente una visita candidata.
Si hay varias acciones o la intención es distinta, action unsupported. No asumas hechos del negocio.` },
                { role: 'user', content: text },
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'voice_intent', strict: true,
                    schema: {
                        type: 'object', additionalProperties: false,
                        properties: {
                            action: { type: 'string', enum: ['create_visit', 'chlorine_history', 'start_visit', 'complete_visit', 'create_reminder', ...READ_ACTIONS, 'unsupported'] },
                            target: { type: 'string' },
                            period: { type: 'string', enum: ['today', 'visit_date', 'this_week', 'last_week', 'weeks_ago', 'week_of',
                                'previous', 'latest', 'this_month', 'last_month', 'unsupported'] },
                            workType: { type: 'string', enum: ['routine', 'unsupported'] },
                            weeksAgo: { type: 'integer' },
                            anchorDate: { type: 'string' },
                        },
                        required: ['action', 'target', 'period', 'workType', 'weeksAgo', 'anchorDate'],
                    },
                },
            },
        }),
    }) as { choices?: Array<{ message?: { content?: string } }> };
    try {
        return intentSchema.parse(JSON.parse(result.choices?.[0]?.message?.content ?? ''));
    } catch {
        throw new AssistantError('No pude interpretar la frase. Prueba otra forma de decirla.', 422);
    }
}

function sign(payload: string, purpose: 'preview' | 'clarification' | 'steps' | 'read') {
    return createHmac('sha256', apiKey()).update(`jym-voice-${purpose}-v1:${payload}`).digest('hex');
}

function signedToken(data: unknown, purpose: 'preview' | 'clarification' | 'steps' | 'read') {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    return `${payload}.${sign(payload, purpose)}`;
}

function tokenPayload(token: string, purpose: 'preview' | 'clarification' | 'steps' | 'read', maxLength: number): unknown {
    const [payload, signature, ...extra] = token.split('.');
    if (!payload || !signature || extra.length || payload.length > maxLength ||
        !/^[0-9a-f]{64}$/.test(signature) ||
        !timingSafeEqual(Buffer.from(sign(payload, purpose), 'hex'), Buffer.from(signature, 'hex'))) {
        throw new AssistantError('La solicitud caducó o es inválida. Vuelve a preguntar.');
    }
    try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); }
    catch { throw new AssistantError('La solicitud es inválida. Vuelve a preguntar.'); }
}

function makePreview(userId: string, propertyId: string, date: string) {
    return signedToken({
        action: 'create_visit', userId, propertyId, date, workType: 'routine', expires: Date.now() + 5 * 60_000,
    }, 'preview');
}

function actionPreview(data: Omit<z.infer<typeof previewSchema>, 'expires'>, message: string) {
    return {
        kind: 'preview' as const, message,
        token: signedToken({ ...data, expires: Date.now() + 5 * 60_000 }, 'preview'),
    };
}

function nextChecklistStep(context: z.infer<typeof stepsSchema>,
    row: NonNullable<Awaited<ReturnType<typeof getVisitWithProperty>>>) {
    const required = [...tasksForTypes(row.visit.workTypes), ...EXIT_STEPS];
    const current = normalizeChecklist(row.visit.checklist);
    const missing = required.find(({ key }) => !current[key] && !context.checkedKeys.includes(key));
    if (!missing) return actionPreview({
        action: 'complete_visit', userId: context.userId, visitId: row.visit.id,
        date: context.date, checkedKeys: context.checkedKeys,
    }, `Voy a marcar los pasos que confirmaste y cerrar la visita de ${row.property.alias}. ¿Confirmas el cierre?`);
    return {
        kind: 'clarification' as const,
        message: `Para cerrar la visita de ${row.property.alias}: ¿realizaste «${missing.label}»? Di: hecho, o: pendiente.`,
        contextToken: `s:${signedToken({
            ...context, expires: Date.now() + 5 * 60_000,
        }, 'steps')}`,
    };
}

async function continueSteps(text: string, userId: string, token: string) {
    const parsed = stepsSchema.safeParse(tokenPayload(token, 'steps', 2200));
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.date !== getToday() ||
        parsed.data.expires < Date.now()) throw new AssistantError('La revisión caducó. Pide cerrar la visita nuevamente.');
    if (voiceConfirmation(text) === 'cancel') return { kind: 'message' as const, message: 'Cierre cancelado. No marqué pasos.' };
    const row = await getVisitWithProperty(parsed.data.visitId);
    if (!row || row.visit.status !== 'in_progress') throw new AssistantError('La visita ya no está en curso.');
    const required = [...tasksForTypes(row.visit.workTypes), ...EXIT_STEPS];
    const checked = normalizeChecklist(row.visit.checklist);
    const missing = required.find(({ key }) => !checked[key] && !parsed.data.checkedKeys.includes(key));
    if (!missing) return nextChecklistStep(parsed.data, row);
    const phrase = normalizeName(text);
    if (/^(pendiente|no|no hecho)$/.test(phrase)) return {
        kind: 'message' as const,
        message: `No cerraré la visita. Registra lo que quedó pendiente en la pantalla de ${row.property.alias}, verifica la salida y vuelve a pedirme cerrarla.`,
    };
    if (!/^(hecho|realizado|completado|si hecho|si realizado)$/.test(phrase)) return nextChecklistStep(parsed.data, row);
    return nextChecklistStep({ ...parsed.data, checkedKeys: [...parsed.data.checkedKeys, missing.key] }, row);
}

async function prepareVisitAction(action: 'start_visit' | 'complete_visit', target: string, userId: string) {
    const today = getToday();
    const rows = (await listVisitsByDate(today)).filter(({ visit }) =>
        visit.status === (action === 'start_visit' ? 'scheduled' : 'in_progress'));
    const matches = target ? findPropertyMatches(rows, target) : rows;
    if (!matches.length) return {
        kind: 'message' as const,
        message: `No encontré una visita ${action === 'start_visit' ? 'programada' : 'en curso'} para hoy con ese nombre.`,
    };
    if (matches.length > 1) return askWhichProperty({
        userId, action, date: today, from: today, to: today,
        candidateIds: [], attempts: 0, expires: Date.now() + 5 * 60_000,
    }, matches);
    return prepareSelectedVisitAction(action, matches[0], userId);
}

function prepareSelectedVisitAction(action: 'start_visit' | 'complete_visit',
    row: Awaited<ReturnType<typeof listVisitsByDate>>[number], userId: string) {
    const today = getToday();
    if (row.visit.scheduledFor !== today || row.visit.status !==
        (action === 'start_visit' ? 'scheduled' : 'in_progress')) {
        throw new AssistantError('La visita cambió. Repite la petición.');
    }
    if (action === 'start_visit') return actionPreview({
        action, userId, visitId: row.visit.id, date: today,
    }, `¿Iniciar ahora la visita de ${row.property.alias}, de ${row.client.name}, y registrar tu llegada?`);
    if (row.visit.pumpStartedAt && !row.visit.pumpStoppedAt) return {
        kind: 'message' as const,
        message: 'Hay una bomba registrada en marcha. Detenla y comprueba físicamente su estado antes de cerrar.',
    };
    return nextChecklistStep({
        userId, visitId: row.visit.id, date: today, checkedKeys: [], expires: Date.now() + 5 * 60_000,
    }, row);
}

function askWhichProperty(context: Clarification, matches: PropertyRow[]) {
    if (matches.length > 30) return {
        kind: 'message' as const,
        message: 'Encontré demasiadas propiedades con ese nombre. Repite la pregunta usando el alias completo de una propiedad.',
    };
    const names = matches.slice(0, 5).map(({ property, client }, index) =>
        `opción ${['uno', 'dos', 'tres', 'cuatro', 'cinco'][index]}: ${property.alias}, de ${client.name}`);
    const more = matches.length > 5 ? ` Hay ${matches.length - 5} propiedades más; si buscas una de ellas, di su alias.` : '';
    return {
        kind: 'clarification' as const,
        message: `Para tu pregunta quedan ${matches.length} propiedades: ${names.join('; ')}.${more} Dime el alias o el número de la opción que buscas.`,
        contextToken: signedToken({ ...context, candidateIds: matches.map(({ property }) => property.id) }, 'clarification'),
    };
}

async function answerReadProperty(action: Exclude<ReadAction, 'today_briefing'>,
    row: PropertyRow, userId: string, options: {
        date?: string; selection?: 'date' | 'previous' | 'latest'; from?: string; to?: string; before?: string,
    }) {
    const result = await readProperty(action, row, {
        selection: options.selection === 'date' ? { mode: 'date', date: options.date ?? getToday() }
            : { mode: options.selection ?? 'latest' },
        from: options.from, to: options.to, before: options.before,
    });
    return {
        kind: 'message' as const, message: result.message,
        contextToken: `r:${signedToken({
            userId, propertyId: row.property.id, date: result.date ?? options.date ?? getToday(),
            expires: Date.now() + 5 * 60_000,
        }, 'read')}`,
    };
}

async function prepareReadRequest(action: ReadAction, target: string, text: string, userId: string) {
    if (action === 'today_briefing') {
        const result = await readTodayBriefing(userId);
        return { kind: 'message' as const, message: result.message };
    }
    if (!target) return { kind: 'message' as const, message: 'Dime de cuál propiedad quieres la información.' };
    const today = getToday();
    const selection = pastVisitSelection(text, today);
    if (action === 'visit_summary' && selection.mode === 'ambiguous') return {
        kind: 'message' as const, message: 'La fecha no está clara. Di hoy, ayer, la visita anterior o una fecha con año.',
    };
    const month = action === 'chlorine_month' ? monthForQuestion(text, today) : null;
    if (action === 'chlorine_month' && !month) return {
        kind: 'message' as const, message: 'Para otro mes, dime también el año. De momento puedo consultar este mes o el mes pasado.',
    };
    const week = action === 'visit_duration' ? weekForDuration(text, today) : null;
    const scope = month ?? week;
    const context = {
        userId, action, date: selection.mode === 'date' ? selection.date : today,
        from: scope?.from ?? today, to: scope?.to ?? today,
        selection: selection.mode === 'date' ? 'date' as const
            : selection.mode === 'previous' && action !== 'visit_compare'
                ? 'previous' as const : 'latest' as const,
        candidateIds: [] as string[], attempts: 0, expires: Date.now() + 5 * 60_000,
    };
    const matches = findPropertyMatches(await listPropertiesWithClient(), target);
    if (!matches.length) return { kind: 'message' as const,
        message: `No encontré una propiedad para «${target}». Di su nombre o alias completo.` };
    if (matches.length > 1) return askWhichProperty(context, matches);
    return answerReadProperty(action, matches[0], userId, context);
}

async function continueRead(text: string, userId: string, token: string) {
    const phrase = normalizeName(text);
    const previous = /^(?:y )?(?:en )?(?:la )?(?:visita )?(?:anterior|previa)$/.test(phrase);
    const pending = /^(?:y )?(?:que )?(?:quedo |hay )?pendiente(?: en esa visita)?$/.test(phrase);
    const compare = /^(?:y )?(?:comparala|compara esa visita) con (?:la )?anterior$/.test(phrase);
    if (!previous && !pending && !compare) return null; // Otra pregunta completa inicia turno nuevo.
    const parsed = readContextSchema.safeParse(tokenPayload(token, 'read', 900));
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.expires < Date.now()) {
        throw new AssistantError('El contexto caducó. Repite la pregunta con el nombre de la propiedad.');
    }
    const [row] = (await listPropertiesWithClient())
        .filter(({ property }) => property.id === parsed.data.propertyId);
    if (!row) throw new AssistantError('La propiedad ya no existe.');
    return answerReadProperty(previous ? 'visit_summary' : compare ? 'visit_compare' : 'property_pending',
        row, userId, { selection: previous ? 'previous' : 'date',
            before: previous ? parsed.data.date : undefined, date: parsed.data.date });
}

async function answerForProperty(
    row: PropertyRow, context: Pick<Clarification, 'action' | 'date' | 'from' | 'to'>, userId: string,
) {
    const { property, client } = row;
    if (context.action === 'create_visit') {
        if (context.date < getToday()) return {
            kind: 'message' as const,
            message: 'La fecha de la visita ya pasó. Vuelve a pedirla para otro día.',
        };
        const [existing] = await db.select({ id: visits.id }).from(visits)
            .where(and(eq(visits.propertyId, property.id), eq(visits.scheduledFor, context.date))).limit(1);
        if (existing) return {
            kind: 'message' as const, message: `Ya existe una visita para ${property.alias} el ${spokenDate(context.date)}.`,
            links: [{ label: 'Abrir visita', href: `/panel/visitas/${existing.id}` }],
        };
        return {
            kind: 'preview' as const,
            message: `¿Crear una visita de mantenimiento habitual para ${property.alias}, de ${client.name}, el ${spokenDate(context.date)}?`,
            token: makePreview(userId, property.id, context.date),
        };
    }
    const rows = await db.select({
        id: visits.id, date: visits.scheduledFor, product: visitProducts.product,
        quantity: visitProducts.quantity,
    }).from(visitProducts)
        .innerJoin(visits, eq(visitProducts.visitId, visits.id))
        .where(and(eq(visits.propertyId, property.id), gte(visits.scheduledFor, context.from),
            lte(visits.scheduledFor, context.to),
            inArray(visitProducts.product, ['granulated_chlorine', 'chlorine_tablet'])))
        .orderBy(asc(visits.scheduledFor), asc(visitProducts.createdAt));
    const week = spokenWeek(context.from, context.to);
    if (!rows.length) return {
        kind: 'message' as const,
        message: `No encuentro cloro registrado para ${property.alias}, de ${client.name}, en las visitas programadas ${week}. Esto no confirma que no se haya aplicado; podría faltar el registro o estar pendiente de sincronización.`,
    };
    const details = rows.map((entry) => {
        const quantity = Number(entry.quantity);
        const amount = quantity.toLocaleString('es-CR');
        return entry.product === 'chlorine_tablet'
            ? `${spokenDate(entry.date)}: ${amount} ${quantity === 1 ? 'pastilla' : 'pastillas'} de cloro`
            : `${spokenDate(entry.date)}: ${amount} gramos de cloro granulado`;
    });
    return {
        kind: 'message' as const,
        message: `Para ${property.alias}, de ${client.name}, en las visitas programadas ${week}, consta: ${details.join('; ')}. Los registros pendientes de sincronizar en otros teléfonos no aparecen aquí.`,
        links: [...new Set(rows.map((entry) => entry.id))].map((id) => ({
            label: `Ver visita ${rows.find((entry) => entry.id === id)!.date}`,
            href: `/panel/visitas/${id}`,
        })),
    };
}

async function continueClarification(text: string, userId: string, token: string) {
    const parsed = clarificationSchema.safeParse(tokenPayload(token, 'clarification', 3_000));
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.expires < Date.now()) {
        throw new AssistantError('La aclaración caducó. Haz la pregunta nuevamente.');
    }
    const context = parsed.data;
    if (voiceConfirmation(text) === 'cancel') return { kind: 'message' as const, message: 'De acuerdo, cancelado.' };
    if (context.attempts >= 3) return {
        kind: 'message' as const,
        message: 'No pude identificar la propiedad. Repite tu pregunta usando el alias completo.',
    };
    const all = context.action === 'start_visit' || context.action === 'complete_visit'
        ? (await listVisitsByDate(context.date)).filter(({ visit }) =>
            visit.status === (context.action === 'start_visit' ? 'scheduled' : 'in_progress'))
        : await listPropertiesWithClient();
    const rows = context.candidateIds.flatMap((id) =>
        all.filter(({ property }) => property.id === id));
    if (rows.length < 2) return {
        kind: 'message' as const,
        message: 'Cambió la lista de propiedades. Repite la pregunta para consultar las opciones actuales.',
    };
    const option = clarificationOption(text);
    const matches = option !== null
        ? rows[option - 1] && option <= 5 ? [rows[option - 1]] : []
        : findClarificationMatches(rows, text);
    if (!matches.length) {
        const retry = askWhichProperty({ ...context, attempts: context.attempts + 1 }, rows);
        return { ...retry, message: `No identifiqué esa propiedad. ${retry.message}` };
    }
    if (matches.length > 1) return askWhichProperty({ ...context, attempts: context.attempts + 1 }, matches);
    if (context.action === 'start_visit' || context.action === 'complete_visit') {
        const row = (await listVisitsByDate(context.date))
            .find(({ property }) => property.id === matches[0].property.id);
        if (!row) throw new AssistantError('La visita cambió. Vuelve a pedirla.');
        return prepareSelectedVisitAction(context.action, row, userId);
    }
    if (isReadAction(context.action)) return answerReadProperty(context.action as Exclude<ReadAction, 'today_briefing'>,
        matches[0], userId, context);
    return answerForProperty(matches[0], context, userId);
}

export async function prepareVoiceRequest(text: string, userId: string, contextToken?: string) {
    if (contextToken?.startsWith('s:')) return continueSteps(text, userId, contextToken.slice(2));
    if (contextToken?.startsWith('r:')) {
        const followup = await continueRead(text, userId, contextToken.slice(2));
        if (followup) return followup;
    } else if (contextToken) return continueClarification(text, userId, contextToken);
    const intent = await interpretSpeech(text);
    if (intent.action === 'unsupported' ||
        (intent.action === 'create_visit' && intent.workType !== 'routine') ||
        (intent.action === 'chlorine_history' && intent.period === 'unsupported')) {
        return { kind: 'message' as const, message: 'Puedo resumir y comparar visitas, consultar pendientes, cloro y tiempo trabajado; también gestionar visitas y recordatorios. Dime la propiedad o la tarea.' };
    }
    if (!intent.target && !['start_visit', 'complete_visit', 'today_briefing'].includes(intent.action)) return {
        kind: 'message' as const, message: 'Dime la propiedad o la tarea concreta.',
    };
    if (intent.target && !` ${normalizeName(text)} `.includes(` ${normalizeName(intent.target)} `)) {
        return { kind: 'message' as const, message: 'No pude verificar el nombre en lo que escuché. Di el nombre del cliente o la propiedad otra vez.' };
    }
    if (intent.action === 'start_visit' || intent.action === 'complete_visit') {
        return prepareVisitAction(intent.action, intent.target, userId);
    }
    if (isReadAction(intent.action)) return prepareReadRequest(intent.action, intent.target, text, userId);
    if (intent.action === 'create_reminder') {
        const schedule = reminderSchedule(text);
        if (schedule.error) return { kind: 'message' as const, message: schedule.error };
        const title = intent.target.trim().replace(/[.!?]+$/, '');
        if (title.length < 3 || title.length > 160) return {
            kind: 'message' as const, message: 'Dime qué quieres recordar en una frase breve.',
        };
        return actionPreview({
            action: 'create_reminder', userId, date: schedule.dueDate!,
            title, requestId: randomUUID(), dueAt: schedule.dueAt?.toISOString() ?? null,
        }, `¿Crear tu recordatorio personal «${title}» para ${spokenDate(schedule.dueDate!)}${schedule.dueAt
            ? ` a las ${new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', hour: 'numeric', minute: '2-digit' }).format(schedule.dueAt)}` : ', sin alarma'}?`);
    }
    const date = getToday();
    const visit = intent.action === 'create_visit' ? requestedVisitDate(text, date) : null;
    if (visit && !visit.date) return {
        kind: 'message' as const,
        message: visit.reason === 'year'
            ? 'Esa fecha sin año ya pasó este año. Repite la petición indicando el año.'
            : visit.reason === 'ambiguous'
                ? 'Hay más de una fecha posible. Repite la petición diciendo un solo día.'
                : visit.reason === 'past'
                    ? 'No puedo crear una visita para una fecha pasada. Dime un día futuro.'
                    : 'Dime un día concreto, por ejemplo mañana, el viernes o el 3 de diciembre.',
    };
    if (intent.action === 'chlorine_history' && intent.period === 'week_of' &&
        intent.anchorDate && !normalizeName(text).includes(intent.anchorDate.slice(0, 4))) {
        return {
            kind: 'message' as const,
            message: '¿De qué año hablas? Repite la pregunta incluyendo el día, el mes y el año.',
        };
    }
    const week = intent.action === 'chlorine_history' ? requestedWeek(intent, date) : null;
    if (intent.action === 'chlorine_history' && !week) return {
        kind: 'message' as const,
        message: intent.period === 'week_of' && !intent.anchorDate
            ? '¿De qué año hablas? Repite la pregunta incluyendo el día, el mes y el año.'
            : 'No entendí la semana. Prueba: esta semana, hace dos semanas, o la semana del 12 de octubre del 2025.',
    };
    const context = {
        userId, action: intent.action, date: visit?.date ?? date,
        from: week?.from ?? date, to: week?.to ?? date,
        candidateIds: [] as string[], attempts: 0, expires: Date.now() + 5 * 60_000,
    };
    const matches = findPropertyMatches(await listPropertiesWithClient(), intent.target);
    if (!matches.length) return { kind: 'message' as const, message: `No encontré una propiedad para «${intent.target}». Prueba diciendo su nombre completo.` };
    if (matches.length > 1) return askWhichProperty(context, matches);
    return answerForProperty(matches[0], context, userId);
}

export async function confirmVoiceVisit(token: string, userId: string, confirmation: string) {
    if (voiceConfirmation(confirmation) !== 'confirm') {
        throw new AssistantError('Para crear la visita di claramente: sí confirmo.');
    }
    const parsed = previewSchema.safeParse(tokenPayload(token, 'preview', 1200));
    if (!parsed.success || parsed.data.userId !== userId ||
        parsed.data.expires < Date.now() || parsed.data.expires > Date.now() + 5 * 60_000) {
        throw new AssistantError('La confirmación caducó o la fecha ya pasó. Vuelve a dictar la visita.');
    }
    const preview = parsed.data;
    if (preview.action === 'create_reminder') {
        if (!preview.title || !preview.requestId || preview.date < getToday()) throw new AssistantError('El recordatorio caducó.');
        const dueAt = preview.dueAt ? new Date(preview.dueAt) : null;
        if (dueAt && dueAt <= new Date()) throw new AssistantError('La hora del recordatorio ya pasó.');
        await createMyReminder(userId, preview.requestId, preview.title, preview.date, dueAt);
        return { kind: 'message' as const, message: `Recordatorio creado: ${preview.title}. Lo verás en tu Hoy.` };
    }
    if (preview.action === 'start_visit' || preview.action === 'complete_visit') {
        if (!preview.visitId || preview.date !== getToday()) throw new AssistantError('La visita o su fecha cambió.');
        const row = await getVisitWithProperty(preview.visitId);
        if (!row || row.visit.scheduledFor !== getToday()) throw new AssistantError('La visita ya no corresponde a hoy.');
        try {
            if (preview.action === 'start_visit') {
                if (row.visit.status !== 'scheduled') throw new AssistantError('La visita ya no está pendiente de inicio.');
                const started = await applyVisitAction(row.visit.id, 'start', userId);
                if (started?.status !== 'in_progress') throw new AssistantError('La visita cambió antes de iniciarla.');
                return { kind: 'message' as const, message: `Visita iniciada para ${row.property.alias}. Registré tu llegada.` };
            }
            await completeVisitByVoice(row.visit.id, userId, preview.checkedKeys ?? []);
            return { kind: 'message' as const, message: `Visita de ${row.property.alias} cerrada correctamente.` };
        } catch (error) {
            if (error instanceof VisitWorkError) throw new AssistantError(error.message, error.status);
            throw error;
        }
    }
    if (preview.date < getToday() || !preview.propertyId) throw new AssistantError('La fecha de la visita ya pasó.');
    const [property] = await db.select({ id: properties.id, alias: properties.alias }).from(properties)
        .where(eq(properties.id, preview.propertyId)).limit(1);
    if (!property) throw new AssistantError('La propiedad ya no existe. Vuelve a dictar la visita.');
    const { id, created } = await createVisit({
        propertyId: property.id, scheduledFor: preview.date, workType: 'routine',
    });
    return {
        kind: 'message' as const,
        message: created ? `Visita creada para ${property.alias} el ${spokenDate(preview.date)}.` :
            `Ya existía una visita para ${property.alias} el ${spokenDate(preview.date)}.`,
        links: [{ label: 'Abrir visita', href: `/panel/visitas/${id}` }],
    };
}
