import { compressConfig, decompressConfig } from '../utils/appearanceCodec';
import { applyVisualizerTuningsToSettings } from '../components/visualizer/tuningRegistry';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { wallpaperAppearance } from './appearance';
import { useVisualizerAssetStore } from '../stores/useVisualizerAssetStore';
import { pickWallpaperControls, useWallpaperPreferences } from './preferences';
import type { WallpaperSettings } from './settings';

// src/wallpaper/appearanceConfig.ts — reuse Folia appearance codes for all renderer/background tunings.
export function exportWallpaperAppearance(settings: WallpaperSettings) {
  const state = useVisualizerSettingsStore.getState();
  return {
    schema: 'folia-wallpaper-appearance', version: 1,
    controls: pickWallpaperControls({ ...useWallpaperPreferences.getState().engine, ...useWallpaperPreferences.getState().overrides }),
    folia: compressConfig({ visualizerMode: settings.mode, visualizerBackgroundMode: settings.background,
      lyricsFontScale: settings.lyricsScale, useCoverColorBg: settings.coverColorBackground,
      backgroundOpacity: state.backgroundOpacity, visualizerOpacity: state.visualizerOpacity,
      disableVisualizerVignette: state.disableVisualizerVignette,
      disableVisualizerGeometricBackground: state.disableVisualizerGeometricBackground,
      visualizerTunings: wallpaperAppearance(state, useVisualizerAssetStore.getState(), settings).tunings,
      monetBackgroundTuning: state.monetBackgroundTuning, nomandBackgroundTuning: state.nomandBackgroundTuning,
      latentBackgroundTuning: state.latentBackgroundTuning, soraBackgroundTuning: state.soraBackgroundTuning,
    }),
  };
}
export function importWallpaperAppearance(text: string) {
  if (text.length > 128_000) throw new Error('Appearance code too large');
  let controls = {};
  let code = text.trim();
  if (code.startsWith('{')) {
    const payload = JSON.parse(code);
    if (payload.schema === 'folia-wallpaper-appearance') {
      if (payload.version !== 1 || typeof payload.folia !== 'string') throw new Error('Unknown appearance format');
      controls = pickWallpaperControls(payload.controls ?? {}); code = payload.folia;
    }
  }
  const config = decompressConfig(code);
  if (!config || typeof config !== 'object') throw new Error('Invalid appearance code');
  const state = useVisualizerSettingsStore.getState();
  const scalar = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  if (config.visualizerTunings) applyVisualizerTuningsToSettings(state as unknown as Record<string, unknown>, config.visualizerTunings);
  for (const mode of ['Classic', 'Cadenza', 'Partita', 'Fume', 'Claddagh', 'Cappella', 'Tilt', 'Diorama', 'Monet', 'Pendolo', 'Sonnet', 'Tempera', 'Lumiere', 'MonetBackground', 'NomandBackground', 'LatentBackground', 'SoraBackground']) {
    const key = `${mode[0].toLowerCase()}${mode.slice(1)}Tuning`;
    const setter = state[`handleSet${mode}Tuning` as keyof typeof state];
    if (config[key] && typeof setter === 'function') (setter as (value: unknown) => void)(config[key]);
  }
  if (scalar(config.backgroundOpacity)) state.handleSetBackgroundOpacity(config.backgroundOpacity);
  if (scalar(config.visualizerOpacity)) state.handleSetVisualizerOpacity(config.visualizerOpacity);
  if (typeof config.disableVisualizerVignette === 'boolean') state.handleToggleDisableVisualizerVignette(config.disableVisualizerVignette);
  if (typeof config.disableVisualizerGeometricBackground === 'boolean') state.handleToggleDisableVisualizerGeometricBackground(config.disableVisualizerGeometricBackground);
  const theme = config.theme?.dark;
  useWallpaperPreferences.getState().change(pickWallpaperControls({
    ...(typeof config.visualizerMode === 'string' ? { visualizer: config.visualizerMode } : {}),
    ...(typeof config.visualizerBackgroundMode === 'string' ? { background: config.visualizerBackgroundMode } : {}),
    ...(scalar(config.lyricsFontScale) ? { lyricsscale: config.lyricsFontScale * 100 } : {}),
    ...(typeof config.useCoverColorBg === 'boolean' ? { covercolorbg: config.useCoverColorBg } : {}),
    ...(theme?.animationIntensity ? { animationintensity: theme.animationIntensity } : {}), ...controls,
  }));
}
