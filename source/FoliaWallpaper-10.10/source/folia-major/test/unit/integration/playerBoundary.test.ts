import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerState, type LocalSong, type LyricData, type SongResult, type Theme } from '../../../src/types';
import type { IntegrationActions } from '../../../src/integration/contracts';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import { useAudioSettingsStore } from '../../../src/stores/useAudioSettingsStore';
import { useStatusMessageStore } from '../../../src/stores/useStatusMessageStore';
import { useAddToPlaylistStore } from '../../../src/stores/useAddToPlaylistStore';
import { audioBands, audioPower, currentTime, lyricCurrentTime } from '../../../src/stores/motionSignals';
import { dispatchIntegrationAction } from '../../../src/integration/dispatch';
import { integrationCollectionSongs, integrationSong, resolveIntegrationSong, searchIntegrationSongs } from '../../../src/integration/catalog';
import { integrationSnapshot } from '../../../src/integration/snapshot';
import { createQueueMutations } from '../../../src/components/app/player-panel/createQueueMutations';

// The original view owns presentation; identities, transport and persisted queue changes belong to Folia.
const mocks = vi.hoisted(() => ({
    host: null as IntegrationActions | null,
    localSongs: vi.fn(), localPlaylists: vi.fn(), search: vi.fn(), tracks: vi.fn(), summaries: vi.fn(), provider: vi.fn(), canAdd: vi.fn(), playlistsForSong: vi.fn(),
    refreshNavidrome: vi.fn(), navidromeSnapshot: vi.fn(), navidromeSongs: vi.fn(),
}));
vi.mock('../../../src/integration/hostActions', () => ({ getIntegrationActions: () => mocks.host! }));
vi.mock('../../../src/services/db', () => ({ getLocalSongs: mocks.localSongs }));
vi.mock('../../../src/services/localPlaylistService', () => ({ getLocalPlaylists: mocks.localPlaylists }));
vi.mock('../../../src/integration/navidromeCatalog', () => ({ refreshNavidromeCollections: mocks.refreshNavidrome,
    navidromeCollectionSnapshot: mocks.navidromeSnapshot, navidromeCollectionSongs: mocks.navidromeSongs }));
vi.mock('../../../src/services/onlineMusic/providerRegistry', () => ({ getOnlineMusicProvider: mocks.provider }));
vi.mock('../../../src/services/onlineMusic/omni', () => ({ omni: {
    searchSongs: mocks.search, getCollectionTracks: mocks.tracks, getProviderSummaries: mocks.summaries,
    canAddSongToPlaylist: mocks.canAdd, getPlaylistsForSong: mocks.playlistsForSong,
} }));

const song = (id: number, providerId = 'netease'): SongResult => ({
    id, name: `Song ${id}`, artists: [{ id: 1, name: 'Artist' }], album: { id: 1, name: 'Album', coverUrl: `https://example.com/${providerId}/${id}.jpg` },
    durationMs: 240_000, sourceRef: { kind: 'online', providerId, mediaId: String(id) },
});
const localSong = (id: string, title: string): LocalSong => ({
    id, title, titleOrigin: 'import', fileName: `${title}.mp3`, filePath: `C:/music/${title}.mp3`, fileSize: 10,
    duration: 200_000, mimeType: 'audio/mpeg', addedAt: 0,
    importedMetadata: { title, artistNames: ['Local artist'], albumName: 'Local album' },
    localCoverAssetId: `sha256:${'a'.repeat(64)}`,
} as LocalSong);
const page = (items: SongResult[], hasMore = false, nextOffset = items.length) => ({ items, hasMore, nextOffset });
const collection = (providerId: string, id: string) => ({ providerId, id, type: 'playlist', name: 'Playlist', trackCount: 2, coverUrl: '' });
const account = (providerId: string, id: string) => ({ providerId, displayName: providerId, status: 'authenticated',
    user: { nickname: `Listener ${providerId}`, token: 'private-account-token' }, collections: [collection(providerId, id)], credentials: 'private-credentials' });
