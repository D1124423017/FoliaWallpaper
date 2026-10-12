import { fetchWallpaperLrc, fetchWallpaperTtml } from './lyricsProviders';
import { wallpaperTrackKey } from './model';
import type { WallpaperLyrics, WallpaperTrack } from './types';
import { buildWallpaperLyricLookups, hasWallpaperVideoLabel } from './metadata';
import { fetchFoliaWallpaperLyrics, FoliaLyricBridgeUnavailable } from './foliaLyricsClient';

// src/wallpaper/lyricResolver.ts — bounded per-song cache, word timing first and line timing fallback.
const cache = new Map<string, { value: WallpaperLyrics | null; expires: number }>();
function remember(key: string, value: WallpaperLyrics | null) {
  cache.set(key, { value, expires: Date.now() + (value ? 3600_000 : 30_000) });
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return value;
}
export async function resolveWallpaperLyrics(track: WallpaperTrack, signal: AbortSignal): Promise<WallpaperLyrics | null> {
  const lookups = buildWallpaperLyricLookups(track);
  if (!lookups.length) return null;
  const key = wallpaperTrackKey(track), cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  let value: WallpaperLyrics | null = null;
  let bridgeOffline = false;
  try { value = await fetchFoliaWallpaperLyrics(track, signal); }
  catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof FoliaLyricBridgeUnavailable) bridgeOffline = true;
    else throw error;
  }
  if (value) return remember(key, value);
  let failures = 0;
  const ttml = (lookup: WallpaperTrack, job: AbortSignal) => fetchWallpaperTtml(lookup, job, hasWallpaperVideoLabel(track.title));
  for (const provider of [ttml, fetchWallpaperLrc]) {
    const results = await Promise.allSettled(lookups.map(lookup => provider(lookup, signal)));
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (results.every(result => result.status === 'rejected')) failures++;
    value = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])[0] ?? null;
    if (value) break;
  }
  if (failures === 2 && !value) throw new Error('Lyric services unavailable');
  if (bridgeOffline && !value) throw new FoliaLyricBridgeUnavailable('Start the background lyric service');
  return remember(key, value);
}
