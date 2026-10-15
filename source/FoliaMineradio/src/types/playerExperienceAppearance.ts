// Presentation preferences have their own mode scope; playback, source selection, theme colors and assets remain shared.
export const EXPERIENCE_VISUAL_FIELDS = [
  'visualizerMode', 'visualizerBackgroundMode', 'backgroundOpacity', 'visualizerOpacity',
  'disableVisualizerVignette', 'disableVisualizerGeometricBackground', 'randomVisualizerModePerSong',
  'classicTuning', 'cadenzaTuning', 'partitaTuning', 'fumeTuning', 'claddaghTuning', 'cappellaTuning', 'tiltTuning',
  'dioramaTuning', 'monetBackgroundTuning', 'nomandBackgroundTuning', 'latentBackgroundTuning', 'soraBackgroundTuning',
  'monetTuning', 'pendoloTuning', 'sonnetTuning', 'temperaTuning', 'lumiereTuning',
] as const;
export const EXPERIENCE_TYPOGRAPHY_FIELDS = [
  'lyricsFontStyle', 'lyricsFontScale', 'lyricsFontWeight', 'lyricsFontFallbackFamilies',
  'subtitleFontInheritsLyrics', 'subtitleFontScale', 'subtitleFontStyle', 'subtitleFontWeight', 'subtitleFontFamily',
  'subtitleFontFallbackFamilies', 'hidePlayerTranslationSubtitle', 'subtitleContentMode', 'subtitleOverlayOpacity',
  'subtitleOverlayBackground', 'subtitleUpcomingLyricsBlur', 'showHarmonySubtitle', 'harmonySubtitleBackground',
] as const;
export type ExperienceAppearance = { visualizer: Record<string, unknown>; typography: Record<string, unknown> };
export type ExperienceAppearances = Partial<Record<'folia' | 'custom', ExperienceAppearance>>;

function cloneValue(value: unknown, depth = 0): unknown {
  if (depth > 10) throw new Error('Appearance is too deeply nested');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.length <= 1_000_000) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length <= 1000) return value.map(item => cloneValue(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)).map(([key, item]) => [key, cloneValue(item, depth + 1)]));
  throw new Error('Invalid appearance value');
}
const copyFields = (value: unknown, fields: readonly string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid appearance fields');
  return Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, cloneValue((value as Record<string, unknown>)[key])]));
};
function validFields(fields: Record<string, unknown>): boolean {
  const booleans = new Set(['disableVisualizerVignette', 'disableVisualizerGeometricBackground', 'randomVisualizerModePerSong',
    'subtitleFontInheritsLyrics', 'hidePlayerTranslationSubtitle', 'subtitleOverlayBackground', 'subtitleUpcomingLyricsBlur', 'showHarmonySubtitle', 'harmonySubtitleBackground']);
  return Object.entries(fields).every(([key, value]) => {
    if (booleans.has(key)) return typeof value === 'boolean';
    if (key.endsWith('Tuning')) return !!value && typeof value === 'object' && !Array.isArray(value);
    if (key.endsWith('Opacity')) return typeof value === 'number' && value >= 0 && value <= 1;
    if (key.endsWith('Scale')) return typeof value === 'number' && value > 0 && value <= 10;
    if (key.endsWith('Weight')) return value === null || typeof value === 'number' && value >= 100 && value <= 1000;
    if (key.endsWith('FallbackFamilies')) return Array.isArray(value) && value.length <= 32 && value.every(item => typeof item === 'string' && item.length < 1000);
    if (key.endsWith('FontStyle')) return value === 'sans' || value === 'serif' || value === 'mono';
    if (key === 'subtitleContentMode') return ['translation', 'romanization', 'both', 'none'].includes(String(value));
    if (key === 'subtitleFontFamily') return value === null || typeof value === 'string' && value.length < 4000;
    if (key === 'visualizerBackgroundMode' && value === null) return true;
    return typeof value === 'string' && /^[\w:.-]{1,100}$/.test(value);
  });
}
export function parseExperienceAppearances(value: unknown): ExperienceAppearances | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const output: ExperienceAppearances = {};
    for (const mode of ['folia', 'custom'] as const) {
      const appearance = (value as Record<string, unknown>)[mode];
      if (appearance === undefined) continue;
      if (!appearance || typeof appearance !== 'object') return null;
      const fields = appearance as Record<string, unknown>;
      const visualizer = copyFields(fields.visualizer, EXPERIENCE_VISUAL_FIELDS), typography = copyFields(fields.typography, EXPERIENCE_TYPOGRAPHY_FIELDS);
      if (!validFields(visualizer) || !validFields(typography)) return null;
      output[mode] = { visualizer, typography };
    }
    return output;
  } catch { return null; }
}
