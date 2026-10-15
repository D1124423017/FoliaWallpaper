import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackgroundLyrics } from '../../../dev/wallpaper/lyrics/background';
import type { WallpaperLyrics, WallpaperTrack } from '../../../src/wallpaper/types';

// test/unit/wallpaper/backgroundLyrics.test.ts — background searches share work with a hidden/resumed wallpaper.
afterEach(() => vi.useRealTimers());
const song: WallpaperTrack = { title: 'Song', artist: 'Singer', album: '', durationSec: 200.1 };
describe('Background lyric search', () => {
  it('starts without a renderer and shares a pending search with its request', async () => {
    vi.useFakeTimers(); let finish!: (value: WallpaperLyrics | null) => void;
    const lookup = vi.fn(() => new Promise<WallpaperLyrics | null>(resolve => { finish = resolve; }));
    const service = createBackgroundLyrics(() => song, lookup);
    const result = service.resolve({ ...song, durationSec: 200.2 }, new AbortController().signal);
    expect(lookup).toHaveBeenCalledTimes(1);
    finish(null); expect(await result).toBeNull(); service.stop();
  });
  it('cancels the previous song and retries a missing match with a bounded delay', async () => {
    vi.useFakeTimers(); let current = song;
    const lookup = vi.fn(async (_track: WallpaperTrack, _signal: AbortSignal) => null);
    const service = createBackgroundLyrics(() => current, lookup);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lookup).toHaveBeenCalledTimes(1);
    const first = lookup.mock.calls[0][1] as AbortSignal;
    current = { ...song, title: 'Next song' };
    await vi.advanceTimersByTimeAsync(700);
    expect(first.aborted).toBe(true); expect(lookup).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(29_000); expect(lookup).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1400); expect(lookup).toHaveBeenCalledTimes(3);
    service.stop();
  });
  it('keeps the background search when a renderer disconnects', async () => {
    vi.useFakeTimers(); let backgroundSignal!: AbortSignal;
    const lookup = vi.fn((_track: WallpaperTrack, signal: AbortSignal) => {
      backgroundSignal = signal; return new Promise<WallpaperLyrics | null>(() => {});
    });
    const service = createBackgroundLyrics(() => song, lookup), request = new AbortController();
    const result = service.resolve(song, request.signal); request.abort();
    await expect(result).rejects.toThrow(); expect(backgroundSignal.aborted).toBe(false);
    service.stop(); expect(backgroundSignal.aborted).toBe(true);
  });
});
