import { parseExperienceAppearances, type ExperienceAppearances } from './playerExperienceAppearance';

// src/types/playerExperience.ts — portable presentation choices, independent of playback state.
export type PlayerExperienceMode = 'folia' | 'mineradio' | 'custom';
export type PlayerExperienceProfile = {
    controls: 'folia' | 'mineradio';
    lyrics: 'folia' | 'mineradio' | 'off';
    background: 'folia' | 'mineradio';
};
export type PlayerExperienceConfig = {
    version: 1;
    mode: PlayerExperienceMode;
    customProfile: PlayerExperienceProfile;
    appearances?: ExperienceAppearances;
};

export const DEFAULT_PLAYER_EXPERIENCE_PROFILES: Readonly<Record<PlayerExperienceMode, Readonly<PlayerExperienceProfile>>> = {
    folia: { controls: 'folia', lyrics: 'folia', background: 'folia' },
    mineradio: { controls: 'mineradio', lyrics: 'mineradio', background: 'mineradio' },
    custom: { controls: 'folia', lyrics: 'folia', background: 'mineradio' },
};

export const isPlayerExperienceMode = (value: unknown): value is PlayerExperienceMode => (
    value === 'folia' || value === 'mineradio' || value === 'custom'
);

export const isPlayerExperienceProfile = (value: unknown): value is PlayerExperienceProfile => {
    if (!value || typeof value !== 'object') return false;
    const profile = value as Partial<PlayerExperienceProfile>;
    return (profile.controls === 'folia' || profile.controls === 'mineradio')
        && (profile.lyrics === 'folia' || profile.lyrics === 'mineradio' || profile.lyrics === 'off')
        && (profile.background === 'folia' || profile.background === 'mineradio');
};

/** Copy only supported fields; imported data must never become runtime settings by reference. */
export const parsePlayerExperienceConfig = (value: unknown): PlayerExperienceConfig | null => {
    if (!value || typeof value !== 'object') return null;
    const config = value as Partial<PlayerExperienceConfig>;
    if (config.version !== 1 || !isPlayerExperienceMode(config.mode) || !isPlayerExperienceProfile(config.customProfile)) return null;
    const appearances = config.appearances === undefined ? undefined : parseExperienceAppearances(config.appearances);
    if (appearances === null) return null;
    return { version: 1, mode: config.mode, customProfile: {
        controls: config.customProfile.controls, lyrics: config.customProfile.lyrics, background: config.customProfile.background,
    }, ...(appearances ? { appearances } : {}) };
};

export const resolvePlayerExperienceProfile = (config: Pick<PlayerExperienceConfig, 'mode' | 'customProfile'>): PlayerExperienceProfile => (
    { ...(config.mode === 'custom' ? config.customProfile : DEFAULT_PLAYER_EXPERIENCE_PROFILES[config.mode]) }
);
