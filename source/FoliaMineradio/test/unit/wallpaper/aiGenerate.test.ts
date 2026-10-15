import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_AI_DUAL_THEME } from '../../../src/services/themeSanitizer';

// test/unit/wallpaper/aiGenerate.test.ts — real Folia provider client with mocked network; no API credits or user configuration are used.
const mocks = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn(), write: vi.fn(), mkdir: vi.fn() }));
vi.mock('../../../dev/wallpaper/ai/config', () => ({ aiDirectory: '/test-ai', loadAiSettings: mocks.load,
  publicAiSettings: (settings: Record<string, unknown>) => ({ configured: Boolean(settings.GEMINI_API_KEY) }) }));
vi.mock('node:fs/promises', () => ({ default: { readFile: mocks.read, writeFile: mocks.write, mkdir: mocks.mkdir } }));
const input = { title: 'Song', lyricsText: 'Original words for a test' };
const reply = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(FALLBACK_AI_DUAL_THEME) }] } }] }), { status: 200 });
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.load.mockResolvedValue({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'unit-test-key' });
  mocks.read.mockRejectedValue(new Error('no cache')); mocks.write.mockResolvedValue(undefined); mocks.mkdir.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('original Folia AI theme generation', () => {
  it('does not contact any provider before a key is configured', async () => {
    mocks.load.mockResolvedValue({}); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { generateWallpaperTheme } = await import('../../../dev/wallpaper/ai/generate');
    expect(await generateWallpaperTheme(input, new AbortController().signal)).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it('never starts a provider call if the song changes while the disk cache is loading', async () => {
    let finish!: (text: string) => void;
    mocks.read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { generateWallpaperTheme } = await import('../../../dev/wallpaper/ai/generate');
    const job = new AbortController(); const result = generateWallpaperTheme(input, job.signal); const rejected = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1)); job.abort(); finish('[]'); await rejected;
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the original Gemini client, sanitizes its theme and caches it without storing source text or keys', async () => {
    const fetch = vi.fn().mockResolvedValue(reply()); vi.stubGlobal('fetch', fetch);
    const { generateWallpaperTheme } = await import('../../../dev/wallpaper/ai/generate');
    const first = await generateWallpaperTheme(input, new AbortController().signal);
    expect(first?.dark.provider).toBe('Folia AI'); expect(first?.dark.fontStyle).toBe('sans');
    expect(await generateWallpaperTheme(input, new AbortController().signal)).toEqual(first); expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('gemini-3-flash-preview');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain(input.lyricsText); expect(body.generationConfig.maxOutputTokens).toBe(4096);
    const cacheText = mocks.write.mock.calls[0][1]; expect(cacheText).not.toContain('unit-test-key'); expect(cacheText).not.toContain(input.lyricsText);
  });
  it('shares generation across monitors and preserves it when only one monitor cancels', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetch);
    const { generateWallpaperTheme, AiBusyError } = await import('../../../dev/wallpaper/ai/generate');
    const a = new AbortController(); const first = generateWallpaperTheme(input, a.signal);
    const rejected = expect(first).rejects.toThrow();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = generateWallpaperTheme(input, new AbortController().signal); await Promise.resolve();
    await expect(generateWallpaperTheme({ ...input, title: 'Other' }, new AbortController().signal)).rejects.toBeInstanceOf(AiBusyError);
    a.abort(); await rejected; expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    finish(reply()); expect((await second)?.dark.provider).toBe('Folia AI'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('cancels the provider after the last subscriber leaves and never caches an aborted result', async () => {
    const fetch = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))); vi.stubGlobal('fetch', fetch);
    const { generateWallpaperTheme } = await import('../../../dev/wallpaper/ai/generate');
    const job = new AbortController(); const result = generateWallpaperTheme(input, job.signal); const rejected = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)); job.abort(); await rejected;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('uses a successful result even if its optional cache cannot be saved', async () => {
    mocks.write.mockRejectedValue(new Error('disk full')); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply()));
    const { generateWallpaperTheme } = await import('../../../dev/wallpaper/ai/generate');
    expect((await generateWallpaperTheme(input, new AbortController().signal))?.dark.provider).toBe('Folia AI');
  });
});
