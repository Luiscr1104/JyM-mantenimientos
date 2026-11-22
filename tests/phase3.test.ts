import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { offlineSyncSchema } from '../src/lib/offline-visit';
import { isObsoleteLocalVisit, syncBody, todayVisitIds, type LocalVisit } from '../src/lib/automatic-visits';
import { emptyChecklist, getCompletionIssue } from '../src/lib/visit-work';

const valid = () => ({
    syncId: '208663c1-b445-413a-bd39-79335946319d',
    visitId: 'a8aff1e6-7759-494c-9423-6a6a3fbd2e26',
    expectedUpdatedAt: '2026-11-19T12:00:00.000Z',
    startedAt: '2026-11-19T12:01:00.000Z',
    pumpStartedAt: '2026-11-19T12:02:00.000Z',
    pumpStoppedAt: '2026-11-19T12:30:00.000Z',
    completedAt: '2026-11-19T13:00:00.000Z',
    work: {
        workTypes: ['routine'],
        checklist: emptyChecklist(),
        notes: '',
        pendingReason: 'Faltó una tarea por falta de acceso.',
    },
    products: [{ product: 'granulated_chlorine', quantity: 20 }],
    existingProducts: [],
});

test('los cierres offline exigen estructura y productos válidos', () => {
    assert.equal(offlineSyncSchema.safeParse(valid()).success, true);
    assert.equal(offlineSyncSchema.safeParse({ ...valid(), syncId: 'no-id' }).success, false);
    assert.equal(offlineSyncSchema.safeParse({ ...valid(), products: [{ product: 'caustic_base', quantity: -3 }] }).success, false);
});

test('el progreso parcial se puede enviar antes del cierre y validar eliminaciones', () => {
    const partial = { ...valid(), completedAt: null, pumpStoppedAt: null };
    const parsed = offlineSyncSchema.parse(partial);
    assert.equal(parsed.completedAt, null);
    assert.deepEqual(parsed.removedProducts, []);
    assert.equal(offlineSyncSchema.safeParse({ ...partial, removedProducts: [-1] }).success, false);
    assert.equal(offlineSyncSchema.safeParse({ ...partial, removedProducts: [100] }).success, false);
});

test('la cola incluye el identificador estable, cambios y productos eliminados', () => {
    const source = {
        ...valid(), id: valid().visitId, ownerId: 'user-1', propertyName: 'Prueba',
        address: '', gateCode: null, accessNotes: null, pumpNotes: null,
        date: '2026-11-19', status: 'in_progress', pending: true,
        products: [{ product: 'granulated_chlorine', quantity: 5 }],
        addedProducts: [{ product: 'granulated_chlorine', quantity: 20 }],
        removedProducts: [0],
    } as LocalVisit;
    const body = syncBody(source);
    assert.deepEqual(body.removedProducts, [0]);
    assert.deepEqual(body.existingProducts, source.products);
    assert.deepEqual(body.products, source.addedProducts);
    assert.equal(body.syncId, source.syncId);
});

test('un día sin visitas vigentes descarta solo copias locales sin trabajo pendiente', () => {
    const source = {
        ...valid(), id: valid().visitId, ownerId: 'user-1', propertyName: 'Prueba',
        address: '', gateCode: null, accessNotes: null, pumpNotes: null,
        date: '2026-11-22', status: 'scheduled', pending: false, completedAt: null,
        products: [], addedProducts: [], removedProducts: [],
    } as LocalVisit;
    const date = '2026-11-22';
    assert.equal(isObsoleteLocalVisit(source, date, new Set()), true);
    assert.equal(isObsoleteLocalVisit(source, date, new Set([source.id])), false);
    assert.equal(isObsoleteLocalVisit(source, '2026-11-23', new Set()), false);
    assert.equal(isObsoleteLocalVisit({ ...source, pending: true }, date, new Set()), false);
    assert.equal(isObsoleteLocalVisit({ ...source, conflict: 'Revisar' }, date, new Set()), false);
    assert.equal(isObsoleteLocalVisit({ ...source, completedAt: '2026-11-22T13:00:00Z' }, date, new Set()), false);
    assert.deepEqual(todayVisitIds([source], date, null), [source.id]);
    assert.deepEqual(todayVisitIds([source], date, []), []);
    assert.deepEqual(todayVisitIds([source], date, ['otra-visita']), ['otra-visita']);
});

test('el shell guarda páginas de visitas, no respuestas API, y avisa sobre cierre pendiente', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    assert.match(sw, /prefetch-visits/);
    assert.match(sw, /request\.mode === 'navigate'/);
    assert.match(sw, /\/panel\/visitas\//);
    assert.match(readFileSync('src/components/panel/VisitWorkspace.tsx', 'utf8'), /pendiente de confirmar en el servidor/);
    assert.doesNotMatch(readFileSync('src/pages/panel/index.astro', 'utf8'), /OfflinePrep/);
    assert.match(readFileSync('src/components/panel/AutomaticVisitStatus.tsx', 'utf8'), /refreshToday\(userId\)/);
});

