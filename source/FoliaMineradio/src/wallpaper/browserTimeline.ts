import type { WallpaperController } from './controller';

// src/wallpaper/browserTimeline.ts — push seeks / pauses immediately; polling only recovers a disconnected stream.
export function startBrowserTimeline(controller: WallpaperController): () => void {
  const job = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let streamConnected = false, polling = false;
  const receive = (data: { app?: string; schema?: number; sessions?: unknown[] }) => {
    if (data.app !== 'FoliaWallpaperTimeline' || data.schema !== 1 || !Array.isArray(data.sessions)) throw new Error('Invalid timeline bridge');
    for (const media of data.sessions) {
      const before = controller.snapshot;
      controller.apply({ type: 'browser-timeline', data: media, at: Date.now() });
      if (before !== controller.snapshot) break;
    }
    controller.apply({ type: 'browser-expired', data: {}, at: Date.now() });
  };
  const poll = async () => {
    if (polling || streamConnected || job.signal.aborted) return;
    polling = true;
    let delay = 1000;
    try {
      const response = await fetch('http://127.0.0.1:3189/browser-media', { credentials: 'omit', signal: AbortSignal.any([job.signal, AbortSignal.timeout(2500)]) });
      const data = await response.json();
      if (!response.ok) throw new Error('Timeline bridge offline');
      if (!job.signal.aborted && !streamConnected) receive(data);
    } catch { delay = 3000; }
    finally { polling = false; }
    if (!job.signal.aborted && !streamConnected) timer = setTimeout(() => void poll(), delay);
  };
  // Expiry must also run when the stream is interrupted, so an old clock cannot keep advancing.
  const expiry = setInterval(() => controller.apply({ type: 'browser-expired', data: {}, at: Date.now() }), 500);
  const stream = typeof EventSource === 'function' ? new EventSource('http://127.0.0.1:3189/browser-media/events') : null;
  if (stream) {
    stream.onmessage = event => {
      try {
        receive(JSON.parse(event.data)); streamConnected = true;
        if (timer) { clearTimeout(timer); timer = undefined; }
      } catch { streamConnected = false; void poll(); }
    };
    stream.onerror = () => { streamConnected = false; if (!timer) void poll(); };
  } else void poll();
  return () => { job.abort(); stream?.close(); clearInterval(expiry); if (timer) clearTimeout(timer); };
}
