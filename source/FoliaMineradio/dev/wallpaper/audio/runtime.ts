import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { matchHeardLyrics, extendLyricTimeMap, mergeHeardWindows, type AudioMatchDiagnostic, type HeardWord, type LyricTimeSegment } from '../../../src/wallpaper/audioAlignment';
import { wallpaperTrackKey } from '../../../src/wallpaper/model';
import type { WallpaperLyrics, WallpaperTrack } from '../../../src/wallpaper/types';
import { AlignmentCache } from './alignmentCache';
import { GeminiAlignment } from './geminiAlignment';

// dev/wallpaper/audio/runtime.ts — one isolated local model worker; raw recognized text is never logged or persisted.
export interface AudioPlayback extends WallpaperTrack { positionSec: number; playbackRate: number; playing: boolean; at: number }
export interface AudioAlignmentState { key: string; origin: string; status: string; revision: number; timelineMap: LyricTimeSegment[]; inferenceSec?: number; matchedWords?: number; method?: 'local' | 'gemini' }
const candidates = new Map<string, WallpaperLyrics>();
const alignments = new Map<string, AudioAlignmentState>();
let worker: ChildProcessWithoutNullStreams | null = null, status = 'disabled', playback: AudioPlayback | null = null;
let generation = 0, revision = 0;
let audioRuntime: string | undefined, lastActiveAt = 0, nextLaunchAt = 0;
let modelDevice = 'not-loaded';
let alignmentCache: AlignmentCache | undefined;
let gemini: GeminiAlignment | undefined;
const analysis = { heardWindows: 0, captureWindows: 0, silentWindows: 0, lastHeardAt: 0, lastWordCount: 0, lastMatchStatus: 'waiting', inferenceSec: 0,
  language: '', segments: 0, rejectedSegments: 0, deviceErrors: 0, method: 'local' };