const theme: Theme = { name: 'Cover', primaryColor: '#fff', secondaryColor: '#aaa', accentColor: '#fc0', backgroundColor: '#000', fontStyle: 'sans', animationIntensity: 'normal' };
const presentation = { showLyrics: true, showControls: true, showShelf: true, showBackground: true };

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('window', { electron: { hasLocalCoverAsset: vi.fn() } });
    mocks.host = {
        play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), seek: vi.fn(), next: vi.fn(), previous: vi.fn(),
        playSong: vi.fn(), enqueue: vi.fn(), enqueueNext: vi.fn(), moveQueue: vi.fn(), navigateToPlayer: vi.fn(), navigateToHome: vi.fn(), openAccounts: vi.fn(),
        shuffleQueue: vi.fn(), toggleLike: vi.fn(), toggleSongLike: vi.fn(), isSongLiked: vi.fn(() => false), isLiked: false, controlsDisabled: false, clearQueue: vi.fn(), removeQueue: vi.fn(),
    };
    mocks.localSongs.mockResolvedValue([]); mocks.localPlaylists.mockResolvedValue([]);
    mocks.refreshNavidrome.mockResolvedValue([]); mocks.navidromeSnapshot.mockReturnValue([]);
    mocks.search.mockResolvedValue(page([])); mocks.tracks.mockResolvedValue(page([])); mocks.summaries.mockReturnValue([]);
    mocks.provider.mockReturnValue(null);
    mocks.canAdd.mockReturnValue(true); mocks.playlistsForSong.mockReturnValue([collection('netease', 'writable')]);
    useAddToPlaylistStore.getState().close();
    usePlaybackStore.setState({ currentSong: null, audioSrc: null, playQueue: [], lyrics: null, cachedCoverUrl: null,
        transitionDisplay: null, activePlaybackContext: 'main', playerState: PlayerState.IDLE, duration: 0 });
    useAudioSettingsStore.setState({ volume: 1, isMuted: false, loopMode: 'off' });
    useStatusMessageStore.setState({ message: null });
    currentTime.set(0); lyricCurrentTime.set(0); audioPower.set(0);
    audioBands.bass.set(0); audioBands.mid.set(0); audioBands.treble.set(0);
});

