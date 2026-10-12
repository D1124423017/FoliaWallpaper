import { describe, expect, it, vi } from 'vitest';
import { applyWallpaperEvent, initialWallpaperSnapshot, wallpaperCurrentTimeSec } from '../../../src/wallpaper/model';
import { WallpaperController } from '../../../src/wallpaper/controller';
import { currentWebLyricTimeSec } from '../../../src/utils/webLyricSource';
import { readBrowserMedia } from '../../../dev/wallpaper/browserMedia';

// test/unit/wallpaper/browserTimeline.test.ts — actual browser anchors recover missing WE progress without another tab taking over.
const media = { id: '123', title: 'Song', artist: 'Artist', position: 80, duration: 240, playing: true };
const song = () => applyWallpaperEvent(initialWallpaperSnapshot(), { type: 'metadata', data: { title: 'Song', artist: 'Artist' }, at: 1000 });
const packet = (data = {}, at = 1000) => ({ type: 'browser-timeline', data: { ...media, at, ...data }, at });
describe('browser timeline fallback', () => {
  it('recovers lyrics timing without any native timeline event', () => {
    const state = applyWallpaperEvent(song(), packet());
    expect(state.timelineSeen).toBe(true); expect(state.timelineSource).toBe('browser');
    expect(currentWebLyricTimeSec(state.source.clock, 2531)).toBe(81.531);
  });
  it('seeks, pauses and resumes at the actual browser position', () => {
    let state = applyWallpaperEvent(song(), packet());
    state = applyWallpaperEvent(state, packet({ position: 165, playing: false }, 2000));
    expect(currentWebLyricTimeSec(state.source.clock, 9000)).toBe(165);
    state = applyWallpaperEvent(state, packet({ position: 20 }, 9000));
    expect(currentWebLyricTimeSec(state.source.clock, 10000)).toBe(21);
  });
  it('extrapolates playback speed and freezes while buffering', () => {
    const fast = applyWallpaperEvent(song(), packet({ playbackRate: 1.5 }));
    expect(wallpaperCurrentTimeSec(fast, 3000)).toBe(83);
    const buffering = applyWallpaperEvent(fast, packet({ position: 83, playbackRate: 1.5, playing: false }, 3000));
    expect(wallpaperCurrentTimeSec(buffering, 8000)).toBe(83);
    const normal = applyWallpaperEvent(buffering, { type: 'timeline', data: { position: 90, duration: 240 }, at: 9000 });
    expect(normal.playbackRate).toBe(1);
  });
  it('cannot overwrite a seek with an older packet from a fallback request', () => {
    const seek = applyWallpaperEvent(song(), packet({ position: 165, playing: false }, 3000));
    expect(applyWallpaperEvent(seek, packet({ position: 80 }, 2000))).toBe(seek);
    expect(applyWallpaperEvent(seek, packet({ position: 165, playing: false }, 3000))).toBe(seek);
  });
  it('ignores wrong tabs and stale or invalid progress', () => {
    const state = song();
    for (const data of [{ title: 'Other' }, { at: -5000 }, { duration: Infinity }, { position: NaN }, { playing: 'true' }])
      expect(applyWallpaperEvent(state, packet(data))).toBe(state);
  });
  it('prefers fresh browser state, then releases to native state when the relay is gone', () => {
    const browser = applyWallpaperEvent(song(), packet());
    expect(applyWallpaperEvent(browser, { type: 'playback', data: { state: 'paused' }, at: 2000 })).toBe(browser);
    const expired = applyWallpaperEvent(browser, { type: 'browser-expired', data: {}, at: 6000 });
    expect(expired.timelineSeen).toBe(false); expect(expired.source.clock.playing).toBe(false);
    const native = applyWallpaperEvent(expired, { type: 'timeline', data: { position: 90, duration: 240 }, at: 6000 });
    expect(native.timelineSeen).toBe(true); expect(native.timelineSource).toBe('native');
  });
  it('does not render React on each progress report, but does notify on pause', () => {
    const controller = new WallpaperController(vi.fn().mockResolvedValue(null));
    const notify = vi.fn(); controller.subscribe(notify);
    controller.apply({ type: 'metadata', data: { title: 'Song', artist: 'Artist' }, at: 1000 });
    controller.apply(packet()); notify.mockClear();
    for (let i = 1; i < 10; i++) controller.apply(packet({ position: 80 + i }, 1000 + i * 1000));
    expect(notify).not.toHaveBeenCalled();
    controller.apply(packet({ position: 90, playing: false }, 11000));
    expect(notify).toHaveBeenCalledTimes(1); controller.stop();
  });
  it('only accepts bounded finite video input', () => {
    expect(readBrowserMedia(media, 1000).media.at).toBe(1000);
    expect(readBrowserMedia(media, 1000).media.playbackRate).toBe(1);
    for (const data of [{ duration: 0 }, { position: -1 }, { duration: 86401 }, { id: 'bad' }, { playbackRate: 0 }, { playbackRate: Infinity }]) expect(() => readBrowserMedia({ ...media, ...data }, 1000)).toThrow();
  });
});
