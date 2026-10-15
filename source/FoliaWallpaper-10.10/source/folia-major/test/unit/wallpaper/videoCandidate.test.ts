import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectVideoCandidate, resolveVideoLyrics } from '../../../dev/wallpaper/lyrics/videoCandidate';
import { autoMatchBestLyric } from '../../../src/utils/lyrics/autoMatchBestLyric';
import { getOnlineMusicProvider } from '../../../dev/wallpaper/lyrics/providerRegistry';
import type { SongResult } from '../../../src/types';

// test/unit/wallpaper/videoCandidate.test.ts — allow bounded video padding without accepting clips, covers, or altered versions.
vi.mock('../../../src/utils/lyrics/autoMatchBestLyric', () => ({ autoMatchBestLyric: vi.fn() }));
vi.mock('../../../dev/wallpaper/lyrics/providerRegistry', () => ({ getOnlineMusicProvider: vi.fn() }));
const target = { title: '苦茶子', artist: 'Starling8 / MoreLearn 27 / FIVESTAR', album: '', durationSec: 186 };
const song: SongResult = { id: 1922888354, name: '苦茶子', artists: [
  { id: 1, name: 'Starling8' }, { id: 2, name: 'DRODUMANA' }, { id: 3, name: 'FIVESTAR' },
], album: { id: 1, name: '苦茶子' }, durationMs: 170796 };
const video = { ...target, title: '苦茶子 - Starling8 / MoreLearn 27 / FIVESTAR【動態歌詞】', artist: 'Dreamer Music' };
const lyrics = { lines: [{ fullText: '你像天使般佇立在山頂', startTime: 10, endTime: 15, words: [] }], isWordByWord: false };
describe('Video recording identity', () => {
  it('accepts the original recording with bounded extra video time', () => expect(selectVideoCandidate(target, [song])).toEqual(song));
  it('rejects short fan clips even with exactly matching artists', () => {
    expect(selectVideoCandidate(target, [{ ...song, durationMs: 104791 }])).toBeNull();
  });
  it('rejects a cover by a different primary artist', () => {
    expect(selectVideoCandidate(target, [{ ...song, artists: [{ id: 1, name: 'Another singer' }, ...song.artists!.slice(1)] }])).toBeNull();
  });
  it('rejects alternate titles and keeps Live / Remix recording identity', () => {
    for (const name of ['苦茶子2.0', '苦茶子 (Remix)', '苦茶子 (网友自制版)']) expect(selectVideoCandidate(target, [{ ...song, name }])).toBeNull();
    expect(selectVideoCandidate({ ...target, title: '苦茶子 (Live)' }, [song])).toBeNull();
  });
  it('rejects a video shorter than the recording and excessive proportional padding', () => {
    expect(selectVideoCandidate({ ...target, durationSec: 165 }, [song])).toBeNull();
    expect(selectVideoCandidate({ ...target, durationSec: 190 }, [{ ...song, durationMs: 171000 }])).toBeNull();
  });
  it('keeps ordinary exact-duration matching outside this fallback', () => {
    expect(selectVideoCandidate({ ...target, durationSec: 171 }, [song])).toBeNull();
    expect(selectVideoCandidate({ ...target, durationSec: 45 }, [{ ...song, durationMs: 35000 }])).toBeNull();
  });
});
describe('Video fallback orchestration', () => {
  const searchSongs = vi.fn(), getLyrics = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOnlineMusicProvider).mockReturnValue({ search: { searchSongs }, lyrics: { getLyrics, getChorusRanges: async () => [] } });
    searchSongs.mockResolvedValue({ items: [song] });
    getLyrics.mockResolvedValue({ lyrics, isPureMusic: false });
    vi.mocked(autoMatchBestLyric).mockResolvedValue({ lyrics, source: 'netease', id: song.id, song });
  });
  it('reuses the original matcher with a verified catalog candidate and marks the video timeline unverified', async () => {
    const result = await resolveVideoLyrics(video, [target], new AbortController().signal);
    expect(searchSongs).toHaveBeenCalledWith('苦茶子', 10, 0);
    expect(autoMatchBestLyric).toHaveBeenCalledWith(target.title, target.artist, 170796, expect.objectContaining({ providerCandidate: expect.objectContaining({ song }) }));
    expect(result).toEqual({ lyrics, origin: 'Folia netease #1922888354', durationVerified: false, alignment: 'unverified' });
  });
  it('does not relax durations for ordinary Spotify/player metadata', async () => {
    expect(await resolveVideoLyrics(target, [target], new AbortController().signal)).toBeNull();
    expect(searchSongs).not.toHaveBeenCalled();
  });
  it('does not install lyrics from a late response after a song switch', async () => {
    const job = new AbortController();
    getLyrics.mockImplementationOnce(async () => { job.abort(); return { lyrics, isPureMusic: false }; });
    await expect(resolveVideoLyrics(video, [target], job.signal)).rejects.toThrow();
    expect(autoMatchBestLyric).not.toHaveBeenCalled();
  });
  it('rejects a different recording returned by the final source matcher', async () => {
    vi.mocked(autoMatchBestLyric).mockResolvedValueOnce({ lyrics, source: 'netease', id: song.id, song: { ...song, durationMs: 150000 } });
    expect(await resolveVideoLyrics(video, [target], new AbortController().signal)).toBeNull();
  });
});
