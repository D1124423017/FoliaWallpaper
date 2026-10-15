import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWallpaperAiTheme, selectWallpaperTheme } from '../../../src/wallpaper/aiTheme';
import { FALLBACK_AI_DUAL_THEME as base } from '../../../src/services/themeSanitizer';
import { wallpaperSettings } from '../../../src/wallpaper/settings';

// test/unit/wallpaper/aiTheme.test.ts — wrong-song prevention and no-key fallback are part of the visual contract.
afterEach(() => vi.unstubAllGlobals());
describe('wallpaper theme adapter', () => {
  it('uses cover colors unless AI was explicitly selected', () => {
    expect(wallpaperSettings({}).aiTheme).toBe(false);
    expect(wallpaperSettings({ themesource: 'cover' }).aiTheme).toBe(false);
    expect(wallpaperSettings({ themesource: 'ai' }).aiTheme).toBe(true);
  });
  it('only applies a ready AI theme for the current song and allows a free cover-color mode', () => {
    const theme = { light: { ...base.light, name: 'Generated Light' }, dark: { ...base.dark, name: 'Generated Dark' } };
    const ai = { key: 'A', status: 'ready' as const, theme };
    expect(selectWallpaperTheme(base, ai, 'A', true, 'light').name).toBe('Generated Light');
    expect(selectWallpaperTheme(base, ai, 'B', true, 'dark')).toBe(base.dark);
    expect(selectWallpaperTheme(base, ai, 'A', false, 'dark')).toBe(base.dark);
  });
  it('understands unconfigured bridge responses without creating a theme', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ app: 'FoliaWallpaperAI', schema: 1, status: 'unconfigured', theme: null }))));
    expect(await fetchWallpaperAiTheme('Song', 'Words', new AbortController().signal)).toBeNull();
  });
  it('rejects incorrect bridge responses and provider failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ app: 'Other', schema: 1, theme: base })))
      .mockResolvedValueOnce(new Response('{}', { status: 503 })));
    await expect(fetchWallpaperAiTheme('Song', 'Words', new AbortController().signal)).rejects.toThrow('Unexpected AI response');
    await expect(fetchWallpaperAiTheme('Song', 'Words', new AbortController().signal)).rejects.toThrow('HTTP 503');
  });
});