describe('source-qualified catalog and original view actions', () => {
    it('collects the selected search result without replacing the audible song or shared queue', async () => {
        const audible = song(901), selected = song(902);
        usePlaybackStore.setState({ currentSong: audible, playQueue: [audible] });
        await dispatchIntegrationAction('collectSong', [integrationSong(selected).key]);
        expect(useAddToPlaylistStore.getState()).toMatchObject({ isOpen: true, targetSong: selected });
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: audible, playQueue: [audible] });
        expect(mocks.host!.playSong).not.toHaveBeenCalled();
        useAddToPlaylistStore.getState().close();
        useAddToPlaylistStore.getState().open();
        expect(useAddToPlaylistStore.getState().targetSong).toBeNull();
    });

    it('reports unavailable online mutations and delegates account opening to the shared host', async () => {
        mocks.canAdd.mockReturnValue(false);
        await expect(dispatchIntegrationAction('collectSong', [integrationSong(song(903)).key])).rejects.toThrow('登入帳號');
        expect(useAddToPlaylistStore.getState().isOpen).toBe(false);
        await dispatchIntegrationAction('openAccounts', []);
        expect(mocks.host!.openAccounts).toHaveBeenCalledOnce();
    });
    it('keeps providers with identical media IDs distinct through search and host playback', async () => {
        const netease = song(42), qq = song(42, 'qq');
        mocks.search.mockResolvedValue(page([netease, qq]));
        const results = await dispatchIntegrationAction('search', ['song']) as { key: string }[];
        expect(results.map(item => item.key)).toEqual(['online:netease:42', 'online:qq:42']);
        await dispatchIntegrationAction('playSong', [results[1]!.key]);
        expect(mocks.host!.playSong).toHaveBeenCalledWith(qq);
        expect(resolveIntegrationSong(results[0]!.key)).toBe(netease);
        expect(() => resolveIntegrationSong('42')).toThrow('歌曲已失效');
    });

    it('uses provider canonical metadata instead of leaking raw provider fields', () => {
        mocks.provider.mockReturnValue({ songMetadata: { getSongMetadata: () => ({ artists: [{ id: 9, name: 'Canonical artist' }],
            album: { id: 8, name: 'Canonical album' }, coverUrl: 'https://example.com/canonical.jpg', durationMs: 123_456 }) } });
        expect(integrationSong(song(72, 'qq'))).toMatchObject({ artist: 'Canonical artist', duration: 123.456, picurl: 'https://example.com/canonical.jpg' });
    });

    it('places a searched song at the head of the shared queue while retaining other tracks', async () => {
        const old = song(56), selected = song(57);
        usePlaybackStore.setState({ currentSong: old, playQueue: [old, selected] });
        await dispatchIntegrationAction('playSong', [integrationSong(selected).key, 'search']);
        expect(mocks.host!.playSong).toHaveBeenCalledWith(selected, [selected, old]);
    });

    it('shows a failed online source while returning playable local results and their original artwork', async () => {
        mocks.localSongs.mockResolvedValue([localSong('boundary-local', 'Local test song')]);
        mocks.search.mockRejectedValue(new Error('network failed'));
        const results = await searchIntegrationSongs('test');
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ key: 'local:boundary-local', source: 'local' });
        expect(results[0]!.picurl).toContain('folia-cover://asset/sha256');
        expect(useStatusMessageStore.getState().message).toMatchObject({ type: 'error', text: expect.stringContaining('線上音樂搜尋失敗') });
        await dispatchIntegrationAction('playSong', [results[0]!.key]);
        expect(mocks.host!.playSong).toHaveBeenCalledWith(expect.objectContaining({ localRef: { songId: 'boundary-local' } }));
    });

    it('rejects failed search with no matching local fallback rather than reporting an empty success', async () => {
        const failure = new Error('provider unavailable');
        mocks.search.mockRejectedValue(failure);
        await expect(dispatchIntegrationAction('search', ['missing'])).rejects.toBe(failure);
    });

    it('loads every provider-qualified collection page and delegates whole-queue playback to the host', async () => {
        const first = song(81, 'qq'), second = song(82, 'qq');
        mocks.summaries.mockReturnValue([account('netease', 'shared'), account('qq', 'shared')]);
        mocks.tracks.mockResolvedValueOnce(page([first], true, 100)).mockResolvedValueOnce(page([second], false, 101));
        await dispatchIntegrationAction('playCollection', ['online:qq:playlist:shared', integrationSong(second).key]);
        expect(mocks.tracks).toHaveBeenNthCalledWith(1, collection('qq', 'shared'), { limit: 100, offset: 0 });
        expect(mocks.tracks).toHaveBeenNthCalledWith(2, collection('qq', 'shared'), { limit: 100, offset: 100 });
        expect(mocks.host!.playSong).toHaveBeenCalledWith(second, [first, second]);
        expect(usePlaybackStore.getState().playQueue).toEqual([]);
    });

    it('refuses a stale start-song reference and broken pagination without silently playing a different song', async () => {
        mocks.summaries.mockReturnValue([account('qq', 'boundary-stale')]);
        mocks.tracks.mockResolvedValue(page([song(90, 'qq')]));
        await expect(dispatchIntegrationAction('playCollection', ['online:qq:playlist:boundary-stale', 'online:netease:90'])).rejects.toThrow('指定歌曲');
        expect(mocks.host!.playSong).not.toHaveBeenCalled();
        mocks.tracks.mockResolvedValue(page([song(90, 'qq')], true, 0));
        await expect(integrationCollectionSongs('online:qq:playlist:boundary-stale')).rejects.toThrow('下一頁');
    });

    it('drops removed account collections instead of retaining an authenticated stale reference', async () => {
        mocks.summaries.mockReturnValue([account('qq', 'boundary-removed')]);
        await dispatchIntegrationAction('collections', []);
        mocks.summaries.mockReturnValue([]);
        await expect(integrationCollectionSongs('online:qq:playlist:boundary-removed')).rejects.toThrow('歌單已失效');
        expect(mocks.tracks).not.toHaveBeenCalled();
    });

    it('keeps local and online collections usable when a separate Navidrome server is unavailable', async () => {
        mocks.localPlaylists.mockResolvedValue([{ id: 'available-local', name: 'Local playlist', songIds: ['one'] }]);
        mocks.summaries.mockReturnValue([account('netease', 'available-online')]);
        mocks.refreshNavidrome.mockRejectedValue(new Error('Navidrome offline'));
        const collections = await dispatchIntegrationAction('collections', []) as { key: string }[];
        expect(collections.map(item => item.key)).toEqual(['online:netease:playlist:available-online', 'local:playlist:available-local']);
        expect(useStatusMessageStore.getState().message).toMatchObject({ type: 'error', text: expect.stringContaining('Navidrome') });
        await expect(dispatchIntegrationAction('like', [integrationSong(song(190)).key])).resolves.toMatchObject({ ok: true });
        expect(mocks.host!.toggleSongLike).toHaveBeenCalledWith(expect.objectContaining({ id: 190 }));
    });
});