test('una caché llena no impide mostrar la página recibida por internet', async () => {
    type TestFetchEvent = {
        request: { method: string; url: string; mode: string };
        respondWith: (response: Promise<Response>) => void;
        waitUntil: (job: Promise<unknown>) => void;
    };
    const handlers = new Map<string, (event: TestFetchEvent) => void>();
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
        self: {
            location: { origin: 'https://jym-mantenimientos.vercel.app' },
            addEventListener: (type: string, handler: (event: TestFetchEvent) => void) => handlers.set(type, handler),
        },
        caches: {
            open: async () => ({ put: async () => { throw new Error('QuotaExceededError'); } }),
            match: async () => null,
        },
        fetch: async () => new Response('<h1>Hoy</h1>', { headers: { 'content-type': 'text/html' } }),
        Response, URL, AbortSignal, setTimeout, console: { warn: () => {} },
    });
    let received: Promise<Response> | undefined;
    const jobs: Promise<unknown>[] = [];
    handlers.get('fetch')!({
        request: { method: 'GET', mode: 'navigate', url: 'https://jym-mantenimientos.vercel.app/panel' },
        respondWith: (response) => { received = response; },
        waitUntil: (job) => { jobs.push(job); },
    });
    assert.ok(received);
    assert.equal(await (await received).text(), '<h1>Hoy</h1>');
    await Promise.all(jobs);
});

test('con red lenta se abre la página preparada y la respuesta posterior actualiza la copia', async () => {
    const handlers = new Map<string, (event: {
        request: { method: string; url: string; mode: string };
        respondWith: (response: Promise<Response>) => void;
        waitUntil: (job: Promise<unknown>) => void;
    }) => void>();
    let finishNetwork!: (response: Response) => void;
    const network = new Promise<Response>((resolve) => { finishNetwork = resolve; });
    const saved: string[] = [];
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
        self: {
            location: { origin: 'https://jym.test' },
            addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
        },
        caches: {
            match: async () => new Response('Copia local'),
            open: async () => ({ put: async (_path: string, response: Response) => {
                saved.push(await response.text());
            } }),
        },
        fetch: async () => network,
        Response, URL, AbortSignal, clearTimeout,
        setTimeout: (callback: () => void) => { queueMicrotask(callback); },
        console: { warn: () => {} },
    });
    let received!: Promise<Response>;
    const jobs: Promise<unknown>[] = [];
    handlers.get('fetch')!({
        request: { method: 'GET', mode: 'navigate',
            url: 'https://jym.test/panel/visitas/a8aff1e6-7759-494c-9423-6a6a3fbd2e26' },
        respondWith: (response) => { received = response; },
        waitUntil: (job) => { jobs.push(job); },
    });
    assert.equal(await (await received).text(), 'Copia local');
    finishNetwork(new Response('Página nueva', { headers: { 'content-type': 'text/html' } }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.all(jobs);
    assert.deepEqual(saved, ['Página nueva']);
});

test('sin página preparada ni red se muestra un error con salida, no un spinner infinito', async () => {
    const handlers = new Map<string, (event: {
        request: { method: string; url: string; mode: string };
        respondWith: (response: Promise<Response>) => void;
        waitUntil: (job: Promise<unknown>) => void;
    }) => void>();
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
        self: {
            location: { origin: 'https://jym.test' },
            addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
        },
        caches: { match: async () => null },
        fetch: async () => { throw new Error('Sin conexión'); },
        Response, URL, AbortSignal, console: { warn: () => {} },
    });
    let received!: Promise<Response>;
    handlers.get('fetch')!({
        request: { method: 'GET', mode: 'navigate', url: 'https://jym.test/panel/agenda' },
        respondWith: (response) => { received = response; },
        waitUntil: () => {},
    });
    const response = await received;
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Esta página no está disponible sin conexión/);
});

test('Ruta no presenta el recorrido de otro día cuando falta red', async () => {
    const handlers = new Map<string, (event: {
        request: { method: string; url: string; mode: string };
        respondWith: (response: Promise<Response>) => void;
        waitUntil: (job: Promise<unknown>) => void;
    }) => void>();
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
        self: {
            location: { origin: 'https://jym.test' },
            addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
        },
        caches: { match: async (path: string) => path === '/panel/offline-ready'
            ? new Response(JSON.stringify({ date: '2026-11-22' })) : new Response('Ruta de ayer') },
        fetch: async () => { throw new Error('Sin conexión'); },
        Response, URL, AbortSignal, console: { warn: () => {} },
    });
    let received!: Promise<Response>;
    handlers.get('fetch')!({
        request: { method: 'GET', mode: 'navigate', url: 'https://jym.test/panel/ruta?date=2026-11-23' },
        respondWith: (response) => { received = response; },
        waitUntil: () => {},
    });
    assert.equal((await received).status, 503);
});

