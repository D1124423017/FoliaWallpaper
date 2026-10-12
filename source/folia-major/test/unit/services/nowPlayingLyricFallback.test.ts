import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NowPlayingTrackSnapshot } from '@/types';

// test/unit/services/nowPlayingLyricFallback.test.ts

const { matcher } = vi.hoisted(() => ({ matcher: vi.fn() }));
vi.mock('@/utils/lyrics/autoMatchBestLyric', () => ({ autoMatchBestLyric: matcher }));
vi.mock('@/services/onlineMusic/songMetadata', () => ({ getSongCoverUrl: () => 'https://cover.test/cover.jpg' }));
const track: NowPlayingTrackSnapshot = { id: null, title: 'Test song', artist: 'Test artist', album: '', durationMs: 200000, coverUrl: null };
const lyrics = { lines: [{ fullText: 'Example', startTime: 1, endTime: 2, words: [] }], isWordByWord: false };

describe('Now Playing lyric fallback', () => {
    beforeEach(() => { vi.resetModules(); matcher.mockReset(); });

    it('deduplicates overlapping metadata requests and keeps the matched lyrics and cover', async () => {
        matcher.mockResolvedValue({ lyrics, song: { id: 1 }, source: 'qq' });
        const { findNowPlayingFallbackLyrics } = await import('@/services/nowPlayingLyricFallback');
        const [first, second] = await Promise.all([findNowPlayingFallbackLyrics(track), findNowPlayingFallbackLyrics(track)]);
        expect(matcher).toHaveBeenCalledTimes(1);
        expect(matcher).toHaveBeenCalledWith('Test song', 'Test artist', 200000, { album: undefined });
        expect(first).toEqual({ lyrics, coverUrl: 'https://cover.test/cover.jpg' });
        expect(second).toBe(first);
    });

    it('does not search browser videos without an artist', async () => {
        const { findNowPlayingFallbackLyrics } = await import('@/services/nowPlayingLyricFallback');
        expect(await findNowPlayingFallbackLyrics({ ...track, artist: '' })).toBeNull();
        expect(matcher).not.toHaveBeenCalled();
    });

    it('does not display an instrumental or an empty lyric result', async () => {
        const { findNowPlayingFallbackLyrics } = await import('@/services/nowPlayingLyricFallback');
        matcher.mockResolvedValueOnce({ isPureMusic: true }).mockResolvedValueOnce({ lyrics: { lines: [] }, song: {} });
        expect(await findNowPlayingFallbackLyrics(track)).toBeNull();
        expect(await findNowPlayingFallbackLyrics({ ...track, title: 'Other song' })).toBeNull();
    });

    it('keeps playback usable when the lyrics network request fails', async () => {
        matcher.mockRejectedValue(new Error('Network unavailable'));
        const { findNowPlayingFallbackLyrics } = await import('@/services/nowPlayingLyricFallback');
        expect(await findNowPlayingFallbackLyrics(track)).toBeNull();
    });
});
