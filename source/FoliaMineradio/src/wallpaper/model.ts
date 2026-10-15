import { initialWebLyricSourceState } from '../types/webLyricSource';
import { currentWebLyricTimeSec } from '../utils/webLyricSource';
import type { HostEvent, WallpaperSnapshot, WallpaperTrack } from './types';
import { applySystemMediaEvent } from './systemMedia';

// src/wallpaper/model.ts — discrete media state and anchored timeline, independent of React.
export const initialWallpaperSnapshot = (): WallpaperSnapshot => ({
  source: initialWebLyricSourceState(), album: '', timelineSeen: false, timelineSource: 'none', browserUpdatedAtMs: 0, playbackRate: 1, suspended: false,
  lyricStatus: 'idle', lyricOrigin: '', lyricOffsetSec: 0, audioAlignmentStatus: 'off',
  mediaSource: 'none', companionUpdatedAtMs: 0, audioActive: false, manualSource: false,
});
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
export function wallpaperCurrentTimeSec(snapshot: WallpaperSnapshot, nowMs: number): number {
  const clock = snapshot.source.clock;
  return snapshot.timelineSeen ? currentWebLyricTimeSec(clock, clock.anchoredAtMs + Math.max(0, nowMs - clock.anchoredAtMs) * snapshot.playbackRate) : 0;
}
export function wallpaperTrack(snapshot: WallpaperSnapshot): WallpaperTrack | null {
  const track = snapshot.source.track;
  return track ? { title: track.name, artist: track.artist, album: snapshot.album, durationSec: snapshot.source.clock.durationSec } : null;
}
export function wallpaperTrackKey(track: WallpaperTrack): string {
  return JSON.stringify([track.title, track.artist, track.album, Math.round(track.durationSec)]);
}
// Both constant layouts appear in official docs; never guess numeric enum values.
export function playbackState(value: unknown, constants: Window['wallpaperMediaIntegration']) {
  const nested = constants?.playback;
  if (value === 'playing' || (value !== undefined && value === (constants?.PLAYBACK_PLAYING ?? nested?.PLAYING))) return 'playing';
  if (value === 'paused' || (value !== undefined && value === (constants?.PLAYBACK_PAUSED ?? nested?.PAUSED))) return 'paused';
  return 'idle';
}
export function applyWallpaperEvent(previous: WallpaperSnapshot, event: HostEvent,
  constants?: Window['wallpaperMediaIntegration']): WallpaperSnapshot {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const source = previous.source;
  if (event.type === 'source-selection') return previous.manualSource === (event.data === true) ? previous : { ...previous, manualSource: event.data === true };
  if (previous.manualSource && ['metadata', 'thumbnail', 'playback', 'timeline', 'browser-timeline', 'browser-expired'].includes(event.type)) return previous;
  const system = applySystemMediaEvent(previous, event);
  if (system) return system;
  if (['metadata', 'thumbnail', 'playback', 'timeline'].includes(event.type)
    && ['system', 'browser'].includes(previous.mediaSource) && event.at - previous.companionUpdatedAtMs < 4000) return previous;
  if (event.type === 'metadata') {
    const name = text(data.title), artist = text(data.artist), album = text(data.albumTitle);
    if (source.track?.name === name && source.track.artist === artist && previous.album === album) return previous;
    const next = initialWebLyricSourceState();
    next.connectionStatus = 'connected';
    next.playerState = source.playerState;
    next.track = name ? { name, artist, coverUrl: null, seed: JSON.stringify([name, artist, album]) } : null;
    return { ...previous, source: next, album, mediaSource: name ? 'native' : 'none', timelineSeen: false, timelineSource: 'none', browserUpdatedAtMs: 0, playbackRate: 1, lyricStatus: 'idle', lyricOrigin: '', lyricOffsetSec: 0, audioAlignmentStatus: 'off', audioAlignmentMethod: undefined };
  }
  if (event.type === 'thumbnail') {
    if (!source.track) return previous;
    const raw = text(data.thumbnail);
    // Accept inline covers only; media thumbnails never need arbitrary URL requests.
    const coverUrl = raw.startsWith('data:image/') ? raw : raw && /^[A-Za-z0-9+/=\r\n]+$/.test(raw) ? `data:image/png;base64,${raw}` : null;
    return { ...previous, source: { ...source, track: { ...source.track, coverUrl } } };
  }
  if (event.type === 'suspend') return { ...previous, suspended: Boolean(event.data) };
  if (event.type === 'browser-expired' && previous.timelineSource === 'browser' && event.at - previous.browserUpdatedAtMs > 4000) {
    return { ...previous, timelineSeen: false, timelineSource: 'none', playbackRate: 1, source: { ...source, clock: { ...source.clock,
      positionSec: wallpaperCurrentTimeSec(previous, previous.browserUpdatedAtMs + 4000), anchoredAtMs: event.at, playing: false } } };
  }
  // A browser packet must belong to the displayed song and be fresh. Never borrow another tab's clock.
  if (event.type === 'browser-timeline' && source.track) {
    if (text(data.title) !== source.track.name || typeof data.at !== 'number' || event.at - data.at > 4000 || data.at > event.at + 1000 || data.at < previous.browserUpdatedAtMs
      || typeof data.position !== 'number' || !Number.isFinite(data.position) || data.position < 0
      || typeof data.duration !== 'number' || !Number.isFinite(data.duration) || data.duration <= 0 || data.duration > 86400
      || typeof data.playing !== 'boolean'
      || (data.playbackRate !== undefined && (typeof data.playbackRate !== 'number' || !Number.isFinite(data.playbackRate) || data.playbackRate < .0625 || data.playbackRate > 16))) return previous;
    const playing = data.playing;
    const playbackRate = typeof data.playbackRate === 'number' ? data.playbackRate : 1;
    if (previous.timelineSource === 'browser' && data.at === previous.browserUpdatedAtMs && data.position === source.clock.positionSec
      && data.duration === source.clock.durationSec && playing === source.clock.playing && playbackRate === previous.playbackRate) return previous;
    return { ...previous, timelineSeen: true, timelineSource: 'browser', browserUpdatedAtMs: data.at, playbackRate, source: { ...source,
      playerState: playing ? 'playing' : 'paused', clock: { positionSec: Math.min(data.position, data.duration), durationSec: data.duration, anchoredAtMs: data.at, playing } } };
  }
  if ((event.type === 'playback' || event.type === 'timeline') && previous.timelineSource === 'browser' && event.at - previous.browserUpdatedAtMs < 4000) return previous;
  if (event.type === 'playback') {
    const playerState = playbackState(data.state, constants);
    const positionSec = wallpaperCurrentTimeSec(previous, event.at);
    return { ...previous, playbackRate: 1, source: { ...source, playerState, clock: { ...source.clock,
      positionSec, anchoredAtMs: event.at, playing: playerState === 'playing' && previous.timelineSeen } } };
  }
  if (event.type === 'timeline' && source.track) {
    if (typeof data.position !== 'number' || !Number.isFinite(data.position)) return previous;
    const durationSec = nonnegative(data.duration) || source.clock.durationSec;
    const positionSec = durationSec ? Math.min(durationSec, nonnegative(data.position)) : nonnegative(data.position);
    return { ...previous, timelineSeen: true, timelineSource: 'native', playbackRate: 1, source: { ...source, clock: {
      positionSec, durationSec, anchoredAtMs: event.at, playing: source.playerState === 'playing',
    } } };
  }
  return previous;
}
