import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerState, type SongResult } from '../../../src/types';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import { currentTime, lyricCurrentTime } from '../../../src/stores/motionSignals';
import {
    PLAYER_EXPERIENCE_STORAGE_KEY, importPlayerExperience, snapshotPlayerExperience, usePlayerExperienceStore,
} from '../../../src/stores/usePlayerExperienceStore';
import { compressConfig, decompressConfig } from '../../../src/utils/appearanceCodec';
import { buildImportPlan } from '../../../src/utils/appearanceImportPlan';

// test/unit/integration/playerExperience.test.ts — presentation switching must preserve the playback substrate.
beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    });
    usePlayerExperienceStore.getState().hydrate();
});

describe('player experience integration', () => {
    it('preserves audio identity, queue, transport and the live lyric clock across repeated switches', () => {
        const song = { id: 'local:integration', name: 'Integration song' } as SongResult;
        usePlaybackStore.setState({ currentSong: song, audioSrc: 'blob:active-audio', playQueue: [song], duration: 240, playerState: PlayerState.PLAYING });
        currentTime.set(92.531); lyricCurrentTime.set(92.281);
        const playback = usePlaybackStore.getState();
        for (let i = 0; i < 30; i++) {
            usePlayerExperienceStore.getState().setMode(['folia', 'mineradio', 'custom'][i % 3] as 'folia' | 'mineradio' | 'custom');
        }
        expect(usePlaybackStore.getState()).toBe(playback);
        expect(currentTime.get()).toBe(92.531); expect(lyricCurrentTime.get()).toBe(92.281);
    });

    it('retains custom choices while original modes restore their own profiles and after hydration', () => {
        const state = usePlayerExperienceStore.getState();
        state.setMode('custom'); state.setCustomProfile({ controls: 'mineradio', lyrics: 'off', background: 'folia' });
        state.setMode('folia');
        expect(usePlayerExperienceStore.getState().profile).toEqual({ controls: 'folia', lyrics: 'folia', background: 'folia' });
        state.setMode('mineradio');
        expect(usePlayerExperienceStore.getState().profile).toEqual({ controls: 'mineradio', lyrics: 'mineradio', background: 'mineradio' });
        state.setMode('custom'); state.hydrate();
        expect(usePlayerExperienceStore.getState().profile).toEqual({ controls: 'mineradio', lyrics: 'off', background: 'folia' });
        expect(JSON.parse(localStorage.getItem(PLAYER_EXPERIENCE_STORAGE_KEY)!)).toEqual(snapshotPlayerExperience());
    });

    it('backs up and restores the mode and all custom fields through shortcode and JSON import', () => {
        usePlayerExperienceStore.getState().setMode('custom');
        usePlayerExperienceStore.getState().setCustomProfile({ controls: 'mineradio', lyrics: 'folia', background: 'folia' });
        const config = { playerExperience: snapshotPlayerExperience() };
        for (const input of [JSON.stringify(config), compressConfig(config)]) {
            const decoded = decompressConfig(input);
            expect(decoded).toEqual(config);
            usePlayerExperienceStore.getState().setMode('folia');
            expect(importPlayerExperience(decoded.playerExperience)).toBe(true);
            expect(snapshotPlayerExperience()).toEqual(config.playerExperience);
        }
        const plan = buildImportPlan({ incoming: config, current: {}, switches: { isCustomThemePreferred: false, songThemeAutoSwitchEnabled: false, songThemeAutoGenerateEnabled: false }, customFontSource: null, customFontLabel: null, isCustomThemeActive: false });
        expect(plan.changes).toContainEqual(expect.objectContaining({ key: 'playerExperience', group: 'visualizer', to: config.playerExperience }));
    });

    it('rejects unknown modes, malformed profiles and unsupported backup versions without changing the active experience', () => {
        const previous = snapshotPlayerExperience();
        for (const value of [{ ...previous, mode: 'broken' }, { ...previous, customProfile: { ...previous.customProfile, lyrics: 'broken' } }, { ...previous, version: 2 }]) {
            expect(importPlayerExperience(value)).toBe(false);
            expect(() => decompressConfig(JSON.stringify({ playerExperience: value }))).toThrow('Invalid player experience');
            expect(snapshotPlayerExperience()).toEqual(previous);
        }
        localStorage.setItem(PLAYER_EXPERIENCE_STORAGE_KEY, 'not json');
        usePlayerExperienceStore.getState().hydrate();
        expect(usePlayerExperienceStore.getState().mode).toBe('folia');
    });
});
