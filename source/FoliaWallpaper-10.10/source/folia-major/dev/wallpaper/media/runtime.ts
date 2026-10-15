import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshBrowserSources, browserSourceOptions } from '../browserMedia';
import { readSystemMedia, type SystemMedia } from './select';
import { updateAudioPlayback, type AudioPlayback } from '../audio/runtime';
import { selectConfiguredMedia } from './sourceSelection';
import { mediaSelectionStore as selectionStore } from './preference';
import type { MediaSourcesSnapshot } from '../../../src/wallpaper/mediaSources';
import { playerFeedSnapshot, startPlayerFeed } from './playerFeed';
import { FOLIA_PLAYER_SOURCE_ID } from '../../../src/integration/wallpaperContracts';

// dev/wallpaper/media/runtime.ts — one read-only Windows observer; metadata and peak values stay on loopback.
let sessions: SystemMedia[] = [], at = 0, lastSoundAt = 0, peak = 0, audioAvailable = false;
let state = process.platform === 'win32' ? 'starting' : 'unsupported';
export const setMediaSelection = selectionStore.set;
export function mediaSourcesSnapshot(now = Date.now()): MediaSourcesSnapshot {
  const live = now - at < 4000 ? sessions : [];
  const apps = [...new Set(live.map(value => value.app))].map(id => {
    const media = live.filter(value => value.app === id).sort((a, b) => Number(b.playing) - Number(a.playing) || Number(b.current) - Number(a.current))[0];
    const known = /chrome/i.test(id) ? 'Chrome' : /spotify/i.test(id) ? 'Spotify' : /msedge|edge/i.test(id) ? 'Edge'
      : /vlc/i.test(id) ? 'VLC' : /applemusic/i.test(id) ? 'Apple Music' : id;
    return { kind: 'application' as const, id, label: known, title: media.title, artist: media.artist, playing: media.playing, connected: true };
  });
  const tabs = browserSourceOptions(now);
  const player = playerFeedSnapshot(now);
  const playerOptions = [{ kind: 'application' as const, id: FOLIA_PLAYER_SOURCE_ID,
    label: 'Folia Mineradio（共用歌詞／時間軸）', title: player?.song?.title || (player ? '等待歌曲' : '播放器未啟動'), artist: player?.song?.artist || '',
    playing: !!player?.clock.playing, connected: !!player }];
  const selection = selectionStore.get(), options = [...playerOptions, ...tabs, ...apps];
  const selected = selection.kind === 'auto' ? null : options.find(option => option.kind === selection.kind && option.id === selection.id);
  return { app: 'FoliaWallpaperSources', schema: 1, selection,
    sources: (selected ? [selected, ...options.filter(option => option !== selected)] : options).slice(0, 24) };
}
export function systemMediaSnapshot(now = Date.now()) {
  const fresh = now - at < 4000;
  const selection = selectionStore.get();
  const livePlayer = playerFeedSnapshot(now);
  const usesPlayer = selection.kind === 'application' && selection.id === FOLIA_PLAYER_SOURCE_ID
    || selection.kind === 'auto' && livePlayer?.playbackSource === 'direct' && !!livePlayer.song;
  if (usesPlayer) return { app: 'FoliaWallpaperMedia', schema: 1, state: livePlayer ? 'ready' : 'stale', selection,
    player: livePlayer, media: null, audio: { available: !!livePlayer, active: !!livePlayer?.clock.playing,
      peak: livePlayer?.clock.playing ? livePlayer.audio.power : 0, at: livePlayer?.capturedAt || now } };
  const media = selectConfiguredMedia(fresh ? sessions : [], freshBrowserSources(now), selection, now);
  const selectedPlaying = selection.kind === 'auto' || media?.playing === true;
  return { app: 'FoliaWallpaperMedia', schema: 1, state: fresh ? 'ready' : state === 'ready' ? 'stale' : state,
    selection, media, player: null,
    audio: { available: fresh && audioAvailable, active: selectedPlaying && fresh && now - lastSoundAt < 2500, peak: selectedPlaying && fresh ? peak : 0, at: fresh ? at : now } };
}
export function systemMediaStatus() {
  const snapshot = systemMediaSnapshot();
  return { state: snapshot.state, sessions: sessions.length, audioAvailable: snapshot.audio.available, audioActive: snapshot.audio.active };
}
export function systemAudioPlayback(now = Date.now()): AudioPlayback | null {
  const media = systemMediaSnapshot(now).media;
  return media?.timelineAvailable ? { title: media.title, artist: media.artist, album: media.album, durationSec: media.duration,
    positionSec: Math.min(media.duration, media.position + (media.playing ? Math.max(0, now - media.at) / 1000 * media.playbackRate : 0)),
    playbackRate: media.playbackRate, playing: media.playing, at: now } : null;
}
export function startSystemMedia(): () => void {
  const stopPlayerFeed = startPlayerFeed();
  if (process.platform !== 'win32') return stopPlayerFeed;
  const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'media');
  const shell = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
  let child: ChildProcessWithoutNullStreams | null = null, stopped = false, lastPacket = Date.now();
  let retry: ReturnType<typeof setTimeout> | undefined;
  const launch = () => {
    if (stopped) return;
    let script: string;
    try { script = fs.readFileSync(path.join(folder, 'read-media.ps1'), 'utf8'); }
    catch { state = 'unavailable'; return; }
    state = 'starting'; lastPacket = Date.now();
    // Run an ordinary command without changing execution policy or machine security settings.
    const worker = spawn(shell, ['-NoProfile', '-NonInteractive', '-Command', `& {\n${script}\n} -OwnerPid ${process.pid} -MeterSource ${quote(path.join(folder, 'OutputMeter.cs'))}`], { windowsHide: true, stdio: 'pipe' });
    child = worker;
    let buffer = '';
    worker.stdout.setEncoding('utf8');
    worker.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 12_000_000) { buffer = ''; worker.kill(); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const value = JSON.parse(line), now = Date.now();
          if (value.app !== 'FoliaWindowsMedia' || value.schema !== 1 || !Array.isArray(value.sessions)
            || value.sessions.length > 16 || !Number.isFinite(value.at) || Math.abs(now - value.at) > 4000) continue;
          sessions = value.sessions.map((item: unknown) => readSystemMedia(item, now)).filter((item: SystemMedia | null): item is SystemMedia => !!item);
          at = value.at; lastPacket = now; state = 'ready';
          audioAvailable = value.audio?.available === true;
          peak = audioAvailable && Number.isFinite(value.audio?.peak) ? Math.min(1, Math.max(0, value.audio.peak)) : 0;
          if (peak > .0001) lastSoundAt = now;
        } catch { /* Do not log metadata, covers or PowerShell output. */ }
      }
    });
    worker.stderr.resume();
    worker.on('error', () => { state = 'unavailable'; });
    worker.on('close', () => { if (child === worker) child = null; state = 'unavailable'; if (!stopped) retry = setTimeout(launch, 5000); });
  };
  launch();
  const playback = setInterval(() => { const media = systemAudioPlayback(); updateAudioPlayback(media ?? { title: '', artist: '', album: '', durationSec: 0, positionSec: 0, playbackRate: 1, playing: false, at: Date.now() }); }, 700);
  const watchdog = setInterval(() => { if (child && Date.now() - lastPacket > 30_000) child.kill(); }, 2000);
  return () => { stopped = true; stopPlayerFeed(); clearInterval(playback); clearInterval(watchdog); if (retry) clearTimeout(retry); child?.stdin.end(); child?.kill(); child = null; };
}
