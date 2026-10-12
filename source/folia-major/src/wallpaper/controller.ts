import { applyWallpaperEvent, initialWallpaperSnapshot, wallpaperTrack, wallpaperTrackKey, wallpaperCurrentTimeSec } from './model';
import { resolveWallpaperLyrics } from './lyricResolver';
import { FoliaLyricBridgeUnavailable } from './foliaLyricsClient';
import type { HostEvent, WallpaperLyrics, WallpaperSnapshot, WallpaperTrack } from './types';
import { retimeLine } from '../utils/lyrics/staffCreditsRewrite';

// src/wallpaper/controller.ts — prevent stale lyric jobs from overwriting a newly selected song.
export class WallpaperController {
  snapshot = initialWallpaperSnapshot();
  private listeners = new Set<() => void>();
  private job: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lyricKey = '';
  private stopped = false;
  private originalLyrics: WallpaperLyrics | null = null;
  private audioRevision = -1;
  constructor(private readonly resolver = resolveWallpaperLyrics,
    private readonly constants: Window['wallpaperMediaIntegration'] = undefined) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  getCurrentTimeSec = (nowMs: number) => wallpaperCurrentTimeSec(this.snapshot, nowMs);
  getAudioCandidate = () => {
    const track = wallpaperTrack(this.snapshot);
    return track && this.originalLyrics?.alignment === 'unverified' ? { ...track, candidate: this.originalLyrics } : null;
  };
  private notify() { this.listeners.forEach(listener => listener()); }
  apply = (event: HostEvent) => {
    if (this.stopped) return;
    const before = this.snapshot;
    this.snapshot = applyWallpaperEvent(before, event, this.constants);
    const track = wallpaperTrack(this.snapshot);
    const key = track ? wallpaperTrackKey(track) : '';
    if (key !== this.lyricKey) {
      this.lyricKey = key;
      this.cancelJob();
      this.originalLyrics = null; this.audioRevision = -1;
      this.snapshot = { ...this.snapshot, source: { ...this.snapshot.source, lyrics: null }, lyricOrigin: '', lyricOffsetSec: 0, audioAlignmentStatus: 'off', lyricStatus: track ? 'loading' : 'idle' };
      if (track) this.timer = setTimeout(() => void this.loadLyrics(track, key), 500);
    }
    // Timeline anchors update outside React. Notify only for discrete changes / known duration.
    if (this.snapshot !== before && (!['timeline', 'browser-timeline'].includes(event.type) || before.timelineSeen !== this.snapshot.timelineSeen
      || before.timelineSource !== this.snapshot.timelineSource || before.source.playerState !== this.snapshot.source.playerState
      || before.source.clock.durationSec !== this.snapshot.source.clock.durationSec)) this.notify();
  };
  private cancelJob() {
    this.job?.abort(); this.job = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private async loadLyrics(track: WallpaperTrack, key: string) {
    this.timer = null;
    const job = new AbortController();
    this.job = job;
    this.snapshot = { ...this.snapshot, lyricStatus: 'loading' };
    this.notify();
    try {
      const result = await this.resolver(track, job.signal);
      if (this.stopped || job.signal.aborted || key !== this.lyricKey) return;
      this.installLyrics(result);
    } catch (error) {
      if (!this.stopped && !job.signal.aborted && key === this.lyricKey) {
        this.snapshot = { ...this.snapshot, lyricStatus: error instanceof FoliaLyricBridgeUnavailable ? 'bridgeOffline' : 'error' };
        this.notify();
        // Starting the companion later should recover without changing songs or reopening the wallpaper.
        if (error instanceof FoliaLyricBridgeUnavailable) this.timer = setTimeout(() => void this.loadLyrics(track, key), 15_000);
      }
    }
  }
  private installLyrics(result: WallpaperLyrics | null) {
    this.originalLyrics = result;
    const offset = result?.timelineOffsetSec ?? 0;
    const lyricOffsetSec = Number.isFinite(offset) && Math.abs(offset) <= 1800 ? offset : 0;
    const unaligned = result?.alignment === 'unverified';
    const lyrics = unaligned ? null : result && (lyricOffsetSec || result.timelineMap?.length) ? { ...result.lyrics, lines: result.lyrics.lines.map(line => {
      const offset = [...(result.timelineMap ?? [])].reverse().find(segment => segment.sourceStartSec <= line.startTime)?.offsetSec ?? lyricOffsetSec;
      return retimeLine(line, line.startTime + offset, line.endTime + offset);
    }) } : result?.lyrics ?? null;
    this.snapshot = { ...this.snapshot, source: { ...this.snapshot.source, lyrics }, lyricOffsetSec,
      lyricStatus: unaligned ? 'unaligned' : result ? result.lyrics.isWordByWord ? 'word' : 'line' : 'missing',
      lyricOrigin: result ? `${result.origin}${result.durationVerified || result.alignment === 'audio' || lyricOffsetSec ? '' : ' · duration-unverified'}` : '',
    };
    this.notify();
  }
  applyAudioAlignment(data: { key: string; origin: string; status: string; revision: number; timelineMap: { sourceStartSec: number; offsetSec: number }[] }) {
    if (this.stopped || data.key !== this.lyricKey || !this.originalLyrics || data.origin !== this.originalLyrics.origin) return;
    if (this.snapshot.audioAlignmentStatus !== data.status) { this.snapshot = { ...this.snapshot, audioAlignmentStatus: data.status }; this.notify(); }
    if (data.status !== 'aligned' || !Number.isInteger(data.revision) || data.revision <= this.audioRevision || !Array.isArray(data.timelineMap) || !data.timelineMap.length || data.timelineMap.length > 16
      || data.timelineMap.some((segment, i) => !Number.isFinite(segment.sourceStartSec) || segment.sourceStartSec < 0 || !Number.isFinite(segment.offsetSec)
        || Math.abs(segment.offsetSec) > 1800 || (i > 0 && segment.sourceStartSec <= data.timelineMap[i - 1].sourceStartSec))) return;
    this.audioRevision = data.revision;
    const original = this.originalLyrics;
    this.installLyrics({ ...original, alignment: 'audio', timelineMap: data.timelineMap, timelineOffsetSec: data.timelineMap[0].offsetSec });
    // Keep the unmodified provider data for the next correction instead of shifting an already shifted lyric.
    this.originalLyrics = original;
  }
  setDemo(result: WallpaperLyrics) { this.cancelJob(); this.installLyrics(result); }
  stop() { this.stopped = true; this.cancelJob(); this.listeners.clear(); }
}