const heardHistory = new Map<string, { key: string; generation: number; words: HeardWord[] }>();
let matchedOutput = { key: '', device: '', at: 0 };
let matchDiagnostic: AudioMatchDiagnostic = {};
export function audioRuntimeStatus() {
  return { enabled: Boolean(audioRuntime), status, device: modelDevice, gemini: gemini?.status() ?? { enabled: false, status: 'disabled' },
    analysis: { ...analysis, generation, match: matchDiagnostic, lastHeardAgeMs: analysis.lastHeardAt ? Date.now() - analysis.lastHeardAt : null },
    currentTrack: playback ? { title: playback.title, artist: playback.artist, playing: playback.playing, positionSec: playback.positionSec,
      ageMs: Date.now() - playback.at, candidate: candidates.has(wallpaperTrackKey(playback)) } : null };
}
export function rememberAudioCandidate(track: WallpaperTrack, result: WallpaperLyrics | null) {
  if (result) {
    const key = wallpaperTrackKey(track);
    candidates.set(key, result);
    const cached = alignmentCache?.get(key, result);
    if (cached && !alignments.has(key)) { alignments.set(key, cached); revision = Math.max(revision, cached.revision); }
  }
  if (candidates.size > 32) { const oldest = candidates.keys().next().value!; candidates.delete(oldest); alignments.delete(oldest); }
}
export function readAudioAlignment(key: string): AudioAlignmentState {
  const candidate = candidates.get(key);
  return alignments.get(key) ?? { key, origin: candidate?.origin ?? '', status: gemini?.status().status === 'requesting' ? 'gemini-requesting'
    : candidate?.alignment === 'unverified' && status === 'ready' ? 'listening' : status, revision, timelineMap: [] };
}
function sendContext() {
  if (!playback) return;
  const key = wallpaperTrackKey(playback);
  gemini?.update(key, generation, playback.playing && candidates.get(key)?.alignment === 'unverified', alignments.has(key));
  if (!worker?.stdin.writable) return;
  const message = { type: 'context', ...playback, key, generation, active: playback.playing && candidates.get(key)?.alignment === 'unverified',
    gemini: gemini?.canCapture() ?? false,
    outputDevice: matchedOutput.key === key && Date.now() - matchedOutput.at < 30_000 ? matchedOutput.device : '' };
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
  if (data.type === 'clip') { void gemini?.accept(data); return; }
  if (data.type === 'status' && typeof data.status === 'string') { status = data.status; if (typeof data.device === 'string') modelDevice = data.device; return; }
  if (data.type === 'capture') { if (data.deviceError === true) analysis.deviceErrors++; else analysis.captureWindows++;
    if (data.silent === true) analysis.silentWindows++; return; }
  if (data.type === 'heard') {
    analysis.method = data.method === 'gemini' ? 'gemini' : 'local';
    analysis.heardWindows++; analysis.lastHeardAt = Date.now();
    analysis.lastWordCount = Array.isArray(data.words) ? Math.min(240, data.words.length) : 0;
    analysis.inferenceSec = typeof data.inferenceSec === 'number' && Number.isFinite(data.inferenceSec) ? data.inferenceSec : 0;
    analysis.language = typeof data.language === 'string' && /^[a-z]{2,3}$/.test(data.language) ? data.language : '';
    analysis.segments = Number.isInteger(data.segments) ? Math.min(100, Math.max(0, data.segments as number)) : 0;
    analysis.rejectedSegments = Number.isInteger(data.rejectedSegments) ? Math.min(100, Math.max(0, data.rejectedSegments as number)) : 0;
    analysis.lastMatchStatus = data.generation !== generation ? 'generation-changed' : !playback?.playing ? 'not-playing'
      : Date.now() - playback.at > 4000 ? 'stale-playback' : data.key !== wallpaperTrackKey(playback) ? 'track-changed'
      : !candidates.has(String(data.key)) ? 'no-candidate' : 'checking';
  }
  if (data.type !== 'heard' || data.generation !== generation || typeof data.key !== 'string' || !Array.isArray(data.words)
    || !playback || !playback.playing || Date.now() - playback.at > 4000 || data.key !== wallpaperTrackKey(playback)) return;
  const candidate = candidates.get(data.key);
  if (!candidate) return;
  const heard = data.words.filter((word): word is HeardWord => word && typeof word.text === 'string' && word.text.length <= 100
    && typeof word.timeSec === 'number' && Number.isFinite(word.timeSec) && typeof word.probability === 'number').slice(0, 240);
  const previous = alignments.get(data.key), map = previous?.origin === candidate.origin ? previous.timelineMap : [];
  const prior = [...map].reverse().find(segment => segment.sourceStartSec + segment.offsetSec <= playback!.positionSec)?.offsetSec;
  const output = typeof data.outputDevice === 'string' && data.outputDevice.length <= 300 ? data.outputDevice : 'default';
  const historyKey = `${data.method === 'gemini' ? 'gemini' : 'local'}:${output}`;
  const history = heardHistory.get(historyKey);
  const oldWords = history?.key === data.key && history.generation === generation ? history.words : [];
  const combined = mergeHeardWindows(oldWords, heard);
  heardHistory.set(historyKey, { key: data.key, generation, words: combined });
  if (heardHistory.size > 8) heardHistory.delete(heardHistory.keys().next().value!);
  matchDiagnostic = {};
  const match = matchHeardLyrics(candidate.lyrics, combined, prior, matchDiagnostic);
  if (!match) { analysis.lastMatchStatus = 'no-confident-match'; return; }
  if (Math.abs(match.offsetSec) > playback.durationSec || match.sourceStartSec + match.offsetSec > playback.durationSec) { analysis.lastMatchStatus = 'outside-timeline'; return; }
  analysis.lastMatchStatus = 'aligned';
  matchedOutput = { key: data.key, device: output === 'default' ? '' : output, at: Date.now() };
  alignments.set(data.key, { key: data.key, origin: candidate.origin, status: 'aligned', revision: ++revision,
    timelineMap: extendLyricTimeMap(map, match), inferenceSec: typeof data.inferenceSec === 'number' ? data.inferenceSec : undefined, matchedWords: match.matchedWords,
    method: data.method === 'gemini' ? 'gemini' : 'local' });
  alignmentCache?.remember(alignments.get(data.key)!, candidate);
  // A local result can finish while a cloud request is in flight; cancel it immediately, before the next observation.
  gemini?.update(data.key, generation, playback.playing, true);
}
export function startAudioWorker(): () => void {
  const runtime = process.env.FOLIA_AUDIO_RUNTIME;
  if (!runtime || !fs.existsSync(path.join(runtime, 'enabled.json')) || !fs.existsSync(path.join(runtime, 'ready.json'))) return () => {};
  try { if (JSON.parse(fs.readFileSync(path.join(runtime, 'enabled.json'), 'utf8')).enabled !== true) return () => {}; }
  catch { return () => {}; }
  const python = path.join(runtime, '.venv/Scripts/python.exe'), script = path.join(runtime, 'worker.py');
  if (!fs.existsSync(python) || !fs.existsSync(script)) { status = 'unavailable'; return () => {}; }
  audioRuntime = runtime; status = 'idle';
  alignmentCache = new AlignmentCache(runtime);
  gemini = new GeminiAlignment(runtime, receive);
  const idle = setInterval(() => {
    if (worker?.stdin.writable && Date.now() - lastActiveAt > 90_000) worker.stdin.end(`${JSON.stringify({ type: 'stop' })}\n`);
  }, 10_000);
  idle.unref();
  return () => { clearInterval(idle); gemini?.stop(); audioRuntime = undefined; worker?.stdin.end(`${JSON.stringify({ type: 'stop' })}\n`); };
}
function launchWorker(runtime: string) {
  const python = path.join(runtime, '.venv/Scripts/python.exe'), script = path.join(runtime, 'worker.py');
  nextLaunchAt = Date.now() + 30_000;
  status = 'loading';
  worker = spawn(python, ['-X', 'utf8', '-u', script, runtime], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
  let pending = '';
  worker.stdout.setEncoding('utf8');
  worker.stdout.on('data', (chunk: string) => {
    pending += chunk;
    if (pending.length > 1_048_576) { pending = ''; return; }
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
