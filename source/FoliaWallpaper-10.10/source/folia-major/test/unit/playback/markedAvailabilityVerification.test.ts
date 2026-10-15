import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerState, type LocalSong, type SongResult } from '@/types';
import { buildNavidromeQueue } from '@/services/playbackAdapters';
import type { NavidromeSong } from '@/types/navidrome';

// Exercise the real queue hook: advisory search flags must not replace actual source/refusal/cancellation policy.
const mocks = vi.hoisted(() => ({
    source: vi.fn(), replacement: vi.fn(), configured: vi.fn(), canPlay: vi.fn(), beforeHook: vi.fn(), beforePlay: vi.fn(),
    lyricsState: vi.fn(), lyrics: vi.fn(), replacementDialog: vi.fn(), cover: vi.fn(), persist: vi.fn(), nearby: vi.fn(),
}));
vi.mock('react', () => ({ useCallback: (callback: unknown) => callback, useMemo: (factory: () => unknown) => factory(),
    useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, mocks.replacementDialog], useEffect: vi.fn() }));
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: vi.fn() }, useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/stores/usePlaybackStore', async importOriginal => {
    const actual = await importOriginal<typeof import('@/stores/usePlaybackStore')>();
    return { ...actual, usePlaybackStore: Object.assign((selector: (state: unknown) => unknown) => selector(actual.usePlaybackStore.getState()), actual.usePlaybackStore) };
});
vi.mock('@/stores/useAudioSettingsStore', () => ({ useAudioSettingsStore: (selector: (state: unknown) => unknown) => selector({ audioQuality: 'high', loopMode: 'all' }) }));
vi.mock('@/stores/useSearchNavigationStore', () => ({ useSearchNavigationStore: (selector: (state: unknown) => unknown) => selector({}) }));
vi.mock('@/services/hostExtensionHooks', () => ({ hasBeforePlayHook: mocks.beforeHook, runBeforePlayHook: mocks.beforePlay }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { canPlaySong: mocks.canPlay, getProviderAvailability: mocks.configured } }));
vi.mock('@/services/onlineMusic/songAvailability', () => ({ isSongUnavailable: (song: SongResult) => (song.privilege?.st || 0) < 0, getSongReplacement: mocks.replacement }));
vi.mock('@/services/onlineMusic/resourceCache', () => ({ hasCachedSongAudio: async () => null, getCachedSongCoverUrl: mocks.cover }));
vi.mock('@/services/prefetchService', () => ({ getPrefetchedData: () => null, prefetchNearbySongs: mocks.nearby }));
vi.mock('@/services/onlinePlayback', () => ({ loadOnlineSongAudioSource: mocks.source, loadOnlineSongLyrics: mocks.lyrics,
    applyOnlineAudioSourceMetadata: (song: SongResult) => song }));
vi.mock('@/utils/onlineLyricsState', () => ({ loadOnlineLyricsState: mocks.lyricsState }));

