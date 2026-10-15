import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startExperienceAppearance } from '../../../src/integration/experienceAppearance';
import { usePlayerExperienceStore, snapshotPlayerExperience } from '../../../src/stores/usePlayerExperienceStore';
import { useVisualizerSettingsStore } from '../../../src/stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '../../../src/stores/useTypographySettingsStore';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import { currentTime, lyricCurrentTime } from '../../../src/stores/motionSignals';
import { compressConfig, decompressConfig } from '../../../src/utils/appearanceCodec';
import { parsePlayerExperienceConfig } from '../../../src/types/playerExperience';

// Switching presentation restores each visual profile while transport and exact clocks remain owned by the core.
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  usePlayerExperienceStore.getState().hydrate();
  useVisualizerSettingsStore.setState({ visualizerMode: 'classic', visualizerBackgroundMode: 'monet' });
  useTypographySettingsStore.setState({ lyricsFontScale: 1 });
});
describe('per-experience Folia presentation preferences', () => {
  it('restores distinct animation, background and typography while keeping media identity and clocks unchanged', () => {
    const stop = startExperienceAppearance();
    const playback = usePlaybackStore.getState(); currentTime.set(77.531); lyricCurrentTime.set(77.281);
    usePlayerExperienceStore.getState().setMode('custom');
    useVisualizerSettingsStore.getState().handleSetVisualizerMode('fume', { notify: false });
    useVisualizerSettingsStore.getState().handleSetVisualizerBackgroundMode('sora');
    useTypographySettingsStore.getState().handleSetLyricsFontScale(1.2);
    const live = snapshotPlayerExperience();
    expect(live.appearances!.custom!.visualizer.visualizerMode).toBe('fume');
    expect(decompressConfig(compressConfig({ playerExperience: live })).playerExperience).toEqual(live);
    usePlayerExperienceStore.getState().setMode('folia');
    expect(useVisualizerSettingsStore.getState()).toMatchObject({ visualizerMode: 'classic', visualizerBackgroundMode: 'monet' });
    expect(useTypographySettingsStore.getState().lyricsFontScale).toBe(1);
    usePlayerExperienceStore.getState().setMode('mineradio'); usePlayerExperienceStore.getState().setMode('custom');
    expect(useVisualizerSettingsStore.getState()).toMatchObject({ visualizerMode: 'fume', visualizerBackgroundMode: 'sora' });
    expect(useTypographySettingsStore.getState().lyricsFontScale).toBe(1.2);
    expect(usePlaybackStore.getState()).toBe(playback); expect(currentTime.get()).toBe(77.531); expect(lyricCurrentTime.get()).toBe(77.281);
    stop();
  });
  it('rejects malformed imported profiles and strips playback fields from visual backups', () => {
    const basic = { version: 1, mode: 'folia', customProfile: { controls: 'folia', lyrics: 'folia', background: 'mineradio' } };
    expect(parsePlayerExperienceConfig({ ...basic, appearances: { custom: { visualizer: { visualizerMode: 42 }, typography: {} } } })).toBeNull();
    const parsed = parsePlayerExperienceConfig({ ...basic, appearances: { custom: { visualizer: { visualizerMode: 'classic', volume: 0 }, typography: { lyricsFontScale: 1 } } } });
    expect(parsed!.appearances!.custom!.visualizer).toEqual({ visualizerMode: 'classic' });
  });
});
