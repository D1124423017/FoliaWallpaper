import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { readJsonBody } from './lyrics/http';
import { broadcastBrowserMedia, openBrowserMediaStream } from './browserMediaStream';

// dev/wallpaper/browserMedia.ts — bounded, token-authenticated YouTube timeline relay; never accepts arbitrary URLs.
export interface BrowserMedia { title: string; artist: string; position: number; duration: number; playing: boolean; playbackRate: number; at: number }
const sessions = new Map<string, BrowserMedia>();
export function readBrowserMedia(data: Record<string, unknown>, now: number): { id: string; media: BrowserMedia } {
  if (typeof data.id !== 'string' || !/^\d{1,12}$/.test(data.id) || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500
    || typeof data.artist !== 'string' || data.artist.length > 300 || typeof data.playing !== 'boolean'
    || typeof data.position !== 'number' || !Number.isFinite(data.position) || data.position < 0
    || typeof data.duration !== 'number' || !Number.isFinite(data.duration) || data.duration <= 0 || data.duration > 86400 || data.position > data.duration + 1
    || (data.playbackRate !== undefined && (typeof data.playbackRate !== 'number' || !Number.isFinite(data.playbackRate) || data.playbackRate < .0625 || data.playbackRate > 16))) throw new Error('Invalid media');
  return { id: data.id, media: { title: data.title.trim(), artist: data.artist.trim(), position: Math.min(data.position, data.duration), duration: data.duration,
    playing: data.playing, playbackRate: typeof data.playbackRate === 'number' ? data.playbackRate : 1, at: now } };
}
export function freshBrowserMedia(now: number): BrowserMedia[] {
  for (const [id, media] of sessions) if (now - media.at > 4000) sessions.delete(id);
  return [...sessions.values()].sort((a, b) => Number(b.playing) - Number(a.playing) || b.at - a.at);
}
export async function handleBrowserMedia(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const snapshot = () => ({ app: 'FoliaWallpaperTimeline', schema: 1, sessions: freshBrowserMedia(Date.now()) });
  if (req.url === '/browser-media/events') { openBrowserMediaStream(req, res, snapshot); return true; }
  if (req.url !== '/browser-media') return false;
  const send = (status: number, data: unknown) => res.writeHead(status).end(JSON.stringify(data));
  if (req.method === 'GET') { send(200, snapshot()); return true; }
  if (req.method !== 'POST') { send(405, {}); return true; }
  const value = req.headers['x-folia-timeline-token'];
  const runtime = process.env.FOLIA_LYRICS_RUNTIME;
  let token = ''; if (runtime) try { token = (await fs.readFile(path.join(runtime, 'timeline-token'), 'utf8')).trim(); } catch { /* The packaged launcher creates it. */ }
  if (!token || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(value), Buffer.from(token))) { send(403, {}); return true; }
  try {
    const { id, media } = readBrowserMedia(await readJsonBody(req, 8192), Date.now());
    freshBrowserMedia(Date.now());
    if (sessions.size >= 8 && !sessions.has(id)) sessions.delete(sessions.keys().next().value!);
    sessions.set(id, media); broadcastBrowserMedia(); send(200, { saved: true });
  } catch { send(400, {}); }
  return true;
}
