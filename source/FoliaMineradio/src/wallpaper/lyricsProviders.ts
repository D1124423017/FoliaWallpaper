import type { SongResult } from '../types';
import { calculateMatchScoreDetails } from '../utils/lyrics/matchScore';
import { parseLyricsByFormat } from '../utils/lyrics/parserCore';
import { buildAmllApiSearchUrl, getAmllApiData, type AmllApiSearchPage, type AmllApiSongItem } from '../utils/lyrics/providers/amllApi';
import type { WallpaperLyrics, WallpaperTrack } from './types';
import { hasWallpaperVideoLabel } from './metadata';

// src/wallpaper/lyricsProviders.ts — explicit cross-source lyric matching, using public browser transports.
interface LrcItem { id: number; trackName: string; artistName: string; albumName: string; duration: number; syncedLyrics: string | null }
export function scoreWallpaperCandidate(track: WallpaperTrack, candidate: SongResult) {
  if (track.durationSec > 0 && !(candidate.durationMs > 0)) return 0;
  const details = calculateMatchScoreDetails({ title: track.title, artist: track.artist,
    durationMs: track.durationSec * 1000 }, candidate);
  // Require both name and artist; a same-title cover or mismatched known duration cannot pass.
  return details.titleMatched && details.artistMatched && details.durationMatched !== false && details.score >= 75 ? details.score : 0;
}
export async function fetchWallpaperTtml(track: WallpaperTrack, signal: AbortSignal, video = hasWallpaperVideoLabel(track.title)): Promise<WallpaperLyrics | null> {
  const page = await getAmllApiData<AmllApiSearchPage>(buildAmllApiSearchUrl({ musicName: track.title }, 20));
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const candidates = (page?.items ?? []).map(item => {
    // AMLL names are aliases; evaluate each title instead of assuming the first is the display title.
    const score = Math.max(0, ...item.musicNames.map(name => scoreWallpaperCandidate({ ...track, durationSec: 0 }, {
      id: item.id, name, artists: item.artistNames.map((name, id) => ({ id, name })),
      album: { id: 0, name: item.albumNames[0] ?? '' }, durationMs: 0,
    })));
    return { item, score };
  }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);
  for (const { item } of candidates.slice(0, 3)) {
    const full = await getAmllApiData<AmllApiSongItem>(`https://api.amll.dev/v1/lyrics/get?id=${item.id}`);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!full?.lyrics) continue;
    const lyrics = parseLyricsByFormat('ttml', full.lyrics);
    if (!lyrics?.lines.length) continue;
    const lastEnd = Math.max(...lyrics.lines.map(line => line.endTime));
    if (!video && track.durationSec > 0 && lastEnd > track.durationSec + 3) continue;
    // AMLL search has no track duration; do not claim the recording version was duration-verified.
    return { lyrics, origin: `AMLL TTML #${item.id}`, durationVerified: false, alignment: 'unverified' };
  }
  return null;
}
export async function fetchWallpaperLrc(track: WallpaperTrack, signal: AbortSignal): Promise<WallpaperLyrics | null> {
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(cancel, 6500);
  try {
    const response = await fetch(`https://lrclib.net/api/search?${params}`, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`LRCLIB HTTP ${response.status}`);
    const items = await response.json() as LrcItem[];
    const scored = items.filter(item => item.syncedLyrics).map(item => ({ item,
      score: scoreWallpaperCandidate(track, { id: item.id, name: item.trackName,
        artists: [{ id: 0, name: item.artistName }], album: { id: 0, name: item.albumName }, durationMs: item.duration * 1000 }),
    })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    for (const { item } of scored) {
      const lyrics = parseLyricsByFormat('lrc', item.syncedLyrics!);
      if (lyrics?.lines.length) return { lyrics, origin: `LRCLIB #${item.id}`, durationVerified: track.durationSec > 0 };
    }
    return null;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
