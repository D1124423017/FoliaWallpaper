import type { SongResult } from '../types';
import type { OmniCollection } from '../types/onlineMusic';
import { omni } from '../services/onlineMusic/omni';
import { getLocalSongs } from '../services/db';
import { getLocalPlaylists } from '../services/localPlaylistService';
import { buildLocalQueue } from '../services/playbackAdapters';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { getSongArtistLabel, getSongCoverUrl, getSongDurationMs } from '../services/onlineMusic/songMetadata';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import type { IntegrationCollection, IntegrationSong } from './contracts';
import { getIntegrationActions } from './hostActions';
import { navidromeCollectionSnapshot, navidromeCollectionSongs, refreshNavidromeCollections } from './navidromeCatalog';
import { publicIntegrationCover } from './publicMetadata';

// Preserve provider-qualified identity across search, the original 3D shelf, and the queue.
const songsByKey = new Map<string, SongResult>();
const collectionsByKey = new Map<string, OmniCollection | { localPlaylistId: string }>();
let localCollections: IntegrationCollection[] = [];
export function integrationSong(song: SongResult): IntegrationSong {
  const key = getPlaybackSongKey(song), ref = getPlaybackSourceRef(song);
  songsByKey.set(key, song);
  // Results are session references, not an unbounded second music database.
  if (songsByKey.size > 3000) songsByKey.delete(songsByKey.keys().next().value!);
  const duration = getSongDurationMs(song) / 1000;
  return { key, id: song.id, name: song.name, artist: getSongArtistLabel(song),
    picurl: publicIntegrationCover(getSongCoverUrl(song)), duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    source: ref.kind === 'online' ? ref.providerId : ref.kind, liked: getIntegrationActions().isSongLiked(song) };
}
export function resolveIntegrationSong(key: unknown): SongResult {
  const state = usePlaybackStore.getState();
  const song = typeof key === 'string' ? songsByKey.get(key)
    || state.playQueue.find(item => getPlaybackSongKey(item) === key)
    || (state.currentSong && getPlaybackSongKey(state.currentSong) === key ? state.currentSong : undefined) : undefined;
  if (!song) throw new Error('歌曲已失效，請重新搜尋或開啟歌單');
  return song;
}
export async function searchIntegrationSongs(query: string) {
  const text = query.trim().slice(0, 200);
  if (!text) return [];
  const [localResult, onlineResult] = await Promise.allSettled([
    getLocalSongs().then(songs => buildLocalQueue(songs).filter(song =>
      `${song.name} ${getSongArtistLabel(song)}`.toLocaleLowerCase().includes(text.toLocaleLowerCase()))),
    omni.searchSongs(text, { limit: 40, offset: 0 }),
  ]);
  const local = localResult.status === 'fulfilled' ? localResult.value.slice(0, 40) : [];
  const online = onlineResult.status === 'fulfilled' ? onlineResult.value.items : [];
  if (onlineResult.status === 'rejected' || localResult.status === 'rejected') {
    if (!local.length && !online.length) throw onlineResult.status === 'rejected' ? onlineResult.reason
      : localResult.status === 'rejected' ? localResult.reason : new Error('搜尋失敗');
    setStatusMessage({ type: 'error', text: onlineResult.status === 'rejected'
      ? '線上音樂搜尋失敗，目前僅顯示本機結果。請檢查來源連線或帳號。'
      : '本機音樂庫讀取失敗，目前僅顯示線上結果。', nonce: Date.now(), durationMs: 6500 });
  }
  return [...local, ...online].map(integrationSong);
}
export function onlineIntegrationCollections(): IntegrationCollection[] {
  for (const key of collectionsByKey.keys()) if (key.startsWith('online:')) collectionsByKey.delete(key);
  return omni.getProviderSummaries().flatMap(account => account.collections.map(collection => {
    const key = `online:${collection.providerId}:${collection.type}:${collection.id}`;
    collectionsByKey.set(key, collection);
    return { key, name: collection.name, cover: publicIntegrationCover(collection.coverUrl), count: collection.trackCount || 0 };
  }));
}
export async function integrationCollections(): Promise<IntegrationCollection[]> {
  // A separate server outage must not discard Folia's usable local and online collections.
  const [local] = await Promise.all([getLocalPlaylists(), refreshNavidromeCollections().catch(() => {
    setStatusMessage({ type: 'error', text: 'Navidrome 歌單讀取失敗；本機與其他音樂來源的歌單仍可使用。請檢查伺服器連線。',
      nonce: Date.now(), durationMs: 6500 });
  })]);
  for (const key of collectionsByKey.keys()) if (key.startsWith('local:')) collectionsByKey.delete(key);
  localCollections = local.map(playlist => {
    const key = `local:playlist:${playlist.id}`;
    collectionsByKey.set(key, { localPlaylistId: playlist.id });
    return { key, name: playlist.isFavorite ? '本機收藏' : playlist.name, cover: '', count: playlist.songIds.length };
  });
  return integrationCollectionSnapshot();
}
export const integrationCollectionSnapshot = (): IntegrationCollection[] => [...onlineIntegrationCollections(), ...localCollections, ...navidromeCollectionSnapshot()];
export async function integrationCollectionSongs(key: string): Promise<SongResult[]> {
  await integrationCollections();
  if (key.startsWith('navidrome:playlist:')) return navidromeCollectionSongs(key);
  const collection = collectionsByKey.get(key);
  if (!collection) throw new Error('歌單已失效，請重新載入');
  if ('localPlaylistId' in collection) {
    const playlist = (await getLocalPlaylists()).find(item => item.id === collection.localPlaylistId);
    const local = new Map((await getLocalSongs()).map(song => [song.id, song]));
    if (!playlist) throw new Error('歌單已失效，請重新載入');
    return buildLocalQueue(playlist.songIds.flatMap(id => {
      const song = local.get(id); return song ? [song] : [];
    }));
  }
  const results: SongResult[] = [];
  let offset = 0;
  for (let page = 0; page < 100; page++) {
    const result = await omni.getCollectionTracks(collection, { limit: 100, offset });
    results.push(...result.items);
    if (!result.hasMore) return results;
    if (!Number.isInteger(result.nextOffset) || result.nextOffset <= offset)
      throw new Error('歌單來源未回傳有效的下一頁，請稍後再試');
    offset = result.nextOffset;
  }
  throw new Error('歌單超過一次可載入的大小，請拆分歌單後再試');
}