const { usePlaybackQueueController } = await import('@/hooks/usePlaybackQueueController');
const { usePlaybackStore } = await import('@/stores/usePlaybackStore');
const { useStatusMessageStore } = await import('@/stores/useStatusMessageStore');
const { currentTime } = await import('@/stores/motionSignals');
const oldSong: SongResult = { id: 1, name: 'Audible', artists: [], album: { id: 1, name: '' }, durationMs: 200_000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '1' } };
const marked: SongResult = { ...oldSong, id: 2, name: 'Advisory unavailable', sourceRef: { kind: 'online', providerId: 'netease', mediaId: '2' }, privilege: { id: 2, st: -200 } };
const next: SongResult = { ...oldSong, id: 3, name: 'New selection', sourceRef: { kind: 'online', providerId: 'netease', mediaId: '3' } };

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('window', { setTimeout: vi.fn(() => 1), setInterval: vi.fn(() => 2), clearTimeout: vi.fn(), clearInterval: vi.fn() });
    mocks.configured.mockReturnValue({ configured: true }); mocks.canPlay.mockReturnValue(true); mocks.beforeHook.mockReturnValue(false);
    mocks.beforePlay.mockImplementation(async song => song); mocks.replacement.mockResolvedValue(null);
    mocks.source.mockResolvedValue({ kind: 'ok', audioSrc: 'https://audio.test/full-song.mp3' });
    mocks.lyricsState.mockResolvedValue(null); mocks.cover.mockResolvedValue(null); mocks.persist.mockResolvedValue(undefined); mocks.lyrics.mockResolvedValue(undefined);
    usePlaybackStore.setState({ activePlaybackContext: 'main', currentSong: oldSong, playQueue: [oldSong], audioSrc: 'blob:already-playing',
        playerState: PlayerState.PLAYING, isFmMode: false, transitionDisplay: null });
    useStatusMessageStore.setState({ message: null }); currentTime.set(42.531);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function controller(localSongs: LocalSong[] = []) {
    const pause = vi.fn(), local = vi.fn().mockResolvedValue(undefined), navidrome = vi.fn().mockResolvedValue(undefined);
    const currentSongRef = { current: 'online:netease:1' };
    const queue = usePlaybackQueueController({
        localSongs, localLibraryCatalog: {}, isNowPlayingStageActive: false, shouldNavigateToPlayerOnTrackChange: true,
        audioRef: { current: { pause } }, blobUrlRef: { current: null }, shouldAutoPlayRef: { current: true }, currentSongRef,
        pendingResumeTimeRef: { current: null }, currentOnlineAudioUrlFetchedAtRef: { current: null }, lastAudioRecoverySourceRef: { current: null },
        playbackAutoSkipCountRef: { current: 0 }, mainPlaybackSnapshotRef: { current: null }, setLyrics: vi.fn(), setIsLyricsLoading: vi.fn(),
        interruptStagePlaybackForMainTransition: vi.fn(), navigateToPlaybackView: vi.fn(), restoreCachedThemeForSong: vi.fn().mockResolvedValue(undefined),
        persistLastPlaybackCache: mocks.persist, onPlayLocalSong: local, onPlayNavidromeSong: navidrome,
    } as never);
    return { ...queue, pause, local, navidrome, currentSongRef };
}

