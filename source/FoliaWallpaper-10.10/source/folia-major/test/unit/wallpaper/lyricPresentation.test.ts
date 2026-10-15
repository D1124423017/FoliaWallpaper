import { describe, expect, it } from 'vitest';
import { applyWallpaperEvent, initialWallpaperSnapshot } from '../../../src/wallpaper/model';
import { wallpaperLyricPresentation } from '../../../src/wallpaper/lyricPresentation';
import type { WallpaperSnapshot } from '../../../src/wallpaper/types';

// test/unit/wallpaper/lyricPresentation.test.ts — distinguish readable lyrics from safe timed rendering across missing clocks and song changes.
function song(): WallpaperSnapshot {
  let snapshot = applyWallpaperEvent(initialWallpaperSnapshot(), { type: 'metadata', data: { title: 'Song', artist: 'Artist' }, at: 1 });
  snapshot = applyWallpaperEvent(snapshot, { type: 'playback', data: { state: 'playing' }, at: 2 });
  return { ...snapshot, lyricStatus: 'word', source: { ...snapshot.source, lyrics: { isWordByWord: true,
    lines: [{ fullText: 'original test text', startTime: 10, endTime: 20, words: [] }] } } };
}
describe('Wallpaper lyric presentation', () => {
  it('keeps readable text when metadata arrives without a usable timeline', () => {
    const snapshot = song();
    expect(snapshot.timelineSeen).toBe(false);
    const display = wallpaperLyricPresentation(snapshot);
    expect(display.mode).toBe('preview');
    expect(display.previewLines).toBe(snapshot.source.lyrics!.lines);
    expect(display.timedLines).toHaveLength(0);
  });
  it('switches verified lyrics to the original renderer when a real timeline arrives, including pause and seek', () => {
    const ready = applyWallpaperEvent(song(), { type: 'timeline', data: { position: 14, duration: 200 }, at: 3 });
    const paused = applyWallpaperEvent(ready, { type: 'playback', data: { state: 'paused' }, at: 4 });
    const seeked = applyWallpaperEvent(paused, { type: 'timeline', data: { position: 100, duration: 200 }, at: 5 });
    for (const snapshot of [ready, paused, seeked]) {
      const display = wallpaperLyricPresentation(snapshot);
      expect(display.mode).toBe('timed'); expect(display.timedLines).toBe(snapshot.source.lyrics!.lines);
      expect(display.previewLines).toHaveLength(0);
    }
    expect(seeked.source.clock.positionSec).toBe(100);
  });
  it('does not animate an unverified MV even when its playback clock is available', () => {
    const ready = applyWallpaperEvent(song(), { type: 'timeline', data: { position: 140, duration: 454 }, at: 3 });
    const unverified = { ...ready, lyricStatus: 'unaligned' as const };
    const display = wallpaperLyricPresentation(unverified);
    expect(display.mode).toBe('preview'); expect(display.timedLines).toHaveLength(0);
    expect(display.previewLines[0].startTime).toBe(10);
  });
  it('does not carry preview text into another track or ambient mode', () => {
    const next = applyWallpaperEvent(song(), { type: 'metadata', data: { title: 'Next song', artist: 'Artist' }, at: 3 });
    expect(wallpaperLyricPresentation(next).mode).toBe('none');
    const idle = song(); idle.source.playerState = 'idle';
    expect(wallpaperLyricPresentation(idle).previewLines).toHaveLength(0);
  });
});
