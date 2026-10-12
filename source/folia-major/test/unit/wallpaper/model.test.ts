import { describe, expect, it } from 'vitest';
import { applyWallpaperEvent, initialWallpaperSnapshot, playbackState } from '../../../src/wallpaper/model';
import { currentWebLyricTimeSec } from '../../../src/utils/webLyricSource';

// test/unit/wallpaper/model.test.ts — seek, freeze, missing timeline and track boundaries.
function playing() {
  let state = initialWallpaperSnapshot();
  state = applyWallpaperEvent(state, { type: 'metadata', data: { title: 'A', artist: 'Artist' }, at: 1000 });
  state = applyWallpaperEvent(state, { type: 'playback', data: { state: 'playing' }, at: 1000 });
  return applyWallpaperEvent(state, { type: 'timeline', data: { position: 80, duration: 250 }, at: 1000 });
}
describe('Wallpaper media timeline', () => {
  it('extrapolates seconds without converting them from milliseconds', () => {
    expect(currentWebLyricTimeSec(playing().source.clock, 2531)).toBe(81.531);
  });
  it('jumps immediately on a seek backwards or forwards', () => {
    const forward = applyWallpaperEvent(playing(), { type: 'timeline', data: { position: 165, duration: 250 }, at: 2000 });
    expect(currentWebLyricTimeSec(forward.source.clock, 2000)).toBe(165);
    const back = applyWallpaperEvent(forward, { type: 'timeline', data: { position: 20, duration: 250 }, at: 3000 });
    expect(currentWebLyricTimeSec(back.source.clock, 3000)).toBe(20);
  });
  it('freezes while paused and continues from that anchor', () => {
    const paused = applyWallpaperEvent(playing(), { type: 'playback', data: { state: 'paused' }, at: 3000 });
    expect(currentWebLyricTimeSec(paused.source.clock, 9000)).toBe(82);
    const resumed = applyWallpaperEvent(paused, { type: 'playback', data: { state: 'playing' }, at: 9000 });
    expect(currentWebLyricTimeSec(resumed.source.clock, 10000)).toBe(83);
  });
  it('clears lyrics, cover and the old timeline on a track change', () => {
    const state = playing();
    state.source.lyrics = { lines: [], isWordByWord: true };
    const next = applyWallpaperEvent(state, { type: 'metadata', data: { title: 'B', artist: 'Artist' }, at: 4000 });
    expect(next.source.lyrics).toBeNull(); expect(next.timelineSeen).toBe(false);
    expect(next.source.clock.positionSec).toBe(0); expect(next.source.track?.coverUrl).toBeNull();
  });
  it('does not invent a timeline when the player only sends metadata and playback', () => {
    const state = applyWallpaperEvent(initialWallpaperSnapshot(), { type: 'playback', data: { state: 'playing' }, at: 1 });
    expect(state.source.clock.playing).toBe(false);
  });
  it('wallpaper suspension does not pause the actual music clock', () => {
    const state = applyWallpaperEvent(playing(), { type: 'suspend', data: true, at: 3000 });
    expect(state.suspended).toBe(true); expect(currentWebLyricTimeSec(state.source.clock, 11000)).toBe(90);
  });
  it('rejects invalid timeline values and clamps position to duration', () => {
    expect(applyWallpaperEvent(playing(), { type: 'timeline', data: { position: NaN }, at: 1 }).source.clock.positionSec).toBe(80);
    expect(applyWallpaperEvent(playing(), { type: 'timeline', data: { position: 300, duration: 250 }, at: 1 }).source.clock.positionSec).toBe(250);
  });
  it('resolves both documented constant layouts without guessing numeric values', () => {
    expect(playbackState(42, { PLAYBACK_PLAYING: 42 })).toBe('playing');
    expect(playbackState(75, { playback: { PAUSED: 75 } })).toBe('paused');
    expect(playbackState(42, undefined)).toBe('idle');
  });
});
