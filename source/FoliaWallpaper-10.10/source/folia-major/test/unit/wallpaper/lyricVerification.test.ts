import { describe, expect, it, vi } from 'vitest';
import { resolveFoliaWallpaperLyrics } from '../../../dev/wallpaper/lyrics/resolve';

// test/unit/wallpaper/lyricVerification.test.ts — matching live-video duration alone must not authorize album-recording timing.
vi.mock('../../../src/utils/lyrics/autoMatchBestLyric', () => ({ autoMatchBestLyric: vi.fn(async (title: string) => {
  if (!['Performance test', 'Recording test'].includes(title)) return null;
  return { source: 'netease', id: title, song: { id: title, name: title, artists: [{ id: 1, name: 'Artist' }],
    album: { id: 1, name: 'Album' }, durationMs: 200_000 },
    lyrics: { isWordByWord: false, lines: [{ fullText: 'original test text', words: [], startTime: 10, endTime: 15 }] } };
}) }));
vi.mock('../../../dev/wallpaper/lyrics/transport', () => ({ lyricRequestContext: { run: (_signal: AbortSignal, task: () => unknown) => task() }, nativeLyricTransport: {} }));
vi.mock('../../../dev/wallpaper/audio/runtime', () => ({ rememberAudioCandidate: vi.fn() }));
vi.mock('../../../dev/wallpaper/lyrics/videoCandidate', () => ({ resolveVideoLyrics: vi.fn(async () => null) }));
describe('Recording timing verification', () => {
  it('keeps a performance upload as a readable candidate despite an identical catalog duration', async () => {
    const result = await resolveFoliaWallpaperLyrics({ title: '純享：Artist《Performance test》節目資訊 | Channel',
      artist: 'Channel', album: '', durationSec: 200 }, new AbortController().signal);
    expect(result?.lyrics.lines).toHaveLength(1);
    expect(result?.alignment).toBe('unverified'); expect(result?.durationVerified).toBe(false);
  });
  it('continues to use a matched catalog recording directly', async () => {
    const result = await resolveFoliaWallpaperLyrics({ title: 'Recording test', artist: 'Artist', album: '', durationSec: 200 }, new AbortController().signal);
    expect(result?.alignment).toBe('recording'); expect(result?.durationVerified).toBe(true);
  });
});
