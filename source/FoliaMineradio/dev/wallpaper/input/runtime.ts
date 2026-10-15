import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WallpaperInputCdp } from './cdp';
import { discoverWallpaperDebugTargets } from './targets';
import { WallpaperWheelSession } from './session';

// dev/wallpaper/input/runtime.ts — supervise independent wheel routes for each Folia wallpaper.
const status = { revision: 'multi-monitor.1', enabled: false, state: 'disabled', menuOpen: false,
  wallpapersConnected: 0, menusOpen: 0, events: 0, forwarded: 0, port: 3192,
  native: { received: 0, outside: 0, covered: 0, modified: 0, accepted: 0 } };
const sessions = new Map<string, WallpaperWheelSession>();
let retiredEvents = 0, retiredForwarded = 0;
export function desktopWheelStatus() {
  const current = [...sessions.values()].map(session => session.status);
  const open = current.filter(item => item.menuOpen);
  return { ...status, menuOpen: open.length > 0, wallpapersConnected: current.length, menusOpen: open.length,
    events: retiredEvents + current.reduce((sum, item) => sum + item.events, 0),
    forwarded: retiredForwarded + current.reduce((sum, item) => sum + item.forwarded, 0),
    native: Object.fromEntries(Object.keys(status.native).map(key => [key,
      current.reduce((sum, item) => sum + item.native[key as keyof typeof item.native], 0)])) };
}
export function startDesktopWheel(): () => void {
  const runtime = process.env.FOLIA_LYRICS_RUNTIME;
  if (process.platform !== 'win32' || !runtime) return () => {};
  try { status.enabled = JSON.parse(fs.readFileSync(path.join(runtime, 'desktop-wheel-enabled.json'), 'utf8')).enabled === true; } catch { }
  if (!status.enabled) return () => {};
  const port = Number(process.env.FOLIA_WHEEL_DEBUG_PORT ?? 3192);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { status.state = 'invalid-port'; return () => {}; }
  status.port = port;
  const executable = fileURLToPath(new URL('./FoliaDesktopWheel.exe', import.meta.url));
  if (!fs.existsSync(executable)) { status.state = 'helper-missing'; return () => {}; }
  let busy = false, stopped = false, nextDiscover = 0;
  const remove = (key: string) => {
    const session = sessions.get(key); if (!session) return;
    retiredEvents += session.status.events; retiredForwarded += session.status.forwarded;
    session.stop(); sessions.delete(key);
  };
  // Rediscover after a wallpaper moves/reloads; each page retains its own coordinate and queue.
  const tick = async () => {
    if (busy || stopped) return; busy = true;
    try {
      if (Date.now() >= nextDiscover) {
        nextDiscover = Date.now() + 2000;
        const targets = await discoverWallpaperDebugTargets(port);
        if (stopped) return;
        const present = new Set(targets.map(target => target.key));
        for (const key of sessions.keys()) if (!present.has(key)) remove(key);
        for (const target of targets) {
          if (sessions.has(target.key)) continue;
          const client = await WallpaperInputCdp.connectTarget(target);
          if (stopped) { client?.close(); return; }
          if (client) sessions.set(target.key, new WallpaperWheelSession(client, executable));
        }
      }
      await Promise.allSettled([...sessions.values()].map(session => session.tick()));
      for (const [key, session] of sessions) if (!session.alive) { remove(key); nextDiscover = 0; }
      const current = [...sessions.values()].map(session => session.status);
      status.state = current.some(item => item.state === 'ready') ? 'ready'
        : current.find(item => item.menuOpen)?.state ?? (current.length ? 'menu-closed' : 'waiting-for-wallpaper');
    } catch { status.state = 'waiting-for-wallpaper'; }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 300); timer.unref(); void tick();
  return () => { stopped = true; clearInterval(timer); for (const key of sessions.keys()) remove(key); status.state = 'stopped'; };
}
