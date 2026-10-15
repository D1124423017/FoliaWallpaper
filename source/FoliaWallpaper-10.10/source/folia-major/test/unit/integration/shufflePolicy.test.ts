import { afterEach, describe, expect, it, vi } from 'vitest';
import { startIntegrationShuffle, setIntegrationShuffleEnabled, integrationShuffleEnabled } from '../../../src/integration/shufflePolicy';
import { createQueueMutations } from '../../../src/components/app/player-panel/createQueueMutations';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import { useAudioSettingsStore } from '../../../src/stores/useAudioSettingsStore';
import { currentTime, lyricCurrentTime } from '../../../src/stores/motionSignals';
import type { IntegrationActions } from '../../../src/integration/contracts';
import type { SongResult } from '../../../src/types';

// A shuffled loop changes only upcoming queue order; the audible deck and exact clocks are never recreated.
afterEach(() => vi.restoreAllMocks());
describe('integration shuffle policy', () => {
  it('randomizes the next round through persisted core queue mutations and releases its subscription', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    const songs = [1, 2, 3, 4].map(id => ({ id, name: `Song ${id}`, sourceRef: { kind: 'online', providerId: 'netease', mediaId: String(id) } } as SongResult));
    useAudioSettingsStore.setState({ loopMode: 'all' });
    usePlaybackStore.setState({ currentSong: songs[3], playQueue: songs, activePlaybackContext: 'main', audioSrc: 'blob:same-audio' });
    currentTime.set(123.531); lyricCurrentTime.set(123.281);
    const persist = vi.fn().mockResolvedValue(undefined);
    const mutations = createQueueMutations({ currentSong: songs[3]!, playQueue: songs, persistLastPlaybackCache: persist, t: key => key, queueAddBehavior: 'append' });
    const actions = { moveQueue: vi.fn(mutations.moveQueueSong) } as unknown as IntegrationActions;
    setIntegrationShuffleEnabled(true);
    const stop = startIntegrationShuffle(() => actions);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    usePlaybackStore.setState({ currentSong: songs[0] });
    await Promise.resolve();
    const state = usePlaybackStore.getState();
    expect(state.playQueue[0]).toBe(songs[0]); expect(state.playQueue).not.toEqual(songs);
    expect(new Set(state.playQueue)).toEqual(new Set(songs)); expect(persist).toHaveBeenCalled();
    expect(state.audioSrc).toBe('blob:same-audio'); expect(currentTime.get()).toBe(123.531); expect(lyricCurrentTime.get()).toBe(123.281);
    expect(integrationShuffleEnabled()).toBe(true);
    useAudioSettingsStore.setState({ loopMode: 'one' }); expect(integrationShuffleEnabled()).toBe(false);
    stop(); const count = vi.mocked(actions.moveQueue).mock.calls.length;
    usePlaybackStore.setState({ currentSong: songs[3], playQueue: songs }); usePlaybackStore.setState({ currentSong: songs[0] });
    await Promise.resolve(); expect(actions.moveQueue).toHaveBeenCalledTimes(count);
  });
});
