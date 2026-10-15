import { autoMatchBestLyric } from '../../../src/utils/lyrics/autoMatchBestLyric';
import { buildWallpaperLyricLookups, hasWallpaperPerformanceLabel } from '../../../src/wallpaper/metadata';
import { scoreWallpaperCandidate } from '../../../src/wallpaper/lyricsProviders';
import { lyricRequestContext, nativeLyricTransport } from './transport';
import { resolveVideoLyrics } from './videoCandidate';
import { rememberAudioCandidate } from '../audio/runtime';
import type { WallpaperLyrics, WallpaperTrack } from '../../../src/wallpaper/types';
import { wallpaperTrackKey } from '../../../src/wallpaper/model';

// dev/wallpaper/lyrics/resolve.ts — reuse Folia's full matching/source priority, with bounded metadata alternatives.
const cache = new Map<string, { value: WallpaperLyrics | null; until: number }>();
export async function resolveFoliaWallpaperLyrics(track: WallpaperTrack, signal: AbortSignal): Promise<WallpaperLyrics | null> {
  const key = wallpaperTrackKey(track), cached = cache.get(key);
  if (cached && cached.until > Date.now()) { rememberAudioCandidate(track, cached.value); return cached.value; }
  const lookups = buildWallpaperLyricLookups(track).slice(0, 3);
  const run = (lookup: WallpaperTrack, identityOnly = false) => lyricRequestContext.run(signal, async () => {
    signal.throwIfAborted();
    const matching = identityOnly ? { ...lookup, durationSec: 0 } : lookup;
    const match = await autoMatchBestLyric(lookup.title, lookup.artist, matching.durationSec * 1000,
      { qqTransport: nativeLyricTransport });
    signal.throwIfAborted();
    if (!match || !('lyrics' in match) || scoreWallpaperCandidate(matching, match.song) === 0) return null;
    const verified = !identityOnly && lookup.durationSec > 0 && !hasWallpaperPerformanceLabel(track.title);
    return { lyrics: match.lyrics, origin: `Folia ${match.source} #${match.id}`,
      durationVerified: verified,
      alignment: verified ? 'recording' : 'unverified' } satisfies WallpaperLyrics;
  });
  // At most two simultaneous lookup variants; preserve source identity and prefer genuine word timing.
  const results = await Promise.allSettled(lookups.slice(0, 2).map(lookup => run(lookup)));
  signal.throwIfAborted();
  const matches = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
  let value: WallpaperLyrics | null = matches.find(match => match.lyrics.isWordByWord) ?? matches[0] ?? null;
  if (!value && lookups[2]) value = await run(lookups[2]);
  if (!value && track.durationSec >= 30 && track.durationSec <= 1800) {
    // The candidate supplies text and original word timing; only heard audio can authorize its different video clock.
    const alternatives = await Promise.allSettled(lookups.slice(0, 2).map(lookup => run(lookup, true)));
    value = alternatives.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])[0] ?? null;
  }
  if (!value) value = await resolveVideoLyrics(track, lookups, signal);
  signal.throwIfAborted();
  rememberAudioCandidate(track, value);
  cache.set(key, { value, until: Date.now() + (value ? 3600_000 : 30_000) });
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return value;
}
