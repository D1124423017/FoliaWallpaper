import { NO_LYRIC_LINES } from '../utils/lyrics/noLyricLines';
import type { WallpaperSnapshot } from './types';

// src/wallpaper/lyricPresentation.ts — retain readable lyrics without treating unverified video timing as synchronized.
export function wallpaperLyricPresentation(snapshot: WallpaperSnapshot) {
  const lines = snapshot.source.lyrics?.lines ?? NO_LYRIC_LINES;
  if (!snapshot.source.track || snapshot.source.playerState === 'idle' || !lines.length) {
    return { mode: 'none' as const, timedLines: NO_LYRIC_LINES, previewLines: NO_LYRIC_LINES };
  }
  if (snapshot.timelineSeen && (snapshot.lyricStatus === 'word' || snapshot.lyricStatus === 'line')) {
    return { mode: 'timed' as const, timedLines: lines, previewLines: NO_LYRIC_LINES };
  }
  return { mode: 'preview' as const, timedLines: NO_LYRIC_LINES, previewLines: lines };
}
