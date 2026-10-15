import { isBuiltinVisualizerMode, isBuiltinVisualizerBackgroundMode, DEFAULT_VISUALIZER_BACKGROUND_MODE } from '../types/visualizerModes';
import type { Theme } from '../types';
import { mineradioPreset } from './mineradio/presets';

// src/wallpaper/settings.ts — validate host values and persisted desktop appearance overrides.
const number = (value: unknown, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
export function wallpaperSettings(values: Record<string, unknown>) {
  return {
    visualSystem: values.visualsystem === 'mineradio' ? 'mineradio' as const : 'folia' as const,
    mineradioPreset: mineradioPreset(values.mineradiopreset),
    mineradioIntensity: number(values.mineradiointensity, 85, 0, 200),
    mineradioSpeed: number(values.mineradiospeed, 100, 0, 200),
    mineradioPoint: number(values.mineradiopoint, 100, 50, 200),
    mineradioBloom: number(values.mineradiobloom, 62, 0, 120),
    mineradioOpacity: number(values.mineradioopacity, 80, 0, 100),
    mode: isBuiltinVisualizerMode(values.visualizer) ? values.visualizer : 'fume',
    background: isBuiltinVisualizerBackgroundMode(values.background) && values.background !== 'url'
      ? values.background : DEFAULT_VISUALIZER_BACKGROUND_MODE,
    lyricsScale: number(values.lyricsscale, 100, 60, 160) / 100,
    offsetSec: number(values.lyricsoffset, 0, -5000, 5000) / 1000,
    audioGain: number(values.audiogain, 100, 0, 300) / 100,
    metadata: values.showmetadata !== false,
    diagnostics: values.diagnostics === true,
    demo: values.demo === true,
    aiTheme: values.themesource === 'ai',
    themeVariant: values.themevariant === 'light' ? 'light' as const : 'dark' as const,
    animationIntensity: values.animationintensity === 'calm' || values.animationintensity === 'normal' || values.animationintensity === 'chaotic'
      ? values.animationintensity as Theme['animationIntensity'] : 'auto' as const,
    settingsButton: values.settingsbutton !== false,
    showSettings: values.showsettings === true,
    showSources: values.showsources === true,
    coverColorBackground: values.covercolorbg !== false,
  };
}
export type WallpaperSettings = ReturnType<typeof wallpaperSettings>;
