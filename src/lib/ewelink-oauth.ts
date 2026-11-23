import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export const EWELINK_CALLBACK = 'https://jymmantenimientos.com/auth/ewelink/callback';
export const EWELINK_REGION_HOSTS = {
    us: 'https://us-apia.coolkit.cc',
    eu: 'https://eu-apia.coolkit.cc',
    as: 'https://as-apia.coolkit.cc',
    cn: 'https://cn-apia.coolkit.cn',
} as const;

export type EwelinkRegion = keyof typeof EWELINK_REGION_HOSTS;

export function ewelinkRegion(value: string | null): EwelinkRegion | null {
    return value && Object.hasOwn(EWELINK_REGION_HOSTS, value)
        ? value as EwelinkRegion : null;
}

export function ewelinkSignature(secret: string, message: string) {
    return createHmac('sha256', secret).update(message).digest('base64');
}

export function authorizationUrl(appId: string, secret: string, state: string,
    seq: string, nonce: string) {
    const url = new URL('https://c2ccdn.coolkit.cc/oauth/index.html');
    url.search = new URLSearchParams({
        clientId: appId,
        seq,
        authorization: ewelinkSignature(secret, `${appId}_${seq}`),
        redirectUrl: EWELINK_CALLBACK,
        grantType: 'authorization_code',
        state,
        nonce,
        showQRCode: 'false',
    }).toString();
    return url.toString();
}

// Una clave distinta de la firma OAuth, derivada de un secreto exclusivo del servidor.
// El valor guardado en PostgreSQL no contiene accessToken ni refreshToken en claro.
function encryptionKey(secret: string) {
    return createHash('sha256').update('jym:ewelink:tokens:v1:').update(secret).digest();
}

export function encryptEwelinkTokens(value: unknown, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptEwelinkTokens<T>(value: string, secret: string): T {
    const [version, iv, tag, ciphertext] = value.split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Credenciales eWeLink inválidas.');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final(),
    ]).toString('utf8')) as T;
}
