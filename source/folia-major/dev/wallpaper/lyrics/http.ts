import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WallpaperTrack } from '../../../src/wallpaper/types';

// dev/wallpaper/lyrics/http.ts — loopback access and bounded metadata input; this is not an arbitrary URL proxy.
export const LYRIC_SERVICE_PORT = Number(process.env.FOLIA_SERVICE_PORT ?? 3189);
if (!Number.isInteger(LYRIC_SERVICE_PORT) || LYRIC_SERVICE_PORT < 1024 || LYRIC_SERVICE_PORT > 65535) throw new Error('Invalid loopback service port');
export function allowLyricRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (![`127.0.0.1:${LYRIC_SERVICE_PORT}`, `localhost:${LYRIC_SERVICE_PORT}`].includes(req.headers.host ?? '')) { res.writeHead(403).end(); return false; }
  const origin = req.headers.origin;
  const extensionTimeline = req.url === '/browser-media' && typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
  const localOrigins = ['127.0.0.1', 'localhost'].flatMap(host => [3187, LYRIC_SERVICE_PORT].map(port => `http://${host}:${port}`));
  if (origin && origin !== 'null' && !localOrigins.includes(origin) && !extensionTimeline) {
    res.writeHead(403).end(); return false;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Folia-Timeline-Token');
  res.setHeader('Cache-Control', 'no-store');
  return true;
}
export async function readJsonBody(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) { const buffer = Buffer.from(chunk); length += buffer.length; if (length > limit) throw new Error('Input too large'); chunks.push(buffer); }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid object');
  return data;
}
export async function readLyricTrack(req: IncomingMessage): Promise<WallpaperTrack> {
  const data = await readJsonBody(req, 8192);
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500
    || typeof data.artist !== 'string' || data.artist.length > 300
    || typeof data.durationSec !== 'number' || !Number.isFinite(data.durationSec) || data.durationSec < 0 || data.durationSec > 86400) throw new Error('Invalid metadata');
  return { title: data.title.trim(), artist: data.artist.trim(), album: typeof data.album === 'string' ? data.album.slice(0, 500) : '', durationSec: data.durationSec };
}
