import { describe, expect, it } from 'vitest';
import { mapWallpaperAudio } from '../../../src/wallpaper/audio';
import { scoreWallpaperCandidate } from '../../../src/wallpaper/lyricsProviders';

// test/unit/wallpaper/audioMatch.test.ts — stereo mapping and reject unsuitable recording candidates.
describe('Wallpaper audio', () => {
  it('averages left and right rather than treating right-channel bass as treble', () => {
    const values = Array(128).fill(0); values[0] = 1; values[64] = 1;
    const result = mapWallpaperAudio(values);
    expect(result.spectrum[0]).toBe(255); expect(result.bass).toBeGreaterThan(0); expect(result.treble).toBe(0);
  });
  it('clamps spikes, negatives and invalid samples', () => {
    const result = mapWallpaperAudio(Array(128).fill(10));
    expect(result.power).toBe(255);
    expect(mapWallpaperAudio(Array(128).fill(NaN)).power).toBe(0);
    expect(mapWallpaperAudio(Array(128).fill(-1)).power).toBe(0);
    expect(mapWallpaperAudio(Array(128).fill(1), 0).power).toBe(0);
  });
});
describe('Wallpaper lyric identity', () => {
  const target = { title: 'Song', artist: 'Original Artist', album: '', durationSec: 250 };
  const candidate = { id: 1, name: 'Song', artists: [{ id: 1, name: 'Original Artist' }], album: { id: 1, name: '' }, durationMs: 250000 };
  it('accepts a matching recording', () => expect(scoreWallpaperCandidate(target, candidate)).toBeGreaterThanOrEqual(75));
  it('rejects a same-title cover by another artist', () => expect(scoreWallpaperCandidate(target, { ...candidate, artists: [{ id: 2, name: 'Someone Else' }] })).toBe(0));
  it('rejects a duration mismatch', () => expect(scoreWallpaperCandidate(target, { ...candidate, durationMs: 280000 })).toBe(0));
  it('does not treat missing catalog duration as a verified recording', () => expect(scoreWallpaperCandidate(target, { ...candidate, durationMs: 0 })).toBe(0));
  it('does not strip a live-version marker when scoring', () => expect(scoreWallpaperCandidate({ ...target, title: 'Song (Live)' }, candidate)).toBe(0));
});
