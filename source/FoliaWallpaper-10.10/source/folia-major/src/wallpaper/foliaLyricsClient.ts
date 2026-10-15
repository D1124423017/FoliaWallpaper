import type { WallpaperLyrics, WallpaperTrack } from './types';

// src/wallpaper/foliaLyricsClient.ts — request Folia's cross-provider matcher over the fixed loopback bridge.
export class FoliaLyricBridgeUnavailable extends Error {}
export async function fetchFoliaWallpaperLyrics(track: WallpaperTrack, signal: AbortSignal): Promise<WallpaperLyrics | null> {
  try {
    const response = await fetch('http://127.0.0.1:3189/lyrics', { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(track),
      signal: AbortSignal.any([signal, AbortSignal.timeout(46_000)]) });
    if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
    const body = await response.json();
    if (body.app !== 'FoliaWallpaperLyrics' || body.schema !== 1) throw new Error('Unexpected bridge');
    if (body.match !== null && (!Array.isArray(body.match?.lyrics?.lines) || typeof body.match.origin !== 'string')) throw new Error('Invalid lyric response');
    return body.match;
  } catch (error) {
    if (signal.aborted) throw error;
    throw new FoliaLyricBridgeUnavailable('Folia wallpaper lyrics bridge unavailable');
  }
}
