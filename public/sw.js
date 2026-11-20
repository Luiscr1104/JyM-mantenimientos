// El panel contiene datos privados: nunca guardamos HTML, respuestas de API ni credenciales.
const CACHE = 'jym-panel-static-v1';
const STATIC = ['/logoJyM.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(Promise.all([
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key.startsWith('jym-panel-static-') && key !== CACHE)
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
                if (path === '/panel/sin-conexion' && response.ok && !response.redirected) {
                    const cache = await caches.open(CACHE);
                    await cache.put('/panel/sin-conexion', response.clone());
                }
                return response;
            } catch {
                const cached = await caches.match('/panel/sin-conexion');
                if (cached) return cached;
                return Response.error();
            }
        })());
        return;
    }
    if (!path.startsWith('/_astro/') && !STATIC.includes(path)) return;
    event.respondWith(caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
    }));
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