describe('selected NetEase advisory availability verification', () => {
    it('uses one full source from the existing loader despite stale search privilege, without changing the marker globally', async () => {
        await controller().playSong(marked, [marked]);
        expect(mocks.source).toHaveBeenCalledOnce(); expect(mocks.source).toHaveBeenCalledWith(marked, 'high', null);
        expect(mocks.replacement).not.toHaveBeenCalled(); expect(mocks.replacementDialog).not.toHaveBeenCalled();
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: { id: 2, privilege: { st: -200 } }, audioSrc: 'https://audio.test/full-song.mp3' });
        expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), [marked]);
    });
    it('keeps the original replacement dialog when the current source actually has no audio', async () => {
        mocks.source.mockResolvedValue({ kind: 'unavailable' }); mocks.replacement.mockResolvedValue({ song: next, label: 'Replacement' });
        await controller().playSong(marked, [marked]);
        expect(mocks.source).toHaveBeenCalledOnce(); expect(mocks.replacement).toHaveBeenCalledWith(marked);
        expect(mocks.replacementDialog).toHaveBeenCalledWith(expect.objectContaining({ originalSong: marked, replacementSong: next }));
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: oldSong, audioSrc: 'blob:already-playing' }); expect(currentTime.get()).toBe(42.531);
    });
    it('reports the original unavailability when neither audio nor replacement exists', async () => {
        mocks.source.mockResolvedValue({ kind: 'unavailable' });
        await controller().playSong(marked, [marked]);
        expect(useStatusMessageStore.getState().message).toMatchObject({ type: 'error', text: 'status.songUnavailable' });
        expect(mocks.source).toHaveBeenCalledOnce(); expect(mocks.persist).not.toHaveBeenCalled();
    });
    it.each(['preview-only', 'auth-required', 'region-restricted'] as const)('retains the stop policy for %s and never tries replacement', async reason => {
        mocks.source.mockResolvedValue({ kind: 'unavailable', reason });
        const queue = controller(); await queue.playSong(marked, [marked]);
        expect(queue.pause).toHaveBeenCalledOnce(); expect(mocks.replacement).not.toHaveBeenCalled();
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: oldSong, playerState: PlayerState.IDLE });
        expect(mocks.source).toHaveBeenCalledOnce(); expect(mocks.persist).not.toHaveBeenCalled();
    });
    it.each(['unconfigured', 'unsupported', 'different-provider'] as const)('does not probe an explicitly unavailable %s source', async policy => {
        if (policy === 'unconfigured') mocks.configured.mockReturnValue({ configured: false });
        if (policy === 'unsupported') mocks.canPlay.mockReturnValue(false);
        const target = policy === 'different-provider' ? { ...marked, sourceRef: { kind: 'online' as const, providerId: 'qq', mediaId: '2' } } : marked;
        await controller().playSong(target, [target]);
        expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.replacement).toHaveBeenCalledWith(target);
    });
    it('respects an explicit beforePlay hook cancellation before accessing any source', async () => {
        mocks.beforeHook.mockReturnValue(true); mocks.beforePlay.mockResolvedValue(null);
        await controller().playSong(marked, [marked]);
        expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.replacement).not.toHaveBeenCalled();
        expect(usePlaybackStore.getState()).toMatchObject({ currentSong: oldSong, audioSrc: 'blob:already-playing' });
    });
    it('leaves local and Navidrome playback in their original adapters', async () => {
        const local = { id: 'local-1', title: 'Local', fileName: 'local.wav' } as LocalSong;
        const localTarget = { ...oldSong, isLocal: true, localRef: { songId: 'local-1' }, sourceRef: { kind: 'local' as const, mediaId: 'local-1' } };
        const navidromeTarget = buildNavidromeQueue([{ ...oldSong, isNavidrome: true, navidromeData: { id: 'nav-1', title: 'Navidrome' } } as unknown as NavidromeSong])[0]!;
        const queue = controller([local]); await queue.playSong(localTarget, [localTarget]); await queue.playSong(navidromeTarget, [navidromeTarget]);
        expect(queue.local).toHaveBeenCalledOnce(); expect(queue.navidrome).toHaveBeenCalledOnce();
        expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.replacement).not.toHaveBeenCalled();
    });
    it('drops a superseded source result, revokes its unplayed blob and keeps the newer selection', async () => {
        let finish!: (value: object) => void;
        mocks.source.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const revoke = vi.spyOn(URL, 'revokeObjectURL'), queue = controller();
        const first = queue.playSong(marked, [marked]); await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce());
        await queue.playSong(next, [next]); finish({ kind: 'ok', audioSrc: 'blob:stale', blobUrl: 'blob:stale' }); await first;
        expect(revoke).toHaveBeenCalledWith('blob:stale'); expect(usePlaybackStore.getState().currentSong?.id).toBe(3);
        expect(mocks.replacement).not.toHaveBeenCalled(); expect(mocks.persist).toHaveBeenCalledOnce();
    });
    it('ignores a superseded replacement result instead of opening a dialog for the old selection', async () => {
        let finish!: (value: object) => void;
        mocks.source.mockResolvedValueOnce({ kind: 'unavailable' }); mocks.replacement.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const queue = controller(), first = queue.playSong(marked, [marked]); await vi.waitFor(() => expect(mocks.replacement).toHaveBeenCalledOnce());
        await queue.playSong(next, [next]); finish({ song: oldSong }); await first;
        expect(mocks.replacementDialog).not.toHaveBeenCalled(); expect(usePlaybackStore.getState().currentSong?.id).toBe(3);
    });
    it('does not overwrite a newer track after its local lyric-state load resolves late', async () => {
        let finish!: (value: null) => void;
        mocks.lyricsState.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const queue = controller(), first = queue.playSong(marked, [marked]); await vi.waitFor(() => expect(mocks.lyricsState).toHaveBeenCalledOnce());
        await queue.playSong(next, [next]); finish(null); await first;
        expect(usePlaybackStore.getState().currentSong?.id).toBe(3); expect(queue.currentSongRef.current).toBe('online:netease:3');
        expect(mocks.persist).toHaveBeenCalledOnce();
    });
});
