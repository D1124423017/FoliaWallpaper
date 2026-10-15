import { create } from 'zustand';
import {
    DEFAULT_PLAYER_EXPERIENCE_PROFILES, isPlayerExperienceMode, isPlayerExperienceProfile,
    parsePlayerExperienceConfig, resolvePlayerExperienceProfile,
    type PlayerExperienceConfig, type PlayerExperienceMode, type PlayerExperienceProfile,
} from '../types/playerExperience';
import { parseExperienceAppearances, type ExperienceAppearance } from '../types/playerExperienceAppearance';
import { currentExperienceAppearance } from '../integration/appearanceSnapshot';

// src/stores/usePlayerExperienceStore.ts — switching presentation never writes to playback/audio stores.
export const PLAYER_EXPERIENCE_STORAGE_KEY = 'folia_player_experience_v1';
export type { PlayerExperienceConfig, PlayerExperienceMode, PlayerExperienceProfile } from '../types/playerExperience';

const defaults = (): PlayerExperienceConfig => ({ version: 1, mode: 'folia', customProfile: { ...DEFAULT_PLAYER_EXPERIENCE_PROFILES.custom } });
const readStoredConfig = (): PlayerExperienceConfig => {
    try {
        return parsePlayerExperienceConfig(JSON.parse(localStorage.getItem(PLAYER_EXPERIENCE_STORAGE_KEY) ?? 'null')) ?? defaults();
    } catch { return defaults(); }
};
const persist = (config: PlayerExperienceConfig) => {
    try { localStorage.setItem(PLAYER_EXPERIENCE_STORAGE_KEY, JSON.stringify(config)); } catch { /* Session choices still work without storage. */ }
};

type PlayerExperienceState = PlayerExperienceConfig & {
    profile: PlayerExperienceProfile;
    setMode(mode: PlayerExperienceMode): void;
    setCustomProfile(patch: Partial<PlayerExperienceProfile>): void;
    setAppearance(mode: 'folia' | 'custom', appearance: ExperienceAppearance): void;
    importConfig(value: unknown): boolean;
    hydrate(): void;
};
const initial = readStoredConfig();
export const usePlayerExperienceStore = create<PlayerExperienceState>((set, get) => ({
    ...initial, profile: resolvePlayerExperienceProfile(initial),
    setMode: mode => {
        if (!isPlayerExperienceMode(mode) || mode === get().mode) return;
        const config = { ...snapshotPlayerExperience(), mode };
        persist(config); set({ ...config, profile: resolvePlayerExperienceProfile(config) });
    },
    setCustomProfile: patch => {
        const customProfile = { ...get().customProfile, ...patch };
        if (!isPlayerExperienceProfile(customProfile)) return;
        const config = { ...snapshotPlayerExperience(), customProfile };
        persist(config); set({ ...config, profile: resolvePlayerExperienceProfile(config) });
    },
    setAppearance: (mode, appearance) => {
        const appearances = parseExperienceAppearances({ ...get().appearances, [mode]: appearance });
        if (!appearances) return;
        const config = { ...snapshotPlayerExperience(), appearances };
        persist(config); set({ appearances });
    },
    importConfig: value => {
        const config = parsePlayerExperienceConfig(value);
        if (!config) return false;
        persist(config); set({ ...config, appearances: config.appearances, profile: resolvePlayerExperienceProfile(config) }); return true;
    },
    hydrate: () => {
        const config = readStoredConfig(); set({ ...config, appearances: config.appearances, profile: resolvePlayerExperienceProfile(config) });
    },
}));

export const snapshotPlayerExperience = (): PlayerExperienceConfig => {
    const { mode, customProfile, appearances } = usePlayerExperienceStore.getState();
    const live = currentExperienceAppearance(), visualProfiles = live ? { ...appearances, [live.mode]: live.appearance } : appearances;
    return { version: 1, mode, customProfile: { ...customProfile }, ...(visualProfiles ? { appearances: parseExperienceAppearances(visualProfiles)! } : {}) };
};
export const importPlayerExperience = (value: unknown): boolean => usePlayerExperienceStore.getState().importConfig(value);
