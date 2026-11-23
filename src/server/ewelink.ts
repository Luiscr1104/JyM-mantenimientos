import { eq } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { EWELINK_APP_ID, EWELINK_APP_SECRET } from 'astro:env/server';
import { db, settings } from '@/db';
import {
    decryptEwelinkTokens, encryptEwelinkTokens, ewelinkSignature,
    EWELINK_CALLBACK, EWELINK_REGION_HOSTS, type EwelinkRegion,
} from '@/lib/ewelink-oauth';
import { safeDevice, safeTelemetry, type EwelinkThing } from '@/lib/ewelink-device';

const TOKEN_KEY = 'ewelink_oauth_tokens';
const TOKEN_BUFFER_MS = 2 * 60_000;

interface Tokens {
    region: EwelinkRegion;
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    refreshExpiresAt: number;
}

export class EwelinkError extends Error {
    constructor(message: string, public code?: number) { super(message); }
}

export function ewelinkConfigured() {
    return Boolean(EWELINK_APP_ID && EWELINK_APP_SECRET);
}

function credentials() {
    if (!EWELINK_APP_ID || !EWELINK_APP_SECRET) throw new EwelinkError('Faltan credenciales eWeLink en el servidor.');
    return { appId: EWELINK_APP_ID, secret: EWELINK_APP_SECRET };
}

export function safeStateEquals(a: string, b: string) {
    const left = createHash('sha256').update(a).digest();
    const right = createHash('sha256').update(b).digest();
    return timingSafeEqual(left, right);
}

