import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavidromeConfig, SubsonicSong } from '../../../src/types/navidrome';
import { refreshNavidromeCollections, navidromeCollectionSnapshot, navidromeCollectionSongs } from '../../../src/integration/navidromeCatalog';
import { getPlaybackSongKey, resolveNavidromePlaybackCarrier } from '../../../src/utils/appPlaybackGuards';

// Source changes must invalidate authenticated collection references, while playback retains Folia's Navidrome carrier.
const mocks = vi.hoisted(() => ({ config: null as NavidromeConfig | null, enabled: false, playlists: vi.fn(), playlist: vi.fn() }));
vi.mock('../../../src/services/navidromeService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/navidromeService')>();
  return { ...actual, getNavidromeConfig: () => mocks.config, isNavidromeEnabled: () => mocks.enabled,
    navidromeApi: { ...actual.navidromeApi, getPlaylists: mocks.playlists, getPlaylist: mocks.playlist } };
});
let sequence = 0;
beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true;
  mocks.config = { serverUrl: `https://music${++sequence}.example`, username: 'qa', passwordHash: 'not-real-credentials' };
  mocks.playlists.mockResolvedValue([{ id: 'one', name: 'Navidrome playlist', songCount: 1, coverArt: 'cover' }]);
});
describe('Navidrome integrated collections', () => {
  it('loads a source-qualified playlist with original Navidrome playback metadata and excludes cover credentials', async () => {
    const collections = await refreshNavidromeCollections();
    expect(collections).toEqual([{ key: 'navidrome:playlist:one', name: 'Navidrome playlist', cover: '', count: 1 }]);
    mocks.playlist.mockResolvedValue({ id: 'one', entry: [{ id: 'track-123', title: 'Song', artist: 'Artist', album: 'Album', duration: 240, albumId: 'album', artistId: 'artist' } as SubsonicSong] });
    const tracks = await navidromeCollectionSongs(collections[0]!.key);
    expect(tracks[0]).toMatchObject({ name: 'Song', isNavidrome: true });
    expect(getPlaybackSongKey(tracks[0]!)).toBe('navidrome:track-123');
    expect(resolveNavidromePlaybackCarrier(tracks[0])!.navidromeData.id).toBe('track-123');
    expect(JSON.stringify(collections)).not.toContain('not-real-credentials');
  });
  it('invalidates a pending response and old playlist references when the server changes', async () => {
    let finish!: (items: object[]) => void;
    mocks.playlists.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = refreshNavidromeCollections();
    mocks.config = { ...mocks.config!, serverUrl: 'https://different.example' };
    finish([{ id: 'stale', name: 'Old server', songCount: 1 }]); await pending;
    expect(navidromeCollectionSnapshot()).toEqual([]);
    await expect(navidromeCollectionSongs('navidrome:playlist:stale')).rejects.toThrow('已失效');
    mocks.enabled = false; expect(await refreshNavidromeCollections()).toEqual([]);
  });
});
