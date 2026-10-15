import type { LyricData, Theme } from '../types';
import type { WebLyricSourceState } from '../types/webLyricSource';
import type { LyricTimeSegment } from './audioAlignment';
import type { SharedPlaybackSnapshot } from '../integration/wallpaperContracts';

// src/wallpaper/types.ts — contracts of the standalone Wallpaper Engine host.
export type HostEvent = { type: string; data: unknown; at: number };
export interface WallpaperHost {
  native: boolean;
  history: HostEvent[];
  settings: Record<string, unknown>;
  audio: number[];
  paused: boolean;
  subscribe(listener: (event: HostEvent) => void): () => void;
  emit(type: string, data: unknown): void;
}
export interface WallpaperTrack { title: string; artist: string; album: string; durationSec: number }
export type LyricStatus = 'idle' | 'loading' | 'word' | 'line' | 'text' | 'missing' | 'error' | 'bridgeOffline' | 'unaligned';
export interface WallpaperSnapshot {
  source: WebLyricSourceState;
  album: string;
  timelineSeen: boolean;
  timelineSource: 'none' | 'native' | 'browser' | 'system' | 'player';
  mediaSource: 'none' | 'native' | 'browser' | 'system' | 'player';
  playerTheme?: Theme | null;
  playerPositionSec?: number;
  playerSources?: SharedPlaybackSnapshot['sources'];
  companionUpdatedAtMs: number;
  audioActive: boolean;
  manualSource: boolean;
  browserUpdatedAtMs: number;
  playbackRate: number;
  suspended: boolean;
  lyricStatus: LyricStatus;
  lyricOrigin: string;
  lyricOffsetSec: number;
  audioAlignmentStatus: string;
  audioAlignmentMethod?: 'local' | 'gemini';
}
export interface WallpaperLyrics { lyrics: LyricData; origin: string; durationVerified: boolean; timelineOffsetSec?: number;
  alignment?: 'recording' | 'unverified' | 'audio'; timelineMap?: LyricTimeSegment[] }
declare global {
  interface Window {
    __foliaWallpaperHost: WallpaperHost;
    __foliaWallpaperDiagnostics?: Record<string, unknown>;
    wallpaperMediaIntegration?: Record<string, unknown> & { playback?: Record<string, number> };
  }
}
