import { describe, expect, it, vi } from 'vitest';
import { searchQQLyrics } from '../../../src/utils/lyrics/providers/qqLyricProvider';
import { searchKugouLyrics } from '../../../src/utils/lyrics/providers/kugouLyricProvider';

// test/unit/wallpaper/providerTransport.test.ts — the existing adapters normalize through an injected native host transport.
describe('lyric host transport injection', () => {
  it('preserves QQ song identity and duration without accessing the browser proxy', async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ code: 0, request: { code: 0,
      data: { body: { item_song: [{ id: 123, mid: 'qq-mid', title: 'Song', interval: 185, singer: [{ id: 1, name: 'Artist' }] }] } } } })));
    const songs = await searchQQLyrics('Song Artist', 1, 10, transport);
    expect(transport.mock.calls[0][0]).toBe('https://u.y.qq.com/cgi-bin/musicu.fcg');
    expect(songs[0]).toMatchObject({ id: 123, qqMid: 'qq-mid', name: 'Song', durationMs: 185000 });
  });
  it('preserves the Kugou provider/hash when the native transport is selected', async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ data: { lists: [{ FileHash: 'abcdef', SongName: 'Song', Duration: 185, Singers: [{ name: 'Artist' }] }] } })));
    const songs = await searchKugouLyrics('Song - Artist', 1, 10, transport);
    expect(transport.mock.calls[0][0]).toContain('complexsearch.kugou.com');
    expect(songs[0]).toMatchObject({ kgHash: 'ABCDEF', sourceRef: { providerId: 'kugou', mediaId: 'ABCDEF' } });
  });
});