test('si el servidor responde con error, la visita preparada sigue disponible', async () => {
    const handlers = new Map<string, (event: {
        request: { method: string; url: string; mode: string };
        respondWith: (response: Promise<Response>) => void;
        waitUntil: (job: Promise<unknown>) => void;
    }) => void>();
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
        self: {
            location: { origin: 'https://jym.test' },
            addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
        },
        caches: { match: async () => new Response('Visita preparada') },
        fetch: async () => new Response('Fallo del servidor', { status: 503 }),
        Response, URL, AbortSignal, setTimeout, clearTimeout, console: { warn: () => {} },
    });
    let received!: Promise<Response>;
    handlers.get('fetch')!({
        request: { method: 'GET', mode: 'navigate',
            url: 'https://jym.test/panel/visitas/a8aff1e6-7759-494c-9423-6a6a3fbd2e26' },
        respondWith: (response) => { received = response; },
        waitUntil: () => {},
    });
    assert.equal(await (await received).text(), 'Visita preparada');
});

test('la jornada solo figura lista si existen Hoy, Ruta, visitas y recursos', async () => {
    type MessageEvent = {
        data: { type: string; ids: string[]; date: string };
        ports: Array<{ postMessage: (data: any) => void }>;
        waitUntil: (job: Promise<unknown>) => void;
    };
    const handlers = new Map<string, (event: MessageEvent) => void>();
    const stores = new Map<string, Map<string, Response>>();
    const cache = (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const entries = stores.get(name)!;
        return {
            put: async (path: string, response: Response) => { entries.set(path, response); },
            match: async (path: string) => entries.get(path)?.clone(),
        };
    };
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
        self: {
            location: { origin: 'https://jym.test' },
            addEventListener: (type: string, handler: (event: MessageEvent) => void) => handlers.set(type, handler),
        },
        caches: {
            open: async (name: string) => cache(name),
            delete: async (name: string) => stores.delete(name),
        },
        fetch: async (path: string) => path.startsWith('/_astro/')
            ? new Response('export const ready = true')
            : new Response('<script src="/_astro/campo.js"></script>', {
                headers: { 'content-type': 'text/html' },
            }),
        Response, URL, AbortSignal, console: { warn: () => {} },
    });
    const id = 'a8aff1e6-7759-494c-9423-6a6a3fbd2e26';
    const send = async (type: string, ids = [id]) => {
        let reply!: (value: any) => void;
        const result = new Promise<any>((resolve) => { reply = resolve; });
        const jobs: Promise<unknown>[] = [];
        handlers.get('message')!({
            data: { type, ids, date: '2026-11-22' },
            ports: [{ postMessage: reply }],
            waitUntil: (job) => { jobs.push(job); },
        });
        const data = await result;
        await Promise.all(jobs);
        return data;
    };
    assert.equal((await send('offline-status')).ready, false);
    assert.equal((await send('prefetch-visits')).ok, true);
    assert.deepEqual(Array.from((await send('offline-status')).available), [id]);
    assert.equal((await send('offline-status')).ready, true);
    assert.equal((await send('offline-status', [])).ready, false);
    assert.equal((await send('prefetch-visits', [])).ok, true);
    assert.equal((await send('offline-status', [])).ready, true);
    stores.get('jym-panel-static-v3')!.delete('/_astro/campo.js');
    assert.equal((await send('offline-status', [])).ready, false);
});

test('el protocolo de salida se mantiene antes de sincronizar', () => {
    const checklist = emptyChecklist();
    assert.match(getCompletionIssue(checklist, valid().work.pendingReason, false, ['routine'])!, /tres pasos/);
    checklist.exitEquipment = true;
    checklist.exitTools = true;
    checklist.exitAccess = true;
    assert.match(getCompletionIssue(checklist, valid().work.pendingReason, true, ['routine'])!, /bomba/);
    assert.equal(getCompletionIssue(checklist, valid().work.pendingReason, false, ['routine']), null);
});

test('el manifiesto de la PWA instalada abre el panel', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    assert.equal(manifest.start_url, '/panel');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.some((icon: { src: string }) => icon.src === '/logoJyM.png'));
});

test('las tablas nuevas y el historial de eventos mantienen RLS', () => {
    const sql = readFileSync('drizzle/0007_wandering_black_tarantula.sql', 'utf8') +
        readFileSync('drizzle/0008_typical_firelord.sql', 'utf8');
    for (const table of ['push_subscriptions', 'reminder_deliveries', 'offline_visit_syncs', 'visit_events']) {
        assert.ok(sql.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`));
    }
});
