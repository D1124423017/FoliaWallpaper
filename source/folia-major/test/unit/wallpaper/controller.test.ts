import { afterEach, describe, expect, it, vi } from 'vitest';
import { WallpaperController } from '../../../src/wallpaper/controller';
import type { WallpaperLyrics } from '../../../src/wallpaper/types';
import { FoliaLyricBridgeUnavailable } from '../../../src/wallpaper/foliaLyricsClient';
import { wallpaperTrackKey } from '../../../src/wallpaper/model';

// test/unit/wallpaper/controller.test.ts — real asynchronous races and UI update-frequency boundaries.
const lyric = (text: string): WallpaperLyrics => ({ origin: text, durationVerified: true,
  lyrics: { isWordByWord: true, lines: [{ fullText: text, startTime: 0, endTime: 1, words: [] }] } });
afterEach(() => vi.useRealTimers());
describe('Wallpaper lyric controller', () => {
  it('drops an old result after a song change, even if the resolver ignores cancellation', async () => {
    vi.useFakeTimers();
    let finishA!: (result: WallpaperLyrics) => void;
    const resolver = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
      .mockResolvedValueOnce(lyric('B'));
    const controller = new WallpaperController(resolver);
    controller.apply({ type: 'metadata', data: { title: 'A', artist: 'Artist' }, at: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    controller.apply({ type: 'metadata', data: { title: 'B', artist: 'Artist' }, at: 2000 });
    await vi.advanceTimersByTimeAsync(500);
    finishA(lyric('A')); await Promise.resolve();
    expect(controller.snapshot.source.lyrics?.lines[0].fullText).toBe('B'); controller.stop();
  });
  it('coalesces metadata and late duration before a lookup', async () => {
    vi.useFakeTimers(); const resolver = vi.fn().mockResolvedValue(null);
    const controller = new WallpaperController(resolver);
    controller.apply({ type: 'metadata', data: { title: 'A', artist: 'Artist' }, at: 1000 });
    controller.apply({ type: 'timeline', data: { position: 10, duration: 250 }, at: 1200 });
    await vi.advanceTimersByTimeAsync(500);
    expect(resolver).toHaveBeenCalledTimes(1); expect(resolver.mock.calls[0][0].durationSec).toBe(250); controller.stop();
  });
  it('updates timeline anchors without notifying React on every timeline event', () => {
    const controller = new WallpaperController(vi.fn().mockResolvedValue(null));
    const notify = vi.fn(); controller.subscribe(notify);
    controller.apply({ type: 'metadata', data: { title: 'A', artist: 'Artist' }, at: 1 });
    controller.apply({ type: 'timeline', data: { position: 1, duration: 250 }, at: 1 });
    notify.mockClear();
    for (let i = 2; i < 100; i++) controller.apply({ type: 'timeline', data: { position: i, duration: 250 }, at: i });
    expect(notify).not.toHaveBeenCalled(); expect(controller.getCurrentTimeSec(99)).toBe(99); controller.stop();
  });
  it('does not apply results after disposal', async () => {
    vi.useFakeTimers(); const resolver = vi.fn().mockResolvedValue(lyric('A'));
    const controller = new WallpaperController(resolver);
    controller.apply({ type: 'metadata', data: { title: 'A', artist: 'Artist' }, at: 1 }); controller.stop();
    await vi.advanceTimersByTimeAsync(1000); expect(resolver).not.toHaveBeenCalled();
  });
  it('shifts all lyric timestamps for a verified video without changing the playback clock or source data', () => {
    const controller = new WallpaperController(vi.fn().mockResolvedValue(null));
    const original = { fullText: 'verse', startTime: 15.328, endTime: 22.721,
      words: [{ text: 'verse', startTime: 15.328, endTime: 16, syllables: [{ text: 'verse', startTime: 15.4, endTime: 15.9 }] }] };
    controller.apply({ type: 'metadata', data: { title: 'MV', artist: 'Artist' }, at: 1 });
    controller.apply({ type: 'timeline', data: { position: 50.328, duration: 293 }, at: 1000 });
    controller.setDemo({ lyrics: { isWordByWord: true, lines: [original] }, origin: 'verified', durationVerified: false, timelineOffsetSec: 35 });
    const shifted = controller.snapshot.source.lyrics!.lines[0];
    expect(controller.getCurrentTimeSec(1000)).toBe(50.328);
    expect(shifted.startTime).toBeCloseTo(50.328); expect(shifted.words[0].startTime).toBeCloseTo(50.328);
    expect(shifted.words[0].syllables![0].startTime).toBeCloseTo(50.4);
    expect(shifted.endTime - shifted.startTime).toBeCloseTo(original.endTime - original.startTime);
    expect(original.startTime).toBe(15.328); expect(controller.snapshot.lyricOffsetSec).toBe(35);
    controller.apply({ type: 'metadata', data: { title: 'Other', artist: 'Artist' }, at: 2 });
    expect(controller.snapshot.lyricOffsetSec).toBe(0); controller.stop();
  });
  it('clears the previous recording when a late duration identifies a different version', async () => {
    vi.useFakeTimers(); const controller = new WallpaperController(vi.fn().mockResolvedValue(lyric('old')));
    controller.apply({ type: 'metadata', data: { title: 'A', artist: 'Artist' }, at: 1 });
    await vi.advanceTimersByTimeAsync(500); expect(controller.snapshot.source.lyrics).not.toBeNull();
    controller.apply({ type: 'timeline', data: { position: 10, duration: 293 }, at: 1000 });
    expect(controller.snapshot.source.lyrics).toBeNull(); controller.stop();
  });
  it('holds an unaligned candidate, applies generic audio correction once, and drops an old-song update', async () => {
    vi.useFakeTimers();
    const candidate = { ...lyric('candidate'), alignment: 'unverified' as const };
    const controller = new WallpaperController(vi.fn().mockResolvedValue(candidate));
    controller.apply({ type: 'metadata', data: { title: 'Unknown MV', artist: 'Artist' }, at: 1 });
    controller.apply({ type: 'timeline', data: { position: 50, duration: 300 }, at: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.snapshot.lyricStatus).toBe('unaligned'); expect(controller.snapshot.source.lyrics).toBeNull();
    const state = { key: wallpaperTrackKey({ title: 'Unknown MV', artist: 'Artist', album: '', durationSec: 300 }), origin: 'candidate',
      status: 'aligned', revision: 1, timelineMap: [{ sourceStartSec: 0, offsetSec: 17.2 }] };
    controller.applyAudioAlignment(state);
    expect(controller.snapshot.source.lyrics!.lines[0].startTime).toBe(17.2);
    controller.applyAudioAlignment({ ...state, revision: 2, timelineMap: [{ sourceStartSec: 0, offsetSec: 18.3 }] });
    expect(controller.snapshot.source.lyrics!.lines[0].startTime).toBe(18.3);
    controller.applyAudioAlignment(state); expect(controller.snapshot.source.lyrics!.lines[0].startTime).toBe(18.3);
    controller.apply({ type: 'metadata', data: { title: 'Other song', artist: 'Artist' }, at: 2000 });
    controller.applyAudioAlignment({ ...state, revision: 3 });
    expect(controller.snapshot.source.lyrics).toBeNull(); controller.stop();
  });
  it('recovers when the companion is started after the wallpaper', async () => {
    vi.useFakeTimers();
    const resolver = vi.fn().mockRejectedValueOnce(new FoliaLyricBridgeUnavailable('offline')).mockResolvedValueOnce(lyric('recovered'));
    const controller = new WallpaperController(resolver);
    controller.apply({ type: 'metadata', data: { title: 'A', artist: 'Artist' }, at: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.snapshot.lyricStatus).toBe('bridgeOffline');
    await vi.advanceTimersByTimeAsync(15000);
    expect(controller.snapshot.lyricStatus).toBe('word');
    expect(controller.snapshot.source.lyrics?.lines[0].fullText).toBe('recovered');
    controller.stop();
  });
});
