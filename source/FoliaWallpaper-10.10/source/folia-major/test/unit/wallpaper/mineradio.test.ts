import { beforeEach, expect, it } from 'vitest';
import { wallpaperSettings } from '../../../src/wallpaper/settings';
import { useWallpaperPreferences } from '../../../src/wallpaper/preferences';
import { exportWallpaperAppearance, importWallpaperAppearance } from '../../../src/wallpaper/appearanceConfig';

// Visual integration must survive appearance transfer and reject unavailable upstream presets.
beforeEach(() => useWallpaperPreferences.setState({ engine: {}, overrides: {} }));
it('round trips Mineradio choices together with the original Folia appearance code', () => {
  const store = useWallpaperPreferences.getState();
  store.change({ visualsystem: 'mineradio', mineradiopreset: '12', mineradiointensity: 120, mineradiospeed: 75, visualizer: 'fume' });
  const values = useWallpaperPreferences.getState().overrides;
  const exported = JSON.stringify(exportWallpaperAppearance(wallpaperSettings(values)));
  store.restoreEngine();
  importWallpaperAppearance(exported);
  expect(useWallpaperPreferences.getState().overrides).toMatchObject(values);
});
it('falls back for excluded third party IDs and contains invalid or out of range controls', () => {
  for (const id of ['7', '8', 'unknown', '99']) expect(wallpaperSettings({ mineradiopreset: id }).mineradioPreset).toBe('0');
  const controls = wallpaperSettings({ visualsystem: 'unknown', mineradiopreset: '9', mineradiointensity: Infinity, mineradiospeed: -1, mineradiopoint: 1000 });
  expect(controls.visualSystem).toBe('folia'); expect(controls.mineradioPreset).toBe('9');
  expect(controls.mineradioIntensity).toBe(85); expect(controls.mineradioSpeed).toBe(0); expect(controls.mineradioPoint).toBe(200);
});
