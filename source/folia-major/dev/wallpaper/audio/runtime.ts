import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { matchHeardLyrics, extendLyricTimeMap, type HeardWord, type LyricTimeSegment } from '../../../src/wallpaper/audioAlignment';
import { wallpaperTrackKey } from '../../../src/wallpaper/model';
import type { WallpaperLyrics, WallpaperTrack } from '../../../src/wallpaper/types';

// dev/wallpaper/audio/runtime.ts — one isolated local model worker; raw recognized text is never logged or persisted.
export interface AudioPlayback extends WallpaperTrack { positionSec: number; playbackRate: number; playing: boolean; at: number }
export interface AudioAlignmentState { key: string; origin: string; status: string; revision: number; timelineMap: LyricTimeSegment[]; inferenceSec?: number; matchedWords?: number }
const candidates = new Map<string, WallpaperLyrics>();
const alignments = new Map<string, AudioAlignmentState>();
let worker: ChildProcessWithoutNullStreams | null = null, status = 'disabled', playback: AudioPlayback | null = null;
let generation = 0, revision = 0;
let audioRuntime: string | undefined, lastActiveAt = 0, nextLaunchAt = 0;
let modelDevice = 'not-loaded';
export function audioRuntimeStatus() {
  return { enabled: Boolean(audioRuntime), status, device: modelDevice,
    currentTrack: playback ? { title: playback.title, artist: playback.artist, playing: playback.playing, positionSec: playback.positionSec,
      ageMs: Date.now() - playback.at, candidate: candidates.has(wallpaperTrackKey(playback)) } : null };
}
export function rememberAudioCandidate(track: WallpaperTrack, result: WallpaperLyrics | null) {
  if (result) candidates.set(wallpaperTrackKey(track), result);
  if (candidates.size > 32) { const oldest = candidates.keys().next().value!; candidates.delete(oldest); alignments.delete(oldest); }
}
export function readAudioAlignment(key: string): AudioAlignmentState {
  const candidate = candidates.get(key);
  return alignments.get(key) ?? { key, origin: candidate?.origin ?? '', status: candidate?.alignment === 'unverified' && status === 'ready' ? 'listening' : status, revision, timelineMap: [] };
}
function sendContext() {
  if (!worker?.stdin.writable || !playback) return;
  const key = wallpaperTrackKey(playback);
  const message = { type: 'context', ...playback, key, generation, active: playback.playing && candidates.get(key)?.alignment === 'unverified' };
  if (worker.stdin.writableLength < 16384) worker.stdin.write(`${JSON.stringify(message)}\n`);
}
export function updateAudioPlayback(next: AudioPlayback) {
  const same = playback && wallpaperTrackKey(playback) === wallpaperTrackKey(next);
  const predicted = playback ? playback.positionSec + Math.max(0, next.at - playback.at) / 1000 * (playback.playing ? playback.playbackRate : 0) : 0;
  if (!same || Math.abs(next.positionSec - predicted) > 2 || playback?.playing !== next.playing || playback?.playbackRate !== next.playbackRate) generation++;
  playback = next;
  if (next.playing && candidates.get(wallpaperTrackKey(next))?.alignment === 'unverified') {
    lastActiveAt = Date.now();
    if (!worker && audioRuntime && Date.now() >= nextLaunchAt) launchWorker(audioRuntime);
  }
  sendContext();
}
function receive(data: Record<string, unknown>) {
  if (data.type === 'status' && typeof data.status === 'string') { status = data.status; if (typeof data.device === 'string') modelDevice = data.device; return; }
  if (data.type !== 'heard' || data.generation !== generation || typeof data.key !== 'string' || !Array.isArray(data.words)
    || !playback || !playback.playing || Date.now() - playback.at > 4000 || data.key !== wallpaperTrackKey(playback)) return;
  const candidate = candidates.get(data.key);
  if (!candidate) return;
  const heard = data.words.filter((word): word is HeardWord => word && typeof word.text === 'string' && word.text.length <= 100
    && typeof word.timeSec === 'number' && Number.isFinite(word.timeSec) && typeof word.probability === 'number').slice(0, 240);
  const previous = alignments.get(data.key), map = previous?.origin === candidate.origin ? previous.timelineMap : [];
  const prior = [...map].reverse().find(segment => segment.sourceStartSec + segment.offsetSec <= playback!.positionSec)?.offsetSec;
  const match = matchHeardLyrics(candidate.lyrics, heard, prior);
  if (!match || Math.abs(match.offsetSec) > playback.durationSec || match.sourceStartSec + match.offsetSec > playback.durationSec) return;
  alignments.set(data.key, { key: data.key, origin: candidate.origin, status: 'aligned', revision: ++revision,
    timelineMap: extendLyricTimeMap(map, match), inferenceSec: typeof data.inferenceSec === 'number' ? data.inferenceSec : undefined, matchedWords: match.matchedWords });
}
export function startAudioWorker(): () => void {
  const runtime = process.env.FOLIA_AUDIO_RUNTIME;
  if (!runtime || !fs.existsSync(path.join(runtime, 'enabled.json')) || !fs.existsSync(path.join(runtime, 'ready.json'))) return () => {};
  try { if (JSON.parse(fs.readFileSync(path.join(runtime, 'enabled.json'), 'utf8')).enabled !== true) return () => {}; }
  catch { return () => {}; }
  const python = path.join(runtime, '.venv/Scripts/python.exe'), script = path.join(runtime, 'worker.py');
  if (!fs.existsSync(python) || !fs.existsSync(script)) { status = 'unavailable'; return () => {}; }
  audioRuntime = runtime; status = 'idle';
  const idle = setInterval(() => {
    if (worker?.stdin.writable && Date.now() - lastActiveAt > 90_000) worker.stdin.end(`${JSON.stringify({ type: 'stop' })}\n`);
  }, 10_000);
  idle.unref();
  return () => { clearInterval(idle); audioRuntime = undefined; worker?.stdin.end(`${JSON.stringify({ type: 'stop' })}\n`); };
}
function launchWorker(runtime: string) {
  const python = path.join(runtime, '.venv/Scripts/python.exe'), script = path.join(runtime, 'worker.py');
  nextLaunchAt = Date.now() + 30_000;
  status = 'loading';
  worker = spawn(python, ['-u', script, runtime], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let pending = '';
  worker.stdout.setEncoding('utf8');
  worker.stdout.on('data', (chunk: string) => {
    pending += chunk;
    if (pending.length > 131072) { pending = ''; return; }
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      try { receive(JSON.parse(line)); } catch { /* A malformed result cannot change the lyric clock. */ }
    }
  });
  worker.stderr.on('data', () => { /* Do not expose recognized text or audio through service logs. */ });
  worker.stdin.on('error', () => { status = 'stopped'; });
  worker.on('error', () => { status = 'unavailable'; worker = null; });
  worker.on('exit', () => { status = audioRuntime ? 'idle' : 'stopped'; modelDevice = 'not-loaded'; worker = null; });
}
