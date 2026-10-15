import type { LyricData, Theme } from '../types';
import type { IntegrationSnapshot } from './contracts';

// Read-only playback output. Accounts, playlists, media URLs and API keys never cross this boundary.
export interface SharedPlaybackSnapshot {
  app: 'FoliaMineradioPlayer'; schema: 1; capturedAt: number;
  playbackSource: 'direct' | 'external';
  song: { key: string; title: string; artist: string; album: string; cover: string | null; provider: string } | null;
  clock: { positionSec: number; lyricPositionSec: number; durationSec: number; playing: boolean };
  lyrics: LyricData | null; theme: Theme | null;
  sources: { music: string; lyrics: string; timeline: string;
    lyricsStatus: 'idle' | 'loading' | 'missing' | 'word' | 'line' | 'text' };
  audio: IntegrationSnapshot['audio'];
}
export const FOLIA_PLAYER_SOURCE_ID = 'folia-mineradio';
