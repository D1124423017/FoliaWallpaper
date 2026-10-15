import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { readJsonBody } from './lyrics/http';
import { broadcastBrowserMedia, openBrowserMediaStream } from './browserMediaStream';
import { mediaSelectionStore } from './media/preference';

// dev/wallpaper/browserMedia.ts — bounded, token-authenticated YouTube timeline relay; never accepts arbitrary URLs.
export interface BrowserMedia { title: string; artist: string; position: number; duration: number; playing: boolean; playbackRate: number; at: number; site?: string }
const sessions = new Map<string, BrowserMedia>();
export function readBrowserMedia(data: Record<string, unknown>, now: number): { id: string; media: BrowserMedia } {
  if (typeof data.id !== 'string' || !/^\d{1,12}$/.test(data.id) || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500
    || typeof data.artist !== 'string' || data.artist.length > 300 || typeof data.playing !== 'boolean'
    || typeof data.position !== 'number' || !Number.isFinite(data.position) || data.position < 0
    || typeof data.duration !== 'number' || !Number.isFinite(data.duration) || data.duration <= 0 || data.duration > 86400 || data.position > data.duration + 1
    || (data.site !== undefined && (typeof data.site !== 'string' || data.site.length > 100 || !/^[a-z0-9.-]+$/i.test(data.site)))
    || (data.playbackRate !== undefined && (typeof data.playbackRate !== 'number' || !Number.isFinite(data.playbackRate) || data.playbackRate < .0625 || data.playbackRate > 16))) throw new Error('Invalid media');
  return { id: data.id, media: { title: data.title.trim(), artist: data.artist.trim(), position: Math.min(data.position, data.duration), duration: data.duration,
    playing: data.playing, playbackRate: typeof data.playbackRate === 'number' ? data.playbackRate : 1, at: now,
    ...(typeof data.site === 'string' ? { site: data.site } : {}) } };
}
export function freshBrowserMedia(now: number): BrowserMedia[] {
  return freshBrowserSources(now).map(value => value.media);
}
export function freshBrowserSources(now: number): { id: string; media: BrowserMedia }[] {
  pruneBrowserSources(now);
  return [...sessions].filter(([, media]) => now - media.at <= 4000).map(([id, media]) => ({ id, media }))
    .sort((a, b) => Number(b.media.playing) - Number(a.media.playing) || b.media.at - a.media.at);
}
function pruneBrowserSources(now: number) { for (const [id, media] of sessions) if (now - media.at > 180000) sessions.delete(id); }
export function browserSourceOptions(now: number) {
  pruneBrowserSources(now);
  return [...sessions].map(([id, media]) => ({ kind: 'browser' as const, id, label: media.site ?? 'YouTube',
    title: media.title, artist: media.artist, playing: now - media.at <= 4000 && media.playing, connected: now - media.at <= 4000 }));
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
    const data = await readJsonBody(req, 8192);
    if (data.type === 'forget-tab' || data.type === 'pin-tab') {
      if (typeof data.id !== 'string' || !/^\d{1,12}$/.test(data.id)) throw new Error('Invalid tab');
      if (data.type === 'forget-tab') { sessions.delete(data.id); broadcastBrowserMedia(); }
      else mediaSelectionStore.set({ kind: 'browser', id: data.id });
      send(200, { saved: true }); return true;
    }
    const { id, media } = readBrowserMedia(data, Date.now());
    freshBrowserMedia(Date.now());
    if (sessions.size >= 8 && !sessions.has(id)) sessions.delete(sessions.keys().next().value!);
    sessions.set(id, media); broadcastBrowserMedia(); send(200, { saved: true });
  } catch { send(400, {}); }
  return true;
}