describe('transport boundary guards', () => {
    it('clamps seeks against the audible outgoing track during an automix transition', async () => {
        const held = song(101), arriving = song(102);
        usePlaybackStore.setState({ currentSong: arriving, duration: 420, transitionDisplay: { song: held, lyrics: null, coverUrl: null, duration: 180 } });
        await dispatchIntegrationAction('seek', [500]); await dispatchIntegrationAction('seek', [-4]);
        expect(mocks.host!.seek).toHaveBeenNthCalledWith(1, 180);
        expect(mocks.host!.seek).toHaveBeenNthCalledWith(2, 0);
        for (const value of [Infinity, NaN, 'invalid']) await expect(dispatchIntegrationAction('seek', [value])).rejects.toThrow('無效的播放時間');
        expect(mocks.host!.seek).toHaveBeenCalledTimes(2);
    });

    it('uses the persisted audio owner for bounded volume and explicit unmute', async () => {
        useAudioSettingsStore.setState({ isMuted: true, volume: 0.2 });
        await dispatchIntegrationAction('volume', [2]);
        expect(useAudioSettingsStore.getState()).toMatchObject({ volume: 1, isMuted: false });
        expect(localStorage.setItem).toHaveBeenCalledWith('player_volume', '1');
        await dispatchIntegrationAction('volume', [-1]);
        expect(useAudioSettingsStore.getState().volume).toBe(0);
        const before = useAudioSettingsStore.getState();
        await expect(dispatchIntegrationAction('volume', [Infinity])).rejects.toThrow('無效的音量');
        expect(useAudioSettingsStore.getState()).toBe(before);
    });

    it('allows first song selection while transport is disabled but rejects unsupported current transport', async () => {
        mocks.host!.controlsDisabled = true;
        const first = song(110);
        await dispatchIntegrationAction('playSong', [integrationSong(first).key]);
        expect(mocks.host!.playSong).toHaveBeenCalledWith(first);
        mocks.summaries.mockReturnValue([account('netease', 'boundary-first')]); mocks.tracks.mockResolvedValue(page([first]));
        await dispatchIntegrationAction('playCollection', ['online:netease:playlist:boundary-first']);
        expect(mocks.host!.playSong).toHaveBeenCalledWith(first, [first]);
        for (const action of ['play', 'pause', 'toggle', 'seek', 'next', 'previous'])
            await expect(dispatchIntegrationAction(action, [0])).rejects.toThrow('目前播放來源');
        expect(mocks.host!.play).not.toHaveBeenCalled(); expect(mocks.host!.toggleLike).not.toHaveBeenCalled();
    });

    it('queues through host persistence callbacks and forbids editing a followed external queue', async () => {
        const first = song(121), second = song(122), third = song(123);
        usePlaybackStore.setState({ currentSong: first, playQueue: [first, second, third] });
        const thirdKey = integrationSong(third).key;
        await dispatchIntegrationAction('queueSong', [thirdKey, { next: true }]);
        await dispatchIntegrationAction('moveQueue', [2, 1]);
        expect(mocks.host!.enqueueNext).toHaveBeenCalledWith(third);
        expect(mocks.host!.moveQueue).toHaveBeenCalledWith(2, 1);
        expect(usePlaybackStore.getState().playQueue).toEqual([first, second, third]);
        usePlaybackStore.setState({ activePlaybackContext: 'stage' });
        for (const action of ['queueSong', 'shuffle', 'clearQueue', 'removeQueue', 'moveQueue', 'playMode'])
            await expect(dispatchIntegrationAction(action, [thirdKey])).rejects.toThrow('外部播放器的佇列');
        await dispatchIntegrationAction('playSong', [thirdKey]);
        expect(mocks.host!.playSong).toHaveBeenCalledWith(third);
    });

    it('rejects invalid queue indices, wrong-song favorites and unknown frame actions without mutating the core', async () => {
        const first = song(131); usePlaybackStore.setState({ currentSong: first, playQueue: [first] });
        const before = usePlaybackStore.getState();
        for (const args of [[-1, 0], [0, 1], [0.1, 0], [0, Infinity]])
            await expect(dispatchIntegrationAction('moveQueue', args)).rejects.toThrow('無效的佇列位置');
        await expect(dispatchIntegrationAction('like', ['online:qq:131'])).rejects.toThrow('歌曲已失效');
        await expect(dispatchIntegrationAction('openArbitraryUrl', ['https://invalid.example'])).rejects.toThrow('不支援');
        expect(usePlaybackStore.getState()).toBe(before); expect(mocks.host!.toggleLike).not.toHaveBeenCalled();
    });

    it('preserves raw playback state when an adapter action fails', async () => {
        const first = song(141); usePlaybackStore.setState({ currentSong: first, playQueue: [first], audioSrc: 'blob:active', playerState: PlayerState.PLAYING });
        const before = usePlaybackStore.getState();
        vi.mocked(mocks.host!.playSong).mockRejectedValue(new Error('provider playback failed'));
        await expect(dispatchIntegrationAction('playSong', [integrationSong(song(142)).key])).rejects.toThrow('provider playback failed');
        expect(usePlaybackStore.getState()).toBe(before);
    });

    it('favorites a selected catalog row without replacing the current playback', async () => {
        const current = song(170), selected = song(171, 'qq');
        usePlaybackStore.setState({ currentSong: current, playQueue: [current], audioSrc: 'blob:active' });
        const before = usePlaybackStore.getState();
        await dispatchIntegrationAction('like', [integrationSong(selected).key]);
        expect(mocks.host!.toggleSongLike).toHaveBeenCalledWith(selected);
        expect(usePlaybackStore.getState()).toBe(before);
    });

    it('maps original Mineradio repeat-mode names into the shared persistent loop setting', async () => {
        await dispatchIntegrationAction('playMode', ['single']); expect(useAudioSettingsStore.getState().loopMode).toBe('one');
        await dispatchIntegrationAction('playMode', ['loop']); expect(useAudioSettingsStore.getState().loopMode).toBe('all');
        await dispatchIntegrationAction('playMode', ['order']); expect(useAudioSettingsStore.getState().loopMode).toBe('off');
        expect(localStorage.setItem).toHaveBeenCalledWith('player_loop_mode', 'one');
    });
});

