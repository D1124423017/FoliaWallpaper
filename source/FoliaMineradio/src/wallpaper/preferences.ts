import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// src/wallpaper/preferences.ts — desktop edits survive reloads; changed WE properties regain priority.
export const WALLPAPER_CONTROL_KEYS = [
  'visualizer', 'background', 'lyricsscale', 'lyricsoffset', 'audiogain', 'showmetadata',
  'diagnostics', 'demo', 'themesource', 'themevariant', 'animationintensity', 'settingsbutton', 'showsettings', 'covercolorbg',
  'visualsystem', 'mineradiopreset', 'mineradiointensity', 'mineradiospeed', 'mineradiopoint', 'mineradiobloom', 'mineradioopacity',
] as const;
export type WallpaperControlKey = typeof WALLPAPER_CONTROL_KEYS[number];
export type WallpaperControlValues = Partial<Record<WallpaperControlKey, string | number | boolean>>;
export function pickWallpaperControls(values: Record<string, unknown>): WallpaperControlValues {
  const picked: WallpaperControlValues = {};
  for (const key of WALLPAPER_CONTROL_KEYS) {
    const value = values[key];
    if (typeof value === 'boolean' || typeof value === 'string' && value.length < 128
      || typeof value === 'number' && Number.isFinite(value)) picked[key] = value;
  }
  return picked;
}
export function reconcileWallpaperControls(engine: WallpaperControlValues, overrides: WallpaperControlValues,
  incoming: WallpaperControlValues) {
  const nextOverrides = { ...overrides };
  for (const key of Object.keys(incoming) as WallpaperControlKey[]) {
    // A full startup notification with unchanged engine values must not erase desktop edits.
    if (Object.hasOwn(engine, key) && engine[key] !== incoming[key]) delete nextOverrides[key];
  }
  return { engine: { ...engine, ...incoming }, overrides: nextOverrides };
}
interface WallpaperPreferences {
  engine: WallpaperControlValues;
  overrides: WallpaperControlValues;
  receiveEngine: (values: Record<string, unknown>) => void;
  change: (patch: WallpaperControlValues) => void;
  restoreEngine: () => void;
}
export const useWallpaperPreferences = create<WallpaperPreferences>()(persist((set) => ({
  engine: {}, overrides: {},
  receiveEngine: values => set(state => {
    const incoming = pickWallpaperControls(values);
    if (Object.entries(incoming).every(([key, value]) => state.engine[key as WallpaperControlKey] === value)) return state;
    return reconcileWallpaperControls(state.engine, state.overrides, incoming);
  }),
  change: patch => set(state => ({ overrides: { ...state.overrides, ...pickWallpaperControls(patch) } })),
  restoreEngine: () => set({ overrides: {} }),
}), {
  name: 'folia-wallpaper-controls-v1', version: 1, storage: createJSONStorage(() => localStorage),
  partialize: state => ({ engine: state.engine, overrides: state.overrides }),
  merge: (saved, current) => {
    const state = saved as Partial<WallpaperPreferences> | undefined;
    return { ...current, engine: pickWallpaperControls(state?.engine ?? {}), overrides: pickWallpaperControls(state?.overrides ?? {}) };
  },
}));
