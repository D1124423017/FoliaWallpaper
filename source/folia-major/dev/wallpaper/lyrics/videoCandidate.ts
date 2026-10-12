import { autoMatchBestLyric } from '../../../src/utils/lyrics/autoMatchBestLyric';
import { calculateMatchScoreDetails, normalizeLyricMatchText } from '../../../src/utils/lyrics/matchScore';
import { createProviderSongMetadata } from '../../../src/utils/songMetadata';
import { hasWallpaperVideoLabel } from '../../../src/wallpaper/metadata';
import { scoreWallpaperCandidate } from '../../../src/wallpaper/lyricsProviders';
import { getOnlineMusicProvider } from './providerRegistry';
import { lyricRequestContext, nativeLyricTransport } from './transport';
import type { SongResult } from '../../../src/types';
import type { WallpaperLyrics, WallpaperTrack } from '../../../src/wallpaper/types';

// dev/wallpaper/lyrics/videoCandidate.ts — bounded video-padding fallback for the standalone cross-provider host.
export function selectVideoCandidate(track: WallpaperTrack, songs: SongResult[]): SongResult | null {
  const mainArtist = normalizeLyricMatchText(track.artist.split(/[,&、\/]/u)[0] ?? '');
  if (!mainArtist || track.durationSec < 120) return null;
  const candidates = songs.map(song => {
    const metadata = createProviderSongMetadata(song);
    const durationSec = metadata.durationMs / 1000;
    const padding = track.durationSec - durationSec;
    const details = calculateMatchScoreDetails({ title: track.title, artist: track.artist, durationMs: 0 }, song);
    const sameMainArtist = normalizeLyricMatchText(metadata.artists[0]?.name ?? '') === mainArtist;
    const exactTitle = normalizeLyricMatchText(song.name) === normalizeLyricMatchText(track.title);
    return { song, padding, score: details.score, acceptable: sameMainArtist && exactTitle
      && details.artistSimilarity >= 0.65 && details.score >= 80
      && padding > 3 && padding <= 20 && padding <= durationSec * 0.1 };
  }).filter(candidate => candidate.acceptable).sort((a, b) => b.score - a.score || a.padding - b.padding);
  return candidates[0]?.song ?? null;
}

// A video's duration can contain intro/outro footage; retain the original matcher at the catalog recording's time.
export async function resolveVideoLyrics(track: WallpaperTrack, lookups: WallpaperTrack[], signal: AbortSignal): Promise<WallpaperLyrics | null> {
  if (!hasWallpaperVideoLabel(track.title) || track.durationSec < 120) return null;
  return lyricRequestContext.run(signal, async () => {
    const provider = getOnlineMusicProvider('netease');
    for (const lookup of lookups.slice(0, 2)) {
      signal.throwIfAborted();
      const page = await provider!.search.searchSongs(lookup.title, 10, 0);
      const song = selectVideoCandidate(lookup, page.items);
      if (!song) continue;
      const processed = await provider!.lyrics.getLyrics(song);
      signal.throwIfAborted();
      if (!processed.lyrics?.lines.length || processed.isPureMusic) continue;
      const durationMs = createProviderSongMetadata(song).durationMs;
      const match = await autoMatchBestLyric(lookup.title, lookup.artist, durationMs, {
        qqTransport: nativeLyricTransport,
        providerCandidate: { providerId: 'netease', song, lyricsResult: processed },
      });
      signal.throwIfAborted();
      if (match && 'lyrics' in match && scoreWallpaperCandidate({ ...lookup, durationSec: durationMs / 1000 }, match.song) > 0) {
        return { lyrics: match.lyrics, origin: `Folia ${match.source} #${match.id}`, durationVerified: false, alignment: 'unverified' };
      }
    }
    return null;
  });
}
