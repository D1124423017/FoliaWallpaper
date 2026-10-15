import type { SongResult } from '../types';

// Versioned JSON boundary shared by the original Mineradio view and the Folia player.
export interface IntegrationSong {
  key: string; id: string | number; name: string; artist: string; picurl: string;
  source: string; duration: number; liked: boolean;
}
export interface IntegrationCollection { key: string; name: string; cover: string; count: number; }
export interface IntegrationSnapshot {
  song: IntegrationSong | null; queue: IntegrationSong[];
  position: number; lyricPosition: number; duration: number; playing: boolean; volume: number;
  liked: boolean; loopMode: 'off' | 'one' | 'all'; shuffleEnabled: boolean; controlsDisabled: boolean; playbackSource: 'direct' | 'external';
  lyrics: { time: number; endTime: number; text: string; translation?: string;
    words: { time: number; endTime: number; text: string }[] }[];
  theme: { primary: string; secondary: string; accent: string; background: string };
  audio: { power: number; bass: number; lowMid: number; mid: number; vocal: number; treble: number;
    frequency: number[]; timeDomain: number[]; sampleRate: number };
  collections: IntegrationCollection[];
  accounts: { providerId: string; name: string; connected: boolean }[];
  presentation: { showLyrics: boolean; showControls: boolean; showShelf: boolean; showBackground: boolean };
  suspended: boolean;
}
export interface IntegrationActions {
  play: () => void; pause: () => void; toggle: () => void; seek: (seconds: number) => void;
  next: () => void; previous: () => void;
  playSong: (song: SongResult, queue?: SongResult[]) => void | Promise<void>;
  enqueue: (song: SongResult) => void;
  enqueueNext: (song: SongResult) => void;
  moveQueue: (from: number, to: number) => void;
  navigateToPlayer: () => void; navigateToHome: () => void;
  openAccounts: () => void;
  shuffleQueue: () => void; toggleLike: () => void | Promise<void>;
  toggleSongLike: (song: SongResult) => void | Promise<void>;
  isSongLiked: (song: SongResult) => boolean;
  isLiked: boolean; controlsDisabled: boolean;
  clearQueue: () => void; removeQueue: (index: number) => void;
}
