import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcileWallpaperControls, pickWallpaperControls, useWallpaperPreferences } from '../../../src/wallpaper/preferences';
import { wallpaperSettings } from '../../../src/wallpaper/settings';

// test/unit/wallpaper/preferences.test.ts — reload persistence and WE/desktop precedence must agree.
vi.hoisted(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key), clear: () => data.clear() });
});
beforeEach(() => { localStorage.clear(); useWallpaperPreferences.setState({ engine: {}, overrides: {} }); });
describe('wallpaper appearance ownership', () => {
  it('retains desktop edits on the full unchanged startup notification', () => {
    const result = reconcileWallpaperControls({ visualizer: 'fume', themesource: 'ai' },
      { visualizer: 'sonnet', animationintensity: 'chaotic' }, { visualizer: 'fume', themesource: 'ai' });
    expect(result.overrides).toEqual({ visualizer: 'sonnet', animationintensity: 'chaotic' });
  });
  it('lets a changed WE value replace only its corresponding desktop edit', () => {
    const result = reconcileWallpaperControls({ visualizer: 'fume', themevariant: 'dark' },
      { visualizer: 'sonnet', themevariant: 'light' }, { visualizer: 'tilt' });
    expect(result.overrides).toEqual({ themevariant: 'light' });
    expect(result.engine).toEqual({ visualizer: 'tilt', themevariant: 'dark' });
  });
  it('persists edits, restores them on reload and can return to WE values', async () => {
    const store = useWallpaperPreferences.getState();
    store.receiveEngine({ visualizer: 'fume', themesource: 'ai' });
    store.change({ visualizer: 'sonnet', animationintensity: 'chaotic' });
    const saved = localStorage.getItem('folia-wallpaper-controls-v1')!;
    useWallpaperPreferences.setState({ engine: {}, overrides: {} });
    localStorage.setItem('folia-wallpaper-controls-v1', saved);
    await useWallpaperPreferences.persist.rehydrate();
    expect(useWallpaperPreferences.getState().overrides.visualizer).toBe('sonnet');
    useWallpaperPreferences.getState().receiveEngine({ visualizer: 'fume', themesource: 'ai' });
    expect(useWallpaperPreferences.getState().overrides.animationintensity).toBe('chaotic');
    useWallpaperPreferences.getState().restoreEngine();
    expect(useWallpaperPreferences.getState().overrides).toEqual({});
    expect(useWallpaperPreferences.getState().engine.themesource).toBe('ai');
  });
  it('does not persist credentials or arbitrary data and validates renderer inputs', () => {
    expect(pickWallpaperControls({ apiKey: 'private', bridgeToken: 'private', visualizer: 'sonnet', lyricsscale: NaN, background: {} }))
      .toEqual({ visualizer: 'sonnet' });
    const settings = wallpaperSettings({ visualizer: 'unknown', background: 'url', animationintensity: 'unknown', lyricsscale: 999 });
    expect(settings.mode).toBe('fume'); expect(settings.background).toBe('latent');
    expect(settings.animationIntensity).toBe('auto'); expect(settings.lyricsScale).toBe(1.6);
    expect(wallpaperSettings({ animationintensity: 'chaotic' }).animationIntensity).toBe('chaotic');
  });
});