async function apiRequest<T>(
    region: EwelinkRegion, path: string, method: 'GET' | 'POST',
    authorization: string, body?: Record<string, string>,
): Promise<T> {
    const { appId } = credentials();
    const response = await fetch(`${EWELINK_REGION_HOSTS[region]}${path}`, {
        method,
        headers: {
            'X-CK-Appid': appId,
            'X-CK-Nonce': crypto.randomUUID().replace(/-/g, '').slice(0, 8),
            Authorization: authorization,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
    });
    // No registrar cuerpos ni cabeceras: en OAuth se reciben tokens.
    if (!response.ok) throw new EwelinkError(`eWeLink respondió HTTP ${response.status}.`, response.status);
    const result = await response.json() as { error?: number; data?: T };
    if (result.error !== 0 || !result.data) {
        throw new EwelinkError(`eWeLink rechazó la consulta (código ${result.error ?? 'desconocido'}).`, result.error);
    }
    return result.data;
}

function signedRequest<T>(region: EwelinkRegion, path: string, body: Record<string, string>) {
    const serialized = JSON.stringify(body);
    return apiRequest<T>(region, path, 'POST',
        `Sign ${ewelinkSignature(credentials().secret, serialized)}`, body);
}

function parseTokens(value: string): Tokens {
    const parsed = decryptEwelinkTokens<Tokens>(value, credentials().secret);
    if (!parsed || !Object.hasOwn(EWELINK_REGION_HOSTS, parsed.region) ||
        typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string' ||
        !Number.isFinite(parsed.accessExpiresAt) || !Number.isFinite(parsed.refreshExpiresAt)) {
        throw new EwelinkError('La conexión eWeLink no es válida. Vincula la cuenta otra vez.');
    }
    return parsed;
}

export async function ewelinkConnected() {
    const [row] = await db.select({ value: settings.value }).from(settings)
        .where(eq(settings.key, TOKEN_KEY)).limit(1);
    return Boolean(row?.value);
}

export async function connectEwelink(code: string, region: EwelinkRegion) {
    const result = await signedRequest<{
        accessToken: string; refreshToken: string; atExpiredTime: number; rtExpiredTime: number;
    }>(region, '/v2/user/oauth/token', {
        code, redirectUrl: EWELINK_CALLBACK, grantType: 'authorization_code',
    });
    if (!result.accessToken || !result.refreshToken ||
        !Number.isFinite(result.atExpiredTime) || !Number.isFinite(result.rtExpiredTime)) {
        throw new EwelinkError('eWeLink no devolvió credenciales completas.');
    }
    const encrypted = encryptEwelinkTokens({
        region, accessToken: result.accessToken, refreshToken: result.refreshToken,
        accessExpiresAt: result.atExpiredTime, refreshExpiresAt: result.rtExpiredTime,
    } satisfies Tokens, credentials().secret);
    await db.insert(settings).values({ key: TOKEN_KEY, value: encrypted })
        .onConflictDoUpdate({ target: settings.key, set: { value: encrypted, updatedAt: new Date() } });
}

async function accessToken(): Promise<{ region: EwelinkRegion; token: string }> {
    const [row] = await db.select({ value: settings.value }).from(settings)
        .where(eq(settings.key, TOKEN_KEY)).limit(1);
    if (!row?.value) throw new EwelinkError('Conecta la cuenta eWeLink primero.');
    let tokens = parseTokens(row.value);
    if (tokens.accessExpiresAt > Date.now() + TOKEN_BUFFER_MS) {
        return { region: tokens.region, token: tokens.accessToken };
    }
    // Refresh token de un solo uso: bloquear la fila para impedir dos renovaciones simultáneas.
    return db.transaction(async (tx) => {
        const [locked] = await tx.select({ value: settings.value }).from(settings)
            .where(eq(settings.key, TOKEN_KEY)).for('update');
        if (!locked?.value) throw new EwelinkError('Conecta la cuenta eWeLink primero.');
        tokens = parseTokens(locked.value);
        if (tokens.accessExpiresAt > Date.now() + TOKEN_BUFFER_MS) {
            return { region: tokens.region, token: tokens.accessToken };
        }
        if (tokens.refreshExpiresAt <= Date.now()) {
            throw new EwelinkError('La autorización eWeLink caducó. Vincula la cuenta otra vez.');
        }
        const refreshed = await signedRequest<{ at: string; rt: string }>(
            tokens.region, '/v2/user/refresh', { rt: tokens.refreshToken },
        );
        if (!refreshed.at || !refreshed.rt) throw new EwelinkError('No se pudo renovar la autorización eWeLink.');
        const next: Tokens = {
            ...tokens, accessToken: refreshed.at, refreshToken: refreshed.rt,
            accessExpiresAt: Date.now() + 30 * 24 * 60 * 60_000,
            refreshExpiresAt: Date.now() + 60 * 24 * 60 * 60_000,
        };
        await tx.update(settings).set({
            value: encryptEwelinkTokens(next, credentials().secret), updatedAt: new Date(),
        }).where(eq(settings.key, TOKEN_KEY));
        return { region: next.region, token: next.accessToken };
    });
}

export async function listEwelinkDevices() {
    const { region, token } = await accessToken();
    let total = 0;
    let beginIndex: number | null = null;
    const found = new Map<string, NonNullable<ReturnType<typeof safeDevice>>>();
    for (let page = 0; page < 20; page++) {
        const query = new URLSearchParams({ lang: 'en', num: '30' });
        if (beginIndex !== null) query.set('beginIndex', String(beginIndex));
        const result = await apiRequest<{ total: number; thingList: EwelinkThing[] }>(
            region, `/v2/device/thing?${query}`, 'GET', `Bearer ${token}`,
        );
        if (!Array.isArray(result.thingList) || !Number.isInteger(result.total)) {
            throw new EwelinkError('eWeLink no devolvió una lista de equipos válida.');
        }
        total = result.total;
        for (const thing of result.thingList) {
            const device = safeDevice(thing);
            if (device) found.set(device.id, device);
        }
        // El total incluye también equipos de marcas no autorizadas por esta APPID.
        if (result.thingList.length < 30 || found.size >= total) break;
        const lastIndex = result.thingList.at(-1)?.index;
        if (!Number.isInteger(lastIndex) || (beginIndex !== null && lastIndex! < beginIndex)) {
            throw new EwelinkError('No se pudo completar la paginación de eWeLink.');
        }
        beginIndex = lastIndex! + 1;
        if (page === 19) throw new EwelinkError('Demasiados equipos para mostrar en una consulta.');
        // La API limita las llamadas consecutivas al mismo endpoint.
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return {
        total,
        devices: [...found.values()],
    };
}

export async function readEwelinkDeviceStatus(id: string) {
    const { region, token } = await accessToken();
    const url = new URL('/v2/device/thing/status', EWELINK_REGION_HOSTS[region]);
    url.searchParams.set('type', '1');
    url.searchParams.set('id', id);
    const result = await apiRequest<{ params: unknown }>(region,
        `${url.pathname}${url.search}`, 'GET', `Bearer ${token}`);
    return safeTelemetry(result.params);
}
