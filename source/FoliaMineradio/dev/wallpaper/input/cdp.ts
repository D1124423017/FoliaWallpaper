import type { WallpaperDebugTarget } from './targets';

// dev/wallpaper/input/cdp.ts — bounded connection to our own local Wallpaper Engine page only.
export class WallpaperInputCdp {
  private socket: WebSocket;
  private id = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  alive = true;
  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      let data; try { data = JSON.parse(String(event.data)); } catch { return; }
      const job = this.pending.get(data.id); if (!job) return;
      this.pending.delete(data.id); clearTimeout(job.timer);
      if (data.error) job.reject(new Error('Local wallpaper request failed')); else job.resolve(data.result);
    });
    socket.addEventListener('close', () => this.close()); socket.addEventListener('error', () => this.close());
  }
  static async connectTarget(target: WallpaperDebugTarget): Promise<WallpaperInputCdp | null> {
      const socket = new WebSocket(target.debugUrl);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { socket.close(); reject(new Error('Local wallpaper connection timeout')); }, 1000);
          socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
          socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Local wallpaper unavailable')); }, { once: true });
        });
        const client = new WallpaperInputCdp(socket);
        const own = await client.evaluate(`({native:window.__foliaWallpaperDiagnostics?.native,build:window.__foliaWallpaperDiagnostics?.build})`);
        if (own && typeof own === 'object' && (own as { native?: boolean }).native === true
          && /^0\.7\.17-wallpaper\./.test(String((own as { build?: string }).build))) return client;
        client.close();
      } catch { socket.close(); }
    return null;
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.alive || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Local wallpaper disconnected'));
    return new Promise((resolve, reject) => {
      const id = ++this.id, timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Local wallpaper timed out')); }, 900);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', { expression: `JSON.stringify(${expression})`, returnByValue: true }) as {
      exceptionDetails?: unknown; result?: { value?: string } };
    if (result.exceptionDetails || typeof result.result?.value !== 'string') throw new Error('Local wallpaper state unavailable');
    return JSON.parse(result.result.value);
  }
  close() {
    if (!this.alive) return; this.alive = false;
    for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error('Local wallpaper disconnected')); }
    this.pending.clear(); this.socket.close();
  }
}
