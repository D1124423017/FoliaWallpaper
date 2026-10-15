import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { WallpaperInputCdp } from './cdp';
import { readWheelMenuRegion, resolveWheelMenuRegion, mapDesktopWheel, type WheelMenuRegion } from './scope';

// dev/wallpaper/input/session.ts — one bounded menu/input lifecycle per verified wallpaper page.
export class WallpaperWheelSession {
  readonly status = { state: 'menu-closed', menuOpen: false, events: 0, forwarded: 0,
    native: { received: 0, outside: 0, covered: 0, modified: 0, accepted: 0 } };
  private helper: ChildProcessWithoutNullStreams | null = null;
  private screens: unknown = null;
  private region: WheelMenuRegion | null = null;
  private queue = Promise.resolve();
  private queued = 0;
  private stopped = false;
  get alive() { return !this.stopped && this.client.alive; }
  constructor(private client: WallpaperInputCdp, private executable: string) { }
  private stopHelper() {
    this.region = null; this.screens = null; this.status.menuOpen = false;
    this.helper?.stdin.end(); this.helper = null;
  }
  private launch() {
    if (this.helper) return;
    this.screens = null;
    this.status.native = { received: 0, outside: 0, covered: 0, modified: 0, accepted: 0 };
    const child = spawn(this.executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); this.helper = child;
    child.on('error', () => { if (this.helper === child) { this.helper = null; this.status.state = 'helper-unavailable'; } });
    child.on('exit', () => { if (this.helper === child) { this.helper = null; this.status.state = 'helper-stopped'; } });
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (line.length > 4096 || this.stopped || child !== this.helper) return;
      let event; try { event = JSON.parse(line); } catch { return; }
      if (Array.isArray(event.screens)) { this.screens = event.screens; return; }
      if (event.counters && ['received', 'outside', 'covered', 'modified', 'accepted'].every(key => Number.isSafeInteger(event.counters[key]) && event.counters[key] >= 0)) {
        for (const key of Object.keys(this.status.native) as (keyof typeof this.status.native)[]) this.status.native[key] = event.counters[key];
        return;
      }
      if (event.ready === true) { this.status.state = 'ready'; return; }
      const mapped = mapDesktopWheel(event, this.region, Date.now());
      if (!mapped || !this.alive) return;
      this.status.events++;
      if (this.queued >= 32) return; this.queued++;
      // Serial delivery is scoped to this page, including a fresh menu check before each event.
      this.queue = this.queue.then(async () => {
        const current = mapDesktopWheel(event, this.region, Date.now());
        if (!this.alive || !current) return;
        if (!await this.client.evaluate(`!!window.__foliaWallpaperDiagnostics?.native&&!!document.querySelector('.wallpaper-controls-panel')`)) return;
        await this.client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: current.x, y: current.y });
        await this.client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...current }); this.status.forwarded++;
      }).catch(() => { this.status.state = 'disconnected'; this.client.close(); }).finally(() => { this.queued--; });
    });
    child.on('close', () => lines.close());
  }
  async tick() {
    if (!this.alive) return;
    try {
      const snapshot = await this.client.evaluate(`(()=>{const own=window.__foliaWallpaperDiagnostics?.native===true&&/^0\\.7\\.17-wallpaper\\./.test(window.__foliaWallpaperDiagnostics?.build??'');if(!own)return {own:false};const menu=document.querySelector('.wallpaper-controls-panel');if(!menu)return null;const r=menu.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,screenX:window.screenX,screenY:window.screenY,scale:window.devicePixelRatio,viewportWidth:innerWidth,viewportHeight:innerHeight,availX:screen.availLeft,availY:screen.availTop,availWidth:screen.availWidth,availHeight:screen.availHeight};})()`);
      if (snapshot && typeof snapshot === 'object' && 'own' in snapshot && snapshot.own === false) { this.stop(); return; }
      if (!readWheelMenuRegion(snapshot, Date.now())) { this.stopHelper(); this.status.state = 'menu-closed'; return; }
      this.status.menuOpen = true; this.launch();
      this.region = resolveWheelMenuRegion(snapshot, this.screens, Date.now());
      if (!this.region) { this.status.state = 'waiting-for-display'; return; }
      const region = this.region;
      if (this.helper?.stdin.writable && this.helper.stdin.writableLength < 4096) {
        this.helper.stdin.write(JSON.stringify({ x: Math.round((region.x + region.screenX) * region.scale),
          y: Math.round((region.y + region.screenY) * region.scale), width: Math.round(region.width * region.scale),
          height: Math.round(region.height * region.scale) }) + '\n');
      }
    } catch { this.stop(); }
  }
  stop() { this.stopped = true; this.stopHelper(); this.client.close(); }
}
