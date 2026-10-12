import type { IncomingMessage, ServerResponse } from 'node:http';

// dev/wallpaper/browserMediaStream.ts — bounded local event streams; drop slow readers and release timers on disconnect.
const listeners = new Set<() => void>();
export function broadcastBrowserMedia() { listeners.forEach(send => send()); }
export function openBrowserMediaStream(req: IncomingMessage, res: ServerResponse, snapshot: () => unknown) {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (listeners.size >= 8) { res.writeHead(429).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = () => {
    if (res.destroyed || res.writableLength > 65536) { res.destroy(); return; }
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
  };
  const timer = setInterval(send, 1000); timer.unref();
  listeners.add(send);
  res.on('close', () => { clearInterval(timer); listeners.delete(send); });
  send();
}
