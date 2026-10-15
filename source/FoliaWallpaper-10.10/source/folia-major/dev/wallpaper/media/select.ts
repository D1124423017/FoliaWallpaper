import type { BrowserMedia } from '../browserMedia';

// dev/wallpaper/media/select.ts — prefer an active Windows session and its exact browser clock when available.
export interface SystemMedia extends BrowserMedia {
  album: string; app: string; current: boolean; cover: string | null;
  origin: 'system' | 'browser'; timelineAvailable: boolean;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function readSystemMedia(data: unknown, now: number): SystemMedia | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 500
    || typeof value.artist !== 'string' || value.artist.length > 300 || typeof value.album !== 'string' || value.album.length > 500
    || typeof value.app !== 'string' || value.app.length > 300 || typeof value.current !== 'boolean' || typeof value.playing !== 'boolean'
    || !finite(value.duration) || value.duration < 0 || value.duration > 86400 || !finite(value.position) || value.position < 0
    || !finite(value.playbackRate) || value.playbackRate < .0625 || value.playbackRate > 16
    || !finite(value.at) || now - value.at > 4000 || value.at > now + 1000) return null;
  const cover = typeof value.cover === 'string' && value.cover.length <= 710000
    && /^data:image\/(?:png|jpeg|webp|bmp);base64,[A-Za-z0-9+/=]+$/.test(value.cover) ? value.cover : null;
  return { title: value.title.trim(), artist: value.artist.trim(), album: value.album.trim(), app: value.app,
    current: value.current, playing: value.playing, duration: value.duration, position: Math.min(value.position, value.duration || value.position),
    playbackRate: value.playbackRate, at: value.at, cover, origin: 'system', timelineAvailable: value.duration > 0 };
}
export function selectSystemMedia(sessions: SystemMedia[], browser: BrowserMedia[], now: number): SystemMedia | null {
  const windows = sessions.filter(value => now - value.at <= 4000).sort((a, b) =>
    Number(b.playing) - Number(a.playing) || Number(b.current) - Number(a.current) || b.at - a.at)[0];
  const tabs = browser.filter(value => now - value.at <= 4000);
  // Only browser-hosted Windows sessions may borrow a tab's clock; a native player with the same song is independent.
  const artistKey = (artist: string) => artist.replace(/VEVO$|\s*-\s*Topic$/iu, '').trim().toLocaleLowerCase();
  const matching = windows && /chrome|edge|firefox|youtube/i.test(windows.app)
    ? tabs.find(value => value.title === windows.title && artistKey(value.artist) === artistKey(windows.artist)) : undefined;
  if (windows && matching) return { ...windows, position: matching.position, duration: matching.duration, playing: matching.playing,
    playbackRate: matching.playbackRate, at: matching.at, origin: 'browser', timelineAvailable: true };
  const playingTab = tabs.find(value => value.playing);
  // Chrome has one Windows media slot: a generic page without an artist must not hide a named, playing YouTube song.
  const genericBrowser = windows && /chrome|edge|firefox|youtube/i.test(windows.app) && !windows.artist && playingTab?.artist;
  if (windows?.playing && !genericBrowser || windows && !playingTab) return windows;
  const tab = playingTab ?? tabs[0];
  return tab ? { ...tab, album: '', app: tab.site ?? 'YouTube', current: true, cover: null, origin: 'browser', timelineAvailable: true } : null;
}
