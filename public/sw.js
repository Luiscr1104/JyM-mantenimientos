// Para abrir visitas sin internet se guardan únicamente páginas del panel autenticado
// y recursos estáticos; las respuestas de API y credenciales nunca se cachean.
const CACHE = 'jym-panel-static-v2';
const PAGES = 'jym-panel-pages-v2';
let privateEpoch = 0;
let prefetchJob = null;
let prefetchSnapshot = null;
const STATIC = ['/logoJyM.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(Promise.all([
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => (key.startsWith('jym-panel-static-') && key !== CACHE) ||
                (key.startsWith('jym-panel-pages-') && key !== PAGES))
                .map((key) => caches.delete(key)))),
        self.clients.claim(),
    ]));
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
    const path = new URL(request.url).pathname;
    if (request.mode === 'navigate' && (path === '/panel' || path.startsWith('/panel/'))) {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response.ok && !response.redirected &&
                    response.headers.get('content-type')?.includes('text/html') &&
                    (path === '/panel' || path === '/panel/ruta' ||
                        /^\/panel\/visitas\/[0-9a-f-]{36}$/.test(path))) {
                    const epoch = privateEpoch;
                    const copy = response.clone();
                    event.waitUntil(caches.open(PAGES).then((cache) =>
                        epoch === privateEpoch ? cache.put(path, copy) : undefined
                    ).catch((error) => console.warn('No se pudo guardar la página offline:', error)));
                }
                return response;
            } catch {
                const cached = await caches.match(path);
                if (cached) return cached;
                return Response.error();
            }
        })());
        return;
    }
    if (!path.startsWith('/_astro/') && !STATIC.includes(path)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE).catch(() => null);
        const cached = await cache?.match(request).catch(() => null);
        if (cached) return cached;
        const response = await fetch(request);
        if (cache && response.ok && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(cache.put(request, copy)
                .catch((error) => console.warn('No se pudo guardar el recurso offline:', error)));
        }
        return response;
    })());
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'clear-private') {
        privateEpoch++;
        event.waitUntil(caches.delete(PAGES));
    }
    if (event.data?.type === 'prefetch-visits') {
        const snapshot = JSON.stringify({ date: event.data.date, ids: event.data.ids });
        if (prefetchJob && snapshot !== prefetchSnapshot) {
            event.ports[0]?.postMessage({ ok: false });
            return;
        }
        if (!prefetchJob) {
            prefetchSnapshot = snapshot;
            prefetchJob = (async () => {
                const epoch = privateEpoch;
                const pageCache = await caches.open(PAGES);
                const assetCache = await caches.open(CACHE);
                const assetQueue = [];
                const seen = new Set();
                let failed = false;
                for (const path of ['/panel', `/panel/ruta?date=${event.data.date}`,
                    ...[...new Set(event.data.ids)].map((id) => `/panel/visitas/${id}`)]) {
                    if (epoch !== privateEpoch) break;
                    try {
                        const response = await fetch(path, {
                            credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15_000),
                        });
                        if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) {
                            failed = true;
                            continue;
                        }
                        await pageCache.put(path.startsWith('/panel/ruta?') ? '/panel/ruta' : path, response.clone());
                        const html = await response.text();
                        for (const match of html.matchAll(/(?:src|href)="(\/_astro\/[^"]+)"/g)) {
                            assetQueue.push(match[1]);
                        }
                    } catch { failed = true; }
                }
                while (assetQueue.length && seen.size < 250) {
                    const path = assetQueue.shift();
                    if (seen.has(path)) continue;
                    seen.add(path);
                    try {
                        const cached = await assetCache.match(path);
                        const asset = cached || await fetch(path);
                        if (!asset.ok) { failed = true; continue; }
                        if (!cached) await assetCache.put(path, asset.clone());
                        if (path.endsWith('.js')) {
                            const code = await asset.text();
                            for (const match of code.matchAll(/(?:from\s*|import\s*|import\()(["'])(\.\/[^"']+)\1/g)) {
                                const imported = new URL(match[2], new URL(path, self.location.origin)).pathname;
                                if (imported.startsWith('/_astro/')) assetQueue.push(imported);
                            }
                        }
                    } catch { failed = true; }
                }
                if (epoch !== privateEpoch) await caches.delete(PAGES);
                return epoch === privateEpoch && !failed && !assetQueue.length;
            })();
        }
        const job = prefetchJob;
        event.waitUntil(job.then(
            (ok) => event.ports[0]?.postMessage({ ok }),
            (error) => {
                console.warn('No se pudo preparar la copia offline:', error);
                event.ports[0]?.postMessage({ ok: false });
            },
        ).finally(() => {
            if (prefetchJob === job) {
                prefetchJob = null;
                prefetchSnapshot = null;
            }
        }));
    }
});

self.addEventListener('push', (event) => {
    if (!event.data) return;
    let data;
    try { data = event.data.json(); } catch { return; }
    const path = typeof data.path === 'string' && data.path.startsWith('/panel/')
        ? data.path : '/panel';
    event.waitUntil(self.registration.showNotification(data.title || 'Recordatorio JyM', {
        body: data.body || 'Revisa el panel.',
        icon: '/logoJyM.png',
        badge: '/logoJyM.png',
        tag: data.tag || undefined,
        data: { path },
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const path = event.notification.data?.path || '/panel';
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
        const open = clients.find((client) => new URL(client.url).pathname === path);
        if (open) return open.focus();
        return self.clients.openWindow(path);
    }));
});
