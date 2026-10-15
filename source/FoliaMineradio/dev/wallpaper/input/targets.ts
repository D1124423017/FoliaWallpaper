// dev/wallpaper/input/targets.ts — discover our wallpaper pages on both local CEF bindings.
export interface WallpaperDebugTarget { key: string; debugUrl: string }
export function readWallpaperDebugTarget(page: unknown, port: number, host: string): WallpaperDebugTarget | null {
  if (!page || typeof page !== 'object' || !['127.0.0.1', '[::1]'].includes(host)) return null;
  const item = page as Record<string, unknown>;
  if (item.type !== 'page' || typeof item.url !== 'string' || typeof item.webSocketDebuggerUrl !== 'string') return null;
  try {
    const file = new URL(item.url), endpoint = new URL(item.webSocketDebuggerUrl);
    if (file.protocol !== 'file:' || file.hostname || !/\/index\.html$/.test(file.pathname)
      || !/\/wallpaper_engine\//i.test(file.pathname) || endpoint.protocol !== 'ws:'
      || endpoint.hostname !== host || Number(endpoint.port) !== port
      || !endpoint.pathname.startsWith('/devtools/page/')) return null;
    return { key: endpoint.href, debugUrl: endpoint.href };
  } catch { return null; }
}
export async function discoverWallpaperDebugTargets(port: number): Promise<WallpaperDebugTarget[]> {
  const replies = await Promise.allSettled(['127.0.0.1', '[::1]'].map(async host => {
    const reply = await fetch(`http://${host}:${port}/json/list`, { signal: AbortSignal.timeout(700) });
    const pages = await reply.json();
    return Array.isArray(pages) ? pages.slice(0, 8).flatMap(page => {
      const target = readWallpaperDebugTarget(page, port, host); return target ? [target] : [];
    }) : [];
  }));
  return [...new Map(replies.flatMap(reply => reply.status === 'fulfilled' ? reply.value : [])
    .map(target => [target.key, target])).values()].slice(0, 8);
}
