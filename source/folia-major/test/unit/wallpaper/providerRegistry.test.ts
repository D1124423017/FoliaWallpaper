import { describe, expect, it, vi } from 'vitest';
import { getOnlineMusicProvider } from '../../../dev/wallpaper/lyrics/providerRegistry';
import { searchKugouLyrics } from '../../../src/utils/lyrics/providers/kugouLyricProvider';
import { scoreWallpaperCandidate } from '../../../src/wallpaper/lyricsProviders';

// test/unit/wallpaper/providerRegistry.test.ts — regress the real 227-second album result incorrectly accepted for a 293-second MV.
vi.mock('../../../src/utils/lyrics/providers/kugouLyricProvider', () => ({ searchKugouLyrics: vi.fn(), fetchKugouLyrics: vi.fn() }));
describe('Standalone KuGou duration normalization', () => {
  it('preserves milliseconds from the legacy lyric adapter before catalog matching', async () => {
    const legacy = { id: 'FF5719341A9B004AA3E7312D617AE305', name: 'Beauty And A Beat',
      artists: [{ id: 1, name: 'Justin Bieber' }, { id: 2, name: 'Nicki Minaj' }], album: { id: 1, name: 'Believe' }, duration: 227000 };
    vi.mocked(searchKugouLyrics).mockResolvedValue([legacy as typeof legacy & { durationMs: number }]);
    const page = await getOnlineMusicProvider('kugou')!.search.searchSongs('Beauty And A Beat', 10, 0);
    expect(page.items[0].durationMs).toBe(227000);
    expect(scoreWallpaperCandidate({ title: 'Beauty And A Beat', artist: 'Justin Bieber', album: '', durationSec: 292.921 }, page.items[0])).toBe(0);
    expect(scoreWallpaperCandidate({ title: 'Beauty And A Beat', artist: 'Justin Bieber', album: '', durationSec: 227 }, page.items[0])).toBeGreaterThanOrEqual(75);
  });
});