describe('original display snapshot', () => {
    it('keeps the audible song, cover, word clock and lyric data together during transition and excludes account secrets', () => {
        const outgoing = song(151, 'qq'), incoming = song(151, 'netease');
        const lyrics: LyricData = { lines: [{ startTime: 90, endTime: 92, fullText: 'word', translation: '字', words: [{ startTime: 90, endTime: 92, text: 'word' }] }] };
        usePlaybackStore.setState({ currentSong: incoming, playerState: PlayerState.IDLE, duration: 400,
            transitionDisplay: { song: outgoing, lyrics, coverUrl: 'https://example.com/held-cover.jpg', duration: 180 } });
        mocks.summaries.mockReturnValue([account('qq', 'favorites')]);
        currentTime.set(90.75); lyricCurrentTime.set(90.5); audioPower.set(127.5);
        audioBands.bass.set(255); audioBands.mid.set(-2); audioBands.treble.set(NaN);
        const snapshot = integrationSnapshot(theme, presentation);
        expect(snapshot).toMatchObject({ song: { key: 'online:qq:151', picurl: 'https://example.com/held-cover.jpg' },
            position: 90.75, lyricPosition: 90.5, duration: 180, playing: true,
            audio: { power: 0.5, bass: 1, mid: 0, treble: 0 }, accounts: [{ providerId: 'qq', name: 'Listener qq', connected: true }] });
        expect(snapshot.lyrics).toEqual([{ time: 90, endTime: 92, text: 'word', translation: '字', words: [{ time: 90, endTime: 92, text: 'word' }] }]);
        expect(JSON.stringify(snapshot)).not.toContain('private-');
    });
});

