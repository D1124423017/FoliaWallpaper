import { describe, expect, it, vi } from 'vitest';
import { readSystemMedia, selectSystemMedia, type SystemMedia } from '../../../dev/wallpaper/media/select';
import { applyWallpaperEvent, initialWallpaperSnapshot, wallpaperCurrentTimeSec } from '../../../src/wallpaper/model';
import { WallpaperController } from '../../../src/wallpaper/controller';

// test/unit/wallpaper/systemMedia.test.ts — cross-app arbitration, missing host metadata and stale clocks.
const media = (changes: Partial<SystemMedia> = {}): SystemMedia => ({ title: 'Song', artist: 'Singer', album: 'Album', app: 'Spotify',
  current: true, playing: true, position: 25, duration: 200, playbackRate: 1, at: 1000, cover: null, origin: 'system', timelineAvailable: true, ...changes });
const event = (data: SystemMedia | null, at = 1000) => ({ type: 'system-media', data, at });
describe('Windows media fallback', () => {
  it('installs a real song and timeline without any Wallpaper Engine metadata event', () => {
    const state = applyWallpaperEvent(initialWallpaperSnapshot(), event(media()));
    expect(state.source.track?.name).toBe('Song'); expect(state.mediaSource).toBe('system');
    expect(wallpaperCurrentTimeSec(state, 2531)).toBe(26.531);
  });
  it('seeks and pauses immediately, then freezes without guessing a new clock', () => {
    const playing = applyWallpaperEvent(initialWallpaperSnapshot(), event(media()));
    const paused = applyWallpaperEvent(playing, event(media({ position: 170, playing: false, at: 2000 }), 2000));
    expect(wallpaperCurrentTimeSec(paused, 9000)).toBe(170);
  });
  it('clears the cover and lyrics on a different song and expires a vanished source', () => {
    let state = applyWallpaperEvent(initialWallpaperSnapshot(), event(media({ cover: 'data:image/png;base64,YQ==' })));
    state.source.lyrics = { lines: [], isWordByWord: false };
    state = applyWallpaperEvent(state, event(media({ title: 'Next', at: 2000 }), 2000));
    expect(state.source.lyrics).toBeNull(); expect(state.source.track?.coverUrl).toBeNull();
    state = applyWallpaperEvent(state, { type: 'system-expired', data: {}, at: 6001 });
    expect(state.source.track).toBeNull(); expect(state.source.clock.playing).toBe(false);
  });
  it('rejects stale, future and malformed data and does not invent a missing timeline', () => {
    const initial = initialWallpaperSnapshot();
    expect(applyWallpaperEvent(initial, event(media({ at: -4000 })))).toBe(initial);
    expect(applyWallpaperEvent(initial, event(media({ at: 3000 })))).toBe(initial);
    expect(readSystemMedia(media({ duration: NaN }), 1000)).toBeNull();
    const unknown = applyWallpaperEvent(initial, event(media({ timelineAvailable: false, duration: 0 })));
    expect(unknown.source.playerState).toBe('playing'); expect(unknown.timelineSeen).toBe(false); expect(unknown.source.clock.playing).toBe(false);
  });
  it('ignores the broken host while the independent source is fresh, then accepts host recovery', () => {
    let state = applyWallpaperEvent(initialWallpaperSnapshot(), event(media()));
    expect(applyWallpaperEvent(state, { type: 'metadata', data: { title: '' }, at: 1200 })).toBe(state);
    state = applyWallpaperEvent(state, { type: 'metadata', data: { title: 'Native', artist: 'Singer' }, at: 6000 });
    expect(state.source.track?.name).toBe('Native'); expect(state.mediaSource).toBe('native');
  });
  it('keeps audio-only detection separate from song recognition', () => {
    const state = applyWallpaperEvent(initialWallpaperSnapshot(), { type: 'audio-activity', data: true, at: 1000 });
    expect(state.audioActive).toBe(true); expect(state.source.track).toBeNull(); expect(state.timelineSeen).toBe(false);
  });
  it('prefers a playing native app over an unrelated paused browser and other paused sessions', () => {
    const chosen = selectSystemMedia([media({ app: 'VLC', current: false }), media({ app: 'Chrome', title: 'Video', playing: false })],
      [{ ...media({ title: 'Other', playing: false }), artist: 'Uploader' }], 1000);
    expect(chosen?.app).toBe('VLC');
  });
  it('uses exact browser progress for a matching browser session, preserving the cover', () => {
    const windows = media({ app: 'Chrome', artist: 'SingerVEVO', cover: 'data:image/png;base64,YQ==' });
    const chosen = selectSystemMedia([windows], [media({ position: 80, playing: false })], 1000);
    expect(chosen?.origin).toBe('browser'); expect(chosen?.position).toBe(80); expect(chosen?.playing).toBe(false);
    expect(chosen?.cover).toBe(windows.cover);
    expect(selectSystemMedia([media()], [media({ position: 90 })], 1000)?.origin).toBe('system');
  });
  it('falls back to a fresh browser report when Windows has no usable session', () => {
    expect(selectSystemMedia([], [media()], 1000)?.origin).toBe('browser');
    expect(selectSystemMedia([media()], [], 6000)).toBeNull();
  });
  it('does not let a generic browser media slot hide a playing YouTube song', () => {
    const generic = media({ app: 'Chrome', title: '抖音-记录美好生活', artist: '' });
    const tab = media({ title: 'Rihanna - Work', artist: 'Rihanna', position: 144 });
    const chosen = selectSystemMedia([generic], [tab], 1000);
    expect(chosen?.origin).toBe('browser'); expect(chosen?.title).toBe(tab.title); expect(chosen?.position).toBe(144);
    expect(selectSystemMedia([{ ...generic, app: 'VLC' }], [tab], 1000)?.app).toBe('VLC');
  });
  it('does not trigger React updates or repeat lyric jobs for every clock poll', () => {
    const controller = new WallpaperController(vi.fn().mockResolvedValue(null));
    const notify = vi.fn(); controller.subscribe(notify);
    controller.apply(event(media())); notify.mockClear();
    for (let at = 1500; at < 5000; at += 500) controller.apply(event(media({ at, position: at / 1000 }), at));
    expect(notify).not.toHaveBeenCalled(); controller.stop();
  });
});
