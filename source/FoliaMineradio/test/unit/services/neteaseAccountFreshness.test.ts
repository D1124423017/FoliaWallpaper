import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/services/neteaseAccountFreshness.test.ts — account mutations and their reads bypass stale GET responses.
describe('NetEase account request freshness', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('VITE_NETEASE_API_BASE', 'http://127.0.0.1:3000');
        vi.stubGlobal('window', {});
        vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'netease_cookie' ? 'test-cookie' : null,
            setItem: vi.fn(), removeItem: vi.fn() });
        vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, text: async () => JSON.stringify({ code: 200, ids: [], songs: [] }) })));
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

    it('repeated favorite mutations and fresh likes/playlist reads have distinct cache keys', async () => {
        const clock = vi.spyOn(Date, 'now');
        const { neteaseApi } = await import('@/services/netease');
        clock.mockReturnValue(1000); await neteaseApi.likeSong(42, true);
        clock.mockReturnValue(2000); await neteaseApi.likeSong(42, true);
        clock.mockReturnValue(3000); await neteaseApi.getLikedSongs(1);
        clock.mockReturnValue(4000); await neteaseApi.getPlaylistTracks(5);
        const urls = vi.mocked(fetch).mock.calls.map(call => new URL(String(call[0])));
        expect(urls.map(url => url.searchParams.get('timestamp'))).toEqual(['1000', '2000', '3000', '4000']);
        expect(urls[0].href).not.toEqual(urls[1].href);
        expect(urls.map(url => url.pathname)).toEqual(['/like', '/like', '/likelist', '/playlist/track/all']);
        clock.mockRestore();
    });
});
