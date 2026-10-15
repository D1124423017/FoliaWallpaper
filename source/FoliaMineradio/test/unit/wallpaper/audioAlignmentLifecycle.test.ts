import { afterEach, describe, expect, it, vi } from 'vitest';
import { WallpaperController } from '../../../src/wallpaper/controller';
import { startAudioAlignment } from '../../../src/wallpaper/audioAlignmentClient';
import { AlignmentCache, lyricAlignmentSignature, validCachedAlignment } from '../../../dev/wallpaper/audio/alignmentCache';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WallpaperLyrics } from '../../../src/wallpaper/types';

// test/unit/wallpaper/audioAlignmentLifecycle.test.ts — hidden wallpapers must not pause music analysis; verified timings survive restarts.
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const candidate: WallpaperLyrics = { origin: 'Folia kugou #song', durationVerified: false, alignment: 'unverified',
  lyrics: { isWordByWord: false, lines: [{ fullText: 'test lyrics', words: [], startTime: 20, endTime: 30 }] } };
describe('Background lyric analysis', () => {
  it('reports the actual playing song while Wallpaper Engine suspends its rendering', async () => {
    vi.useFakeTimers(); const requests: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      requests.push({ url, body: options?.body as string | undefined });
      return { ok: true, json: async () => ({ app: 'FoliaWallpaperAudio', schema: 1 }) };
    }));
    const controller = new WallpaperController(vi.fn().mockResolvedValue(null));
    controller.apply({ type: 'metadata', data: { title: 'Song', artist: 'Singer' }, at: Date.now() });
    controller.apply({ type: 'playback', data: { state: 'playing' }, at: Date.now() });
    controller.apply({ type: 'timeline', data: { position: 50, duration: 200 }, at: Date.now() });
    controller.apply({ type: 'suspend', data: true, at: Date.now() });
    const stop = startAudioAlignment(controller); await vi.advanceTimersByTimeAsync(1);
    expect(JSON.parse(requests.find(request => request.url.endsWith('/audio-playback'))!.body!).playing).toBe(true);
    stop(); controller.stop();
  });
  it('reloads validated timing and rejects a changed recording or lyric timestamps', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-alignment-'));
    try {
      const cache = new AlignmentCache(directory);
      cache.remember({ key: 'song-key', origin: candidate.origin, status: 'aligned', revision: 4,
        timelineMap: [{ sourceStartSec: 0, offsetSec: 37.5 }] }, candidate);
      const restored = new AlignmentCache(directory);
      expect(restored.get('song-key', candidate)?.timelineMap[0].offsetSec).toBe(37.5);
      expect(restored.get('different-recording', candidate)).toBeUndefined();
      expect(restored.get('song-key', { ...candidate, origin: 'different-provider' })).toBeUndefined();
      const changed = { ...candidate, lyrics: { ...candidate.lyrics, lines: [{ ...candidate.lyrics.lines[0], startTime: 10 }] } };
      expect(restored.get('song-key', changed)).toBeUndefined();
      expect(validCachedAlignment({ key: 'song-key', origin: candidate.origin, status: 'aligned', revision: 4,
        signature: lyricAlignmentSignature(candidate), timelineMap: [{ sourceStartSec: 0, offsetSec: NaN }] })).toBe(false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
