import { afterEach, describe, expect, it, vi } from 'vitest';
import { WallpaperController } from '../../../src/wallpaper/controller';
import { startSystemMediaClient } from '../../../src/wallpaper/systemMediaClient';
import type { HostEvent, WallpaperHost } from '../../../src/wallpaper/types';

// test/unit/wallpaper/systemMediaClient.test.ts — selection applies immediately and invalidates in-flight automatic replies.
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('source selection propagation', () => {
  it('blocks a previous automatic reply after a user explicitly chooses one tab', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const listeners = new Set<(event: HostEvent) => void>();
    const host: WallpaperHost = { native: true, history: [], settings: {}, audio: [], paused: true,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      emit(type, data) { listeners.forEach(listener => listener({ type, data, at: Date.now() })); } };
    let finishOld: (value: unknown) => void = () => {};
    const response = (title: string, kind: string) => ({ ok: true, json: async () => ({ app: 'FoliaWallpaperMedia', schema: 1,
      selection: { kind, id: kind === 'auto' ? '' : '42' }, media: { title, artist: 'Singer', album: '', origin: 'browser',
        position: 25, duration: 200, playbackRate: 1, playing: false, timelineAvailable: true, at: Date.now() },
      audio: { available: true, active: false, peak: 0, at: Date.now() } }) });
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementation(async () => response('Selected YouTube', 'browser'));
    vi.stubGlobal('fetch', fetch);
    const controller = new WallpaperController(vi.fn().mockResolvedValue(null));
    controller.apply({ type: 'metadata', data: { title: 'Old Chrome page' }, at: Date.now() });
    const stop = startSystemMediaClient(controller, host);
    host.emit('media-source-changed', { kind: 'browser', id: '42' });
    expect(controller.snapshot.manualSource).toBe(true); expect(controller.snapshot.source.track).toBeNull();
    controller.apply({ type: 'metadata', data: { title: 'Douyin' }, at: Date.now() });
    expect(controller.snapshot.source.track).toBeNull();
    finishOld(response('Douyin', 'auto')); await vi.advanceTimersByTimeAsync(1);
    expect(controller.snapshot.manualSource).toBe(true);
    expect(controller.snapshot.source.track?.name).toBe('Selected YouTube');
    expect(controller.snapshot.source.clock.playing).toBe(false);
    stop(); controller.stop();
    expect(listeners.size).toBe(0);
  });
});
