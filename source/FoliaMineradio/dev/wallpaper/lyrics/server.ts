import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createBackgroundLyrics } from './background';
import { allowLyricRequest, readLyricTrack, readJsonBody, LYRIC_SERVICE_PORT } from './http';
import { handleAiRequest, aiSettingsUrl } from '../ai/routes';
import { handleBrowserMedia } from '../browserMedia';
import { handleAudioRequest } from '../audio/routes';
import { startAudioWorker, audioRuntimeStatus } from '../audio/runtime';
import { startDesktopWheel, desktopWheelStatus } from '../input/runtime';
import { startSystemMedia, systemMediaSnapshot, systemMediaStatus, systemAudioPlayback, mediaSourcesSnapshot, setMediaSelection } from '../media/runtime';

// dev/wallpaper/lyrics/server.ts — standalone lyrics and user-authorized local audio alignment; no player or account access.
let active = 0;
const server = http.createServer(async (req, res) => {
  if (!allowLyricRequest(req, res)) return;
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status: number, data: unknown) => { if (!res.destroyed) res.writeHead(status).end(JSON.stringify(data)); };
  if (req.url === '/health' && req.method === 'GET') { send(200, { app: 'FoliaWallpaperLyrics', schema: 1, pid: process.pid, runtimeId: process.env.FOLIA_RUNTIME_ID ?? null, active, audio: audioRuntimeStatus(), desktopWheel: desktopWheelStatus(), systemMedia: systemMediaStatus() }); return; }
  if (req.url === '/system-media' && req.method === 'GET') { send(200, systemMediaSnapshot()); return; }
  if (req.url === '/media-sources' && req.method === 'GET') { send(200, mediaSourcesSnapshot()); return; }
  if (req.url === '/media-source' && req.method === 'POST') {
    try { setMediaSelection(await readJsonBody(req, 4096)); send(200, mediaSourcesSnapshot()); }
    catch (error) { send(error instanceof TypeError || error instanceof SyntaxError ? 400 : 503, { error: 'Source selection unavailable' }); }
    return;
  }
  try { if (await handleBrowserMedia(req, res)) return; if (await handleAudioRequest(req, res)) return; if (await handleAiRequest(req, res)) return; } catch { send(503, { error: 'Local service unavailable' }); return; }
  if (req.url !== '/lyrics' || req.method !== 'POST') { send(404, { error: 'Not found' }); return; }
  if (active >= 2) { send(429, { error: 'Busy' }); return; }
  let track;
  try { track = await readLyricTrack(req); } catch { send(400, { error: 'Invalid metadata' }); return; }
  const job = new AbortController(), timer = setTimeout(() => job.abort(), 45_000);
  res.on('close', () => { if (!res.writableEnded) job.abort(); });
  active++;
  try { send(200, { app: 'FoliaWallpaperLyrics', schema: 1, match: await backgroundLyrics.resolve(track, job.signal) }); }
  catch { send(503, { error: 'Lyric matching unavailable' }); }
  finally { active--; clearTimeout(timer); }
});
server.requestTimeout = 10_000;
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(LYRIC_SERVICE_PORT, '127.0.0.1', () => console.log(`Folia wallpaper lyrics: 127.0.0.1:${LYRIC_SERVICE_PORT}`));
const runtime = process.env.FOLIA_LYRICS_RUNTIME;
if (runtime) { await fs.mkdir(runtime, { recursive: true }); await fs.writeFile(path.join(runtime, 'service.pid'), String(process.pid)); await fs.writeFile(path.join(runtime, 'ai-settings.url'), aiSettingsUrl); }
const stopAudioWorker = startAudioWorker();
const stopDesktopWheel = startDesktopWheel();
const stopSystemMedia = startSystemMedia();
const backgroundLyrics = createBackgroundLyrics(() => {
  const media = systemAudioPlayback();
  return media?.playing ? { title: media.title, artist: media.artist, album: media.album, durationSec: media.durationSec } : null;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { backgroundLyrics.stop(); stopDesktopWheel(); stopAudioWorker(); stopSystemMedia(); server.close(); });
