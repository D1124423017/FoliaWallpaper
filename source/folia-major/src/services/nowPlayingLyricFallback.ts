import type { LyricData, NowPlayingTrackSnapshot } from '../types';
import { autoMatchBestLyric } from '../utils/lyrics/autoMatchBestLyric';
import { hasRenderableLyrics } from '../utils/lyrics/validity';
import { getSongCoverUrl } from './onlineMusic/songMetadata';

// src/services/nowPlayingLyricFallback.ts
// Browser SMTC supplies metadata and a clock; reuse Folia's cross-provider lyric matcher when the bridge supplies no lyrics.

type MatchedLyrics = { lyrics: LyricData; coverUrl: string | null };
const matches = new Map<string, { expiresAt: number; promise: Promise<MatchedLyrics | null> }>();

export async function findNowPlayingFallbackLyrics(track: NowPlayingTrackSnapshot): Promise<MatchedLyrics | null> {
    if (!track.title.trim() || !track.artist.trim()) return null;
    const key = JSON.stringify([track.title, track.artist, track.album, track.durationMs]);
    const cached = matches.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const entry = {
        expiresAt: Date.now() + 300_000,
        promise: Promise.resolve<MatchedLyrics | null>(null),
    };
    entry.promise = autoMatchBestLyric(track.title, track.artist, track.durationMs || 0, { album: track.album || undefined })
        .then(match => {
            if (!match || !('lyrics' in match) || !hasRenderableLyrics(match.lyrics)) return null;
            return { lyrics: match.lyrics, coverUrl: getSongCoverUrl(match.song) || null };
        })
        .catch(error => {
            console.warn('[NowPlaying] Metadata lyric matching failed', error);
            return null;
        })
        .then(result => {
            if (!result) entry.expiresAt = Date.now() + 30_000;
            return result;
        });
    matches.set(key, entry);
    if (matches.size > 24) matches.delete(matches.keys().next().value!);
    return entry.promise;
}
