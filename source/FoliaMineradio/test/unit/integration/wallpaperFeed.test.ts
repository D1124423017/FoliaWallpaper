import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSharedPlayback } from '../../../shared/integrationPlayback.mjs';
import { WallpaperController } from '../../../src/wallpaper/controller';
import type { SharedPlaybackSnapshot } from '../../../src/integration/wallpaperContracts';

// Exact parsed lyrics and player clocks must survive transport without searching again or leaking credentials.
const packet = (at = 10000): SharedPlaybackSnapshot => ({
  app: 'FoliaMineradioPlayer', schema: 1, capturedAt: at, playbackSource: 'direct',
  song: { key: 'online:test:1', title: 'Track', artist: 'Artist', album: 'Album', cover: null, provider: 'test' },
  clock: { positionSec: 20, lyricPositionSec: 19.5, durationSec: 180, playing: true },
  lyrics: { isWordByWord: true, lines: [{ fullText: '世界', startTime: 19, endTime: 21,
    words: [{ text: '世界', startTime: 19, endTime: 21, syllables: [{ text: '世', startTime: 19, endTime: 20, ruby: [{ text: 'せ', startTime: 19, endTime: 20 }] }] }],
    romanization: 'sekai', alternateTexts: [{ role: 'translation', text: 'World' }] }] },
  theme: { name: 'Cover', primaryColor: '#fff', secondaryColor: '#aaa', accentColor: '#f00', backgroundColor: '#000', fontStyle: 'sans', animationIntensity: 'normal' },
  audio: { power: .4, bass: .5, lowMid: .3, mid: .2, vocal: .6, treble: .1, frequency: [0, 200, 255], timeDomain: [128, 140, 118], sampleRate: 48000 },
  sources: { music: 'test', lyrics: 'Folia parsed lyrics', timeline: 'Folia audio clock', lyricsStatus: 'word' },
});
afterEach(() => vi.useRealTimers());
describe('public player feed boundary', () => {
  it('preserves rich word timing, ruby and raw audio while omitting unrelated credentials', () => {
    const value = packet() as SharedPlaybackSnapshot & Record<string, unknown>;
    value.accounts = { token: 'secret-token' };
    (value.clock as any).apiKey = 'private-key';
    (value.lyrics as any).credentials = 'private-credentials';
    const copied = readSharedPlayback(value, 10000)!;
    expect(copied.lyrics).toEqual(packet().lyrics); expect(copied.audio).toEqual(packet().audio);
    expect(JSON.stringify(copied)).not.toContain('private-'); expect(JSON.stringify(copied)).not.toContain('secret-token');
    expect(copied.lyrics).not.toBe(value.lyrics);
  });
  it('removes authenticated artwork URLs while allowing inline covers and public artwork', () => {
    const value = packet(); value.song!.cover = 'https://music.example/rest/getCoverArt?u=listener&t=secret&s=salt';
    expect(readSharedPlayback(value, 10000)?.song?.cover).toBeNull();
    value.song!.cover = 'https://music.example/public.jpg?size=200';
    expect(readSharedPlayback(value, 10000)?.song?.cover).toBe(value.song!.cover);
    value.song!.cover = 'data:image/png;base64,AAAA';
    expect(readSharedPlayback(value, 10000)?.song?.cover).toBe(value.song!.cover);
  });
  it('rejects stale clocks and invalid time boundaries', () => {
    expect(readSharedPlayback(packet(), 15000)).toBeNull();
    const value = packet(); value.clock.positionSec = Infinity;
    expect(readSharedPlayback(value, 10000)).toBeNull();
    value.clock.positionSec = 0; value.lyrics!.lines[0]!.words[0]!.startTime = NaN;
    expect(readSharedPlayback(value, 10000)).toBeNull();
  });
});
describe('desktop follows parsed player output', () => {
  it('avoids a second search, advances the exact lyric clock and does not rerender on every packet', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const resolver = vi.fn(), controller = new WallpaperController(resolver), changed = vi.fn();
    controller.subscribe(changed); controller.applyPlayer(packet(), 10000);
    expect(controller.snapshot.lyricStatus).toBe('word'); expect(controller.snapshot.mediaSource).toBe('player');
    expect(controller.getCurrentTimeSec(11000)).toBe(20.5);
    const lyrics = controller.snapshot.source.lyrics;
    controller.apply({ type: 'audio-activity', data: true, at: 10000 });
    expect(controller.snapshot.source.lyrics).toBe(lyrics);
    expect(controller.snapshot.lyricStatus).toBe('word');
    const next = packet(10250); next.clock.positionSec = 20.25; next.clock.lyricPositionSec = 19.75;
    controller.applyPlayer(next, 10250);
    expect(controller.snapshot.source.lyrics).toBe(lyrics); expect(changed).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000); expect(resolver).not.toHaveBeenCalled();
    controller.stop();
  });
  it('keeps cached synchronized lyrics visible while the player updates its lyric match', () => {
    const value = packet(); value.sources.lyricsStatus = 'loading';
    const controller = new WallpaperController(vi.fn()); controller.applyPlayer(value, 10000);
    expect(controller.snapshot.lyricStatus).toBe('word'); expect(controller.snapshot.source.lyrics?.lines).toHaveLength(1);
    controller.stop();
  });
  it('freezes on pause, follows seeks, and expires a stopped player instead of borrowing another source', () => {
    const controller = new WallpaperController(vi.fn()), paused = packet(); paused.clock.playing = false;
    controller.applyPlayer(paused, 10000); expect(controller.getCurrentTimeSec(12000)).toBe(19.5);
    const seek = packet(11000); seek.clock.positionSec = 80; seek.clock.lyricPositionSec = 79.5;
    controller.applyPlayer(seek, 11000); expect(controller.getCurrentTimeSec(11500)).toBe(80);
    controller.apply({ type: 'metadata', data: { title: 'Other tab' }, at: 12000 });
    expect(controller.snapshot.source.track?.name).toBe('Track');
    controller.apply({ type: 'system-expired', data: {}, at: 22000 });
    expect(controller.snapshot.source.track).toBeNull(); controller.stop();
  });
  it('cancels an in-flight external lyric lookup and allows external sources again after selection changes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    let finish!: (value: any) => void;
    const resolver = vi.fn(() => new Promise(resolve => { finish = resolve; })), controller = new WallpaperController(resolver as any);
    controller.apply({ type: 'metadata', data: { title: 'External' }, at: 10000 });
    await vi.advanceTimersByTimeAsync(500);
    controller.applyPlayer(packet(10500), 10500);
    finish({ lyrics: packet().lyrics, origin: 'Old external result', durationVerified: true }); await Promise.resolve();
    expect(controller.snapshot.lyricOrigin).toBe('Folia parsed lyrics');
    controller.clearPlayer();
    controller.apply({ type: 'metadata', data: { title: 'Selected external' }, at: 10600 });
    expect(controller.snapshot.source.track?.name).toBe('Selected external'); controller.stop();
  });
  it('keeps synchronized lyrics and extrapolates the anchored clock through a transient missing poll', () => {
    const controller = new WallpaperController(vi.fn()), notify = vi.fn();
    controller.subscribe(notify); controller.applyPlayer(packet(), 10000);
    const lyrics = controller.snapshot.source.lyrics;
    controller.applyPlayer(null, 14500);
    expect(controller.snapshot.mediaSource).toBe('player'); expect(controller.snapshot.source.lyrics).toBe(lyrics);
    expect(controller.snapshot.source.connectionStatus).toBe('connecting');
    expect(controller.getCurrentTimeSec(14500)).toBe(24);
    const fresh = packet(15000); fresh.clock.positionSec = 25; fresh.clock.lyricPositionSec = 24.5;
    controller.applyPlayer(fresh, 15000);
    expect(controller.snapshot.source.connectionStatus).toBe('connected');
    expect(controller.getCurrentTimeSec(15000)).toBe(24.5); expect(notify).toHaveBeenCalledTimes(3);
    controller.apply({ type: 'system-expired', data: {}, at: 26000 });
    expect(controller.snapshot.source.track).toBeNull(); controller.stop();
  });
});
