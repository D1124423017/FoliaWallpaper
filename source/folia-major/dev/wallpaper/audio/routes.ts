import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody } from '../lyrics/http';
import { readAudioAlignment, updateAudioPlayback, rememberAudioCandidate, type AudioPlayback } from './runtime';
import type { WallpaperLyrics, WallpaperTrack } from '../../../src/wallpaper/types';

// dev/wallpaper/audio/routes.ts — bounded media observations only, no audio upload endpoint or microphone access.
export async function handleAudioRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1:3189');
  if (url.pathname === '/audio-candidate' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req, 512_000);
      const candidate = data.candidate as WallpaperLyrics | undefined;
      if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500 || typeof data.artist !== 'string' || data.artist.length > 300
        || typeof data.durationSec !== 'number' || !Number.isFinite(data.durationSec) || data.durationSec < 0 || data.durationSec > 86400
        || candidate?.alignment !== 'unverified' || typeof candidate.origin !== 'string' || candidate.origin.length > 500
        || !Array.isArray(candidate.lyrics?.lines) || candidate.lyrics.lines.length > 500) throw new Error('Invalid candidate');
      const finiteTime = (time: unknown) => typeof time === 'number' && Number.isFinite(time) && time >= 0 && time <= 86400;
      const lines = candidate.lyrics.lines.map(line => {
        if (typeof line.fullText !== 'string' || line.fullText.length > 2000 || !finiteTime(line.startTime) || !finiteTime(line.endTime)
          || !Array.isArray(line.words) || line.words.length > 128) throw new Error('Invalid lyric line');
        const words = line.words.map(word => {
          if (typeof word.text !== 'string' || word.text.length > 500 || !finiteTime(word.startTime) || !finiteTime(word.endTime)) throw new Error('Invalid lyric word');
          return { text: word.text, startTime: word.startTime, endTime: word.endTime };
        });
        return { fullText: line.fullText, startTime: line.startTime, endTime: line.endTime, words };
      });
      rememberAudioCandidate({ title: data.title, artist: data.artist, album: typeof data.album === 'string' ? data.album.slice(0, 500) : '', durationSec: data.durationSec } satisfies WallpaperTrack,
        { origin: candidate.origin, alignment: 'unverified', durationVerified: false, lyrics: { lines, isWordByWord: candidate.lyrics.isWordByWord } });
      res.writeHead(200).end('{"saved":true}');
    } catch { res.writeHead(400).end('{}'); }
    return true;
  }
  if (url.pathname === '/audio-alignment' && req.method === 'GET') {
    const key = url.searchParams.get('key') ?? '';
    if (!key || key.length > 2048) { res.writeHead(400).end('{}'); return true; }
    res.writeHead(200).end(JSON.stringify({ app: 'FoliaWallpaperAudio', schema: 1, state: readAudioAlignment(key) }));
    return true;
  }
  if (url.pathname !== '/audio-playback' || req.method !== 'POST') return false;
  try {
    const data = await readJsonBody(req, 8192), now = Date.now();
    if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500 || typeof data.artist !== 'string' || data.artist.length > 300
      || typeof data.durationSec !== 'number' || !Number.isFinite(data.durationSec) || data.durationSec <= 0 || data.durationSec > 86400
      || typeof data.positionSec !== 'number' || !Number.isFinite(data.positionSec) || data.positionSec < 0 || data.positionSec > data.durationSec + 1
      || typeof data.playbackRate !== 'number' || !Number.isFinite(data.playbackRate) || data.playbackRate < .0625 || data.playbackRate > 16
      || typeof data.playing !== 'boolean' || typeof data.at !== 'number' || Math.abs(now - data.at) > 4000) throw new Error('Invalid media');
    updateAudioPlayback({ ...data, album: typeof data.album === 'string' ? data.album.slice(0, 500) : '' } as unknown as AudioPlayback);
    res.writeHead(200).end('{"saved":true}');
  } catch { res.writeHead(400).end('{}'); }
  return true;
}
