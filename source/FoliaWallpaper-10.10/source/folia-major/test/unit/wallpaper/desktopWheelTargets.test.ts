import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverWallpaperDebugTargets, readWallpaperDebugTarget } from '../../../dev/wallpaper/input/targets';

// test/unit/wallpaper/desktopWheelTargets.test.ts — second-display IPv6 discovery and local target boundaries.
const url = 'file:///C:/Steam/steamapps/common/wallpaper_engine/projects/myprojects/index/index.html';
const page = (host: string, id = 'folia') => ({ type: 'page', url, webSocketDebuggerUrl: `ws://${host}:3192/devtools/page/${id}` });
afterEach(() => vi.unstubAllGlobals());
describe('wallpaper wheel target discovery', () => {
  it('accepts both local bindings with distinct target identities', () => {
    const primary = readWallpaperDebugTarget(page('127.0.0.1'), 3192, '127.0.0.1');
    const secondary = readWallpaperDebugTarget(page('[::1]'), 3192, '[::1]');
    expect(primary).not.toBeNull(); expect(secondary).not.toBeNull();
    expect(primary?.key).not.toBe(secondary?.key);
  });
  it('rejects remote, cross-binding, different-port, malformed and unrelated pages', () => {
    for (const candidate of [page('example.com'), page('[::1]'), { ...page('127.0.0.1'), webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/folia' },
      { ...page('127.0.0.1'), url: 'file:///C:/Steam/other.html' }, { ...page('127.0.0.1'), url: 'not a URL' }])
      expect(readWallpaperDebugTarget(candidate, 3192, '127.0.0.1')).toBeNull();
  });
  it('still discovers Folia on the second binding when the first has another wallpaper', async () => {
    vi.stubGlobal('fetch', vi.fn(async (endpoint: string) => ({ json: async () => endpoint.includes('[::1]')
      ? [page('[::1]')] : [{ ...page('127.0.0.1'), url: 'file:///C:/Steam/other.html' }] })));
    expect((await discoverWallpaperDebugTargets(3192)).map(item => item.debugUrl)).toEqual([page('[::1]').webSocketDebuggerUrl]);
  });
  it('keeps both Folia pages and tolerates an unavailable loopback binding', async () => {
    vi.stubGlobal('fetch', vi.fn(async (endpoint: string) => ({ json: async () => [page(endpoint.includes('[::1]') ? '[::1]' : '127.0.0.1')] })));
    expect(await discoverWallpaperDebugTargets(3192)).toHaveLength(2);
    vi.stubGlobal('fetch', vi.fn(async (endpoint: string) => {
      if (!endpoint.includes('[::1]')) throw new Error('unavailable');
      return { json: async () => [page('[::1]')] };
    }));
    expect(await discoverWallpaperDebugTargets(3192)).toHaveLength(1);
  });
});
