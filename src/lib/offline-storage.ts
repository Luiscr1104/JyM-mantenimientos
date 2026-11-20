import type { OfflineVisit } from './offline-visit';

const DB_NAME = 'jym-private-offline-v1';
const STORE = 'visits';

interface EncryptedRecord {
    id: string;
    userId: string;
    salt: string;
    iv: string;
    data: string;
    pending: boolean;
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

const derivedKeys = new Map<string, Promise<CryptoKey>>();
async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); resolve(request.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function keyFor(pin: string, salt: Uint8Array<ArrayBuffer>) {
    const cacheKey = `${bytesToBase64(salt)}:${pin}`;
    const cached = derivedKeys.get(cacheKey);
    if (cached) return cached;
    const promise = deriveKey(pin, salt);
    derivedKeys.set(cacheKey, promise);
    return promise;
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin),
        'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({
        name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256',
    }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function listEncrypted(): Promise<EncryptedRecord[]> {
    return operation('readonly', (store) => store.getAll());
}

export async function readEncrypted(record: EncryptedRecord, pin: string): Promise<OfflineVisit> {
    const key = await keyFor(pin, base64ToBytes(record.salt));
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(record.iv) },
        key, base64ToBytes(record.data));
    return JSON.parse(new TextDecoder().decode(clear)) as OfflineVisit;
}

export async function saveEncrypted(visit: OfflineVisit, userId: string, pin: string): Promise<void> {
    const previous = (await operation<EncryptedRecord | undefined>('readonly',
        (store) => store.get(visit.id))) ?? null;
    const salt = previous ? base64ToBytes(previous.salt) : crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFor(pin, salt);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
        new TextEncoder().encode(JSON.stringify(visit)));
    await operation('readwrite', (store) => store.put({
        id: visit.id, userId, salt: bytesToBase64(salt), iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(encrypted)), pending: visit.pending,
    } satisfies EncryptedRecord));
}

export async function removeEncrypted(id: string): Promise<void> {
    await operation('readwrite', (store) => store.delete(id));
}

export async function clearOfflineData(): Promise<void> {
    derivedKeys.clear();
    const db = await openDb();
    db.close();
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Cierra otras ventanas del panel antes de salir.'));
    });
    if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('jym-session');
        channel.postMessage('signed-out');
        channel.close();
    }
}
