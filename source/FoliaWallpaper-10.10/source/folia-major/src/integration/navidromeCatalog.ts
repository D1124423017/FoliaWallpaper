import { getNavidromeConfig, isNavidromeEnabled, navidromeApi } from '../services/navidromeService';
import { buildNavidromeQueue } from '../services/playbackAdapters';
import type { SongResult } from '../types';
import type { IntegrationCollection } from './contracts';

// Navidrome is a separate Subsonic source; reuse Folia's adapter without sending account configuration to the frame.
let collections: IntegrationCollection[] = [], sourceKey = '', serial = 0, updatedAt = 0;
const currentConfig = () => isNavidromeEnabled() ? getNavidromeConfig() : null;
const identity = (config: ReturnType<typeof currentConfig>) => config ? JSON.stringify([config.serverUrl, config.username]) : '';
export function navidromeCollectionSnapshot(): IntegrationCollection[] {
  if (identity(currentConfig()) !== sourceKey) { collections = []; sourceKey = ''; }
  return collections;
}
export async function refreshNavidromeCollections(): Promise<IntegrationCollection[]> {
  const config = currentConfig(), requestedSource = identity(config), request = ++serial;
  if (!config) { sourceKey = ''; collections = []; return []; }
  if (sourceKey === requestedSource && Date.now() - updatedAt < 30_000) return collections;
  const playlists = await navidromeApi.getPlaylists(config);
  if (request !== serial || identity(currentConfig()) !== requestedSource) return navidromeCollectionSnapshot();
  sourceKey = requestedSource;
  updatedAt = Date.now();
  // Authenticated cover URLs include Subsonic credentials; the shelf uses its native fallback artwork.
  collections = playlists.map(playlist => ({ key: `navidrome:playlist:${playlist.id}`, name: playlist.name, cover: '', count: playlist.songCount }));
  return collections;
}
export async function navidromeCollectionSongs(key: string): Promise<SongResult[]> {
  const config = currentConfig(), requestedSource = identity(config);
  if (!config || requestedSource !== sourceKey || !collections.some(item => item.key === key))
    throw new Error('Navidrome 歌單已失效，請重新載入或檢查來源設定');
  const playlist = await navidromeApi.getPlaylist(config, key.slice('navidrome:playlist:'.length));
  if (identity(currentConfig()) !== requestedSource || !playlist) throw new Error('Navidrome 歌單讀取失敗，請檢查來源連線');
  return buildNavidromeQueue((playlist.entry || []).map(song => navidromeApi.toNavidromeSong(config, song)));
}
