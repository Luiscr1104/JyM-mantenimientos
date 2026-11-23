// Solo estas páginas tienen copias preparadas por el service worker.
export function isOfflinePage(pathname: string) {
    return pathname === '/panel' || pathname === '/panel/ruta' ||
        /^\/panel\/visitas\/[0-9a-f-]{36}$/.test(pathname);
}

export async function hasOfflinePage(
    pathname: string,
    search: string,
    date: string,
    read: (path: string) => Promise<Response | undefined>,
) {
    if (!isOfflinePage(pathname)) return false;
    if (pathname.startsWith('/panel/visitas/')) {
        return !search && Boolean(await read(pathname));
    }
    if (pathname === '/panel' && search) return false;
    const requestedDate = pathname === '/panel/ruta'
        ? new URLSearchParams(search).get('date') ?? date : date;
    if (requestedDate !== date) return false;
    const marker = await read('/panel/offline-ready');
    if (!marker) return false;
    const prepared = await marker.json().catch(() => null);
    return prepared?.date === date && Boolean(await read(pathname));
}
