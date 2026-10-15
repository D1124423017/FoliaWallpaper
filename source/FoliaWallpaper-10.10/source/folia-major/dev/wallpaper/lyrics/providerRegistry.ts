import ncm from '@neteasecloudmusicapienhanced/api';
import type { SongResult } from '../../../src/types';
import type { OnlineProviderId } from '../../../src/types/onlineMusic';
import { processNeteaseLyrics } from '../../../src/utils/lyrics/neteaseProcessing';
import { searchKugouLyrics, fetchKugouLyrics } from '../../../src/utils/lyrics/providers/kugouLyricProvider';
import { nativeLyricTransport, throwIfLyricRequestAborted } from './transport';

// dev/wallpaper/lyrics/providerRegistry.ts — Node host adapters for Folia's unchanged cross-provider matcher.
// This registry is substituted only in the isolated SSR build. The player registry / accounts are never loaded.
const anonymous = { cookie: 'os=pc;', randomCNIP: false, timeout: 3500 };
function normalizeSong(song: any): SongResult {
  return { id: song.id, name: song.name, artists: song.ar ?? song.artists ?? [],
    album: song.al ?? song.album ?? { id: 0, name: '' }, durationMs: song.dt ?? song.duration ?? 0,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: String(song.id) } };
}
const netease = {
  search: { async searchSongs(query: string, limit: number, offset: number) {
    throwIfLyricRequestAborted();
    const response = await ncm.cloudsearch({ ...anonymous, keywords: query, limit, offset, type: 1 });
    throwIfLyricRequestAborted();
    if (response.body.code !== 200) throw new Error(`NetEase search ${response.body.code}`);
    const result = response.body.result as { songs?: unknown[] } | undefined;
    return { items: (result?.songs ?? []).map(normalizeSong), hasMore: false, nextOffset: 0 };
  } },
  lyrics: { async getLyrics(song: SongResult) {
    throwIfLyricRequestAborted();
    const response = await ncm.lyric_new({ ...anonymous, id: song.id });
    throwIfLyricRequestAborted();
    if (response.body.code !== 200) throw new Error(`NetEase lyrics ${response.body.code}`);
    return processNeteaseLyrics({ ...response.body, type: 'netease' });
  }, getChorusRanges: async () => [] },
};
const kugou = {
  search: { async searchSongs(query: string, limit: number, offset: number) {
    const items = await searchKugouLyrics(query, Math.floor(offset / limit) + 1, limit, nativeLyricTransport);
    // The public lyric adapter still returns the legacy `duration` field in milliseconds.
    const normalized = items.map(song => ({ ...song, durationMs: Number.isFinite(song.durationMs) ? song.durationMs
      : Number((song as SongResult & { duration?: number }).duration) || 0 }));
    return { items: normalized, hasMore: false, nextOffset: 0 };
  } },
  lyrics: { async getLyrics(song: SongResult) {
    const lyrics = await fetchKugouLyrics(song, { transport: nativeLyricTransport });
    return { lyrics, isPureMusic: false };
  }, getChorusRanges: async () => [] },
};
export const getOnlineMusicProvider = (id: OnlineProviderId) => id === 'netease' ? netease : id === 'kugou' ? kugou : null;
