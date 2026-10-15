import { afterEach, describe, expect, it, vi } from 'vitest';
import { WallpaperController } from '../../../src/wallpaper/controller';
import { startSystemMediaClient } from '../../../src/wallpaper/systemMediaClient';
import type { WallpaperHost, HostEvent } from '../../../src/wallpaper/types';

// Recover actual player data when the intermediary drops a packet without overriding a selected browser source.
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('direct player recovery', () => {
  it('uses fresh direct clocks through intermediary loss and immediately respects a new explicit source', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    let offline = false;
    const listeners = new Set<(event: HostEvent) => void>();
    const host: WallpaperHost = { native: true, history: [], settings: {}, audio: [], paused: false,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      emit(type, data) { listeners.forEach(listener => listener({ type, data, at: Date.now() })); } };
    const fetch = vi.fn(async (url: unknown) => {
      if (String(url).includes(':32120/')) return new Response(JSON.stringify({
        app: 'FoliaMineradioPlayer', schema: 1, capturedAt: Date.now(), playbackSource: 'direct',
        song: { key: 'online:test:1', title: 'Track', artist: 'Artist', album: '', cover: null, provider: 'test' },
        clock: { positionSec: 20, lyricPositionSec: 20, durationSec: 180, playing: true },
        lyrics: { isWordByWord: false, lines: [{ fullText: 'line', startTime: 10, endTime: 30, words: [] }] },
        theme: null, audio: null, sources: { music: 'test', lyrics: 'test', timeline: 'test', lyricsStatus: 'line' },
      }));
      if (offline) throw new Error('Intermediary unavailable');
      return new Response(JSON.stringify({ app: 'FoliaWallpaperMedia', schema: 1,
        selection: { kind: 'application', id: 'folia-mineradio' }, player: null, media: null, audio: null }));
    });
    vi.stubGlobal('fetch', fetch);
    const controller = new WallpaperController(vi.fn().mockResolvedValue(null)), stop = startSystemMediaClient(controller, host);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.snapshot.source.track?.name).toBe('Track'); expect(controller.snapshot.lyricStatus).toBe('line');
    offline = true; await vi.advanceTimersByTimeAsync(5000);
    expect(controller.snapshot.mediaSource).toBe('player'); expect(controller.snapshot.source.track?.name).toBe('Track');
    expect(controller.snapshot.source.connectionStatus).toBe('connected');
    const directCalls = fetch.mock.calls.filter(([url]) => String(url).includes(':32120/')).length;
    host.emit('media-source-changed', { kind: 'browser', id: '42' });
    expect(controller.snapshot.source.track).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes(':32120/'))).toHaveLength(directCalls);
    expect(controller.snapshot.mediaSource).not.toBe('player');
    stop(); controller.stop(); expect(listeners.size).toBe(0);
  });
});
