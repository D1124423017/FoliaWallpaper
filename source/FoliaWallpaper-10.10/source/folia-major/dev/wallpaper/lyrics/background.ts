import type { WallpaperLyrics, WallpaperTrack } from '../../../src/wallpaper/types';
import { wallpaperTrackKey } from '../../../src/wallpaper/model';
import { resolveFoliaWallpaperLyrics } from './resolve';

// dev/wallpaper/lyrics/background.ts — search the actual playing song even while Wallpaper Engine suspends its page.
type Lookup = (track: WallpaperTrack, signal: AbortSignal) => Promise<WallpaperLyrics | null>;
export function createBackgroundLyrics(readTrack: () => WallpaperTrack | null, lookup: Lookup = resolveFoliaWallpaperLyrics) {
  let stopped = false;
  let job: { key: string; abort: AbortController; promise: ReturnType<Lookup>; retryAt: number } | null = null;
  function begin(track: WallpaperTrack) {
    job?.abort.abort();
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 45_000);
    const next = { key: wallpaperTrackKey(track), abort, promise: Promise.resolve(null) as ReturnType<Lookup>, retryAt: Infinity };
    next.promise = lookup(track, abort.signal).then(value => {
      next.retryAt = value ? Infinity : Date.now() + 30_000;
      return value;
    }, error => { next.retryAt = Date.now() + 10_000; throw error; }).finally(() => clearTimeout(timeout));
    void next.promise.catch(() => {});
    job = next;
    return next;
  }
  function maintain() {
    const track = readTrack();
    if (!track) { job?.abort.abort(); job = null; return; }
    if (!job || job.key !== wallpaperTrackKey(track) || Date.now() >= job.retryAt) begin(track);
  }
  const timer = setInterval(maintain, 700); timer.unref?.();
  maintain();
  return {
    async resolve(track: WallpaperTrack, signal: AbortSignal): Promise<WallpaperLyrics | null> {
      signal.throwIfAborted();
      const current = readTrack();
      if (stopped || !current || wallpaperTrackKey(current) !== wallpaperTrackKey(track)) return lookup(track, signal);
      if (!job || job.key !== wallpaperTrackKey(track) || Date.now() >= job.retryAt) begin(current);
      let cancelled: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        cancelled = () => reject(signal.reason ?? new Error('Aborted'));
        signal.addEventListener('abort', cancelled, { once: true });
      });
      try { return await Promise.race([job!.promise, aborted]); }
      finally { signal.removeEventListener('abort', cancelled!); }
    },
    stop() { stopped = true; clearInterval(timer); job?.abort.abort(); job = null; },
  };
}