describe('queue mutation persistence from an older render', () => {
    it('inserts next relative to the latest song and persists the updated core queue without restarting audio', () => {
        const stale = song(161), latest = song(162), next = song(163), tail = song(164);
        const persist = vi.fn().mockResolvedValue(undefined);
        const mutations = createQueueMutations({ currentSong: stale, playQueue: [stale], persistLastPlaybackCache: persist, t: key => key, queueAddBehavior: 'append' });
        usePlaybackStore.setState({ currentSong: latest, playQueue: [latest, tail], audioSrc: 'blob:existing', playerState: PlayerState.PLAYING });
        mutations.enqueueSongNext(next);
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: latest, playQueue: [latest, next, tail], audioSrc: 'blob:existing', playerState: PlayerState.PLAYING });
        expect(persist).toHaveBeenCalledWith(latest, [latest, next, tail]);
        mutations.enqueueSongNext(tail);
        expect(usePlaybackStore.getState().playQueue).toEqual([latest, tail, next]);
        expect(persist).toHaveBeenLastCalledWith(latest, [latest, tail, next]);
        mutations.enqueueSongNext(latest);
        expect(persist).toHaveBeenCalledTimes(2);
    });

    it('moves only valid live queue positions and persists against the current song', () => {
        const stale = song(171), current = song(172), first = song(173), second = song(174);
        const persist = vi.fn().mockResolvedValue(undefined);
        const mutations = createQueueMutations({ currentSong: stale, playQueue: [stale], persistLastPlaybackCache: persist, t: key => key, queueAddBehavior: 'append' });
        usePlaybackStore.setState({ currentSong: current, playQueue: [current, first, second] });
        mutations.moveQueueSong(2, 1);
        expect(usePlaybackStore.getState().playQueue).toEqual([current, second, first]);
        expect(persist).toHaveBeenCalledWith(current, [current, second, first]);
        for (const [from, to] of [[-1, 0], [0, 4], [0.5, 1], [0, 0]]) mutations.moveQueueSong(from!, to!);
        expect(persist).toHaveBeenCalledTimes(1);
    });
});
