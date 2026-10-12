import { isBuiltinVisualizerMode, isBuiltinVisualizerBackgroundMode, DEFAULT_VISUALIZER_BACKGROUND_MODE } from '../types/visualizerModes';

// src/wallpaper/settings.ts — Wallpaper Engine owns these values; no player settings store needed.
const number = (value: unknown, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
export function wallpaperSettings(values: Record<string, unknown>) {
  return {
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
  };
}
