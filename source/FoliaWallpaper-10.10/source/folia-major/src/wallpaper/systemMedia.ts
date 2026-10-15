import { initialWebLyricSourceState } from '../types/webLyricSource';
import type { HostEvent, WallpaperSnapshot } from './types';

// src/wallpaper/systemMedia.ts — independent Windows source, even when WE sends no metadata.
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function applySystemMediaEvent(previous: WallpaperSnapshot, event: HostEvent): WallpaperSnapshot | undefined {
  if (event.type === 'system-expired') {
    if (!['system', 'browser'].includes(previous.mediaSource) || event.at - previous.companionUpdatedAtMs <= 4000) return previous;
    return { ...previous, source: initialWebLyricSourceState(), album: '', mediaSource: 'none', timelineSeen: false,
      timelineSource: 'none', browserUpdatedAtMs: 0, playbackRate: 1, audioActive: false };
  }
  if (event.type === 'audio-activity') {
    const active = event.data === true;
    return active === previous.audioActive ? previous : { ...previous, audioActive: active };
  }
  if (event.type !== 'system-media') return undefined;
  const data = event.data as Record<string, unknown> | null;
  if (!data) return ['system', 'browser'].includes(previous.mediaSource) || previous.manualSource && previous.source.track ? { ...previous, source: initialWebLyricSourceState(), album: '',
    mediaSource: 'none', timelineSource: 'none', timelineSeen: false, browserUpdatedAtMs: 0, playbackRate: 1 } : previous;
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500
    || typeof data.artist !== 'string' || data.artist.length > 300 || typeof data.album !== 'string' || data.album.length > 500
    || !['system', 'browser'].includes(String(data.origin)) || typeof data.timelineAvailable !== 'boolean' || typeof data.playing !== 'boolean'
    || !number(data.at) || event.at - data.at > 4000 || data.at > event.at + 1000
    || !number(data.position) || data.position < 0 || !number(data.duration) || data.duration < 0 || data.duration > 86400
    || !number(data.playbackRate) || data.playbackRate < .0625 || data.playbackRate > 16) return previous;
  const name = data.title.trim(), artist = data.artist.trim(), album = data.album.trim();
  const changed = previous.source.track?.name !== name || previous.source.track.artist !== artist || previous.album !== album;
  const source = changed ? initialWebLyricSourceState() : previous.source;
  const cover = typeof data.cover === 'string' && data.cover.length <= 710000
    && /^data:image\/(?:png|jpeg|webp|bmp);base64,[A-Za-z0-9+/=]+$/.test(data.cover) ? data.cover : null;
  const coverUrl = cover ?? (changed ? null : source.track?.coverUrl ?? null);
  const track = !changed && source.track?.coverUrl === coverUrl ? source.track : { name, artist, coverUrl, seed: JSON.stringify([name, artist, album]) };
  const timelineSeen = data.timelineAvailable && data.duration > 0;
  return { ...previous, album, mediaSource: data.origin as 'system' | 'browser', companionUpdatedAtMs: data.at,
    timelineSeen, timelineSource: timelineSeen ? data.origin as 'system' | 'browser' : 'none',
    browserUpdatedAtMs: data.origin === 'browser' ? data.at : 0, playbackRate: data.playbackRate,
    source: { ...source, track, connectionStatus: 'connected', playerState: data.playing ? 'playing' : 'paused',
      clock: { positionSec: Math.min(data.position, data.duration || data.position), durationSec: data.duration,
        anchoredAtMs: data.at, playing: data.playing && timelineSeen } } };
}
