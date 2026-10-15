import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { allowLyricRequest, readLyricTrack, readJsonBody } from '../../../dev/wallpaper/lyrics/http';

// test/unit/wallpaper/serviceHttp.test.ts — local bridge access boundaries and untrusted input validation.
function request(origin?: string, host = '127.0.0.1:3189') { return { headers: { origin, host } } as IncomingMessage; }
const response = () => ({ setHeader() {}, writeHead() { return this; }, end() {} }) as unknown as ServerResponse;
const body = (data: unknown) => Readable.from([JSON.stringify(data)]) as IncomingMessage;
const track = { title: 'Song', artist: 'Artist', album: '', durationSec: 185 };
describe('standalone lyric bridge', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it('accepts a file wallpaper and the local QA origin', () => {
    expect(allowLyricRequest(request('null'), response())).toBe(true);
    expect(allowLyricRequest(request('http://127.0.0.1:3187'), response())).toBe(true);
  });
  it('blocks unrelated websites and DNS rebinding hostnames', () => {
    expect(allowLyricRequest(request('https://example.com'), response())).toBe(false);
    expect(allowLyricRequest(request('null', 'evil.example:3189'), response())).toBe(false);
    expect(allowLyricRequest(request('http://localhost.evil.example:3187'), response())).toBe(false);
  });
  it('accepts only bounded song metadata', async () => {
    expect(await readLyricTrack(body(track))).toEqual(track);
    await expect(readLyricTrack(body({ ...track, title: 'x'.repeat(501) }))).rejects.toThrow();
    await expect(readLyricTrack(body({ ...track, durationSec: -1 }))).rejects.toThrow();
    await expect(readLyricTrack(body({ ...track, artist: null }))).rejects.toThrow();
  });
  it('rejects overlong request bodies before parsing', async () => {
    await expect(readLyricTrack(body({ ...track, other: 'x'.repeat(9000) }))).rejects.toThrow('Input too large');
  });
  it('retains multibyte lyrics split between incoming buffers', async () => {
    const bytes = Buffer.from(JSON.stringify({ title: '苦茶子', lyricsText: '同步歌詞' }));
    const req = Readable.from([...bytes].map(byte => Buffer.from([byte]))) as IncomingMessage;
    expect(await readJsonBody(req, 8192)).toEqual({ title: '苦茶子', lyricsText: '同步歌詞' });
  });
  it('limits extension origins to the timeline route', () => {
    const req = request(`chrome-extension://${'a'.repeat(32)}`); req.url = '/browser-media';
    expect(allowLyricRequest(req, response())).toBe(true);
    req.url = '/ai/config'; expect(allowLyricRequest(req, response())).toBe(false);
  });
  it('keeps an isolated QA port limited to loopback', async () => {
    vi.stubEnv('FOLIA_SERVICE_PORT', '13189'); vi.resetModules();
    const isolated = await import('../../../dev/wallpaper/lyrics/http');
    expect(isolated.LYRIC_SERVICE_PORT).toBe(13189);
    expect(isolated.allowLyricRequest(request('null', '127.0.0.1:13189'), response())).toBe(true);
    expect(isolated.allowLyricRequest(request('http://localhost:13189', 'localhost:13189'), response())).toBe(true);
    expect(isolated.allowLyricRequest(request('null', '127.0.0.1:3189'), response())).toBe(false);
    expect(isolated.allowLyricRequest(request('https://example.com', '127.0.0.1:13189'), response())).toBe(false);
  });
  it('rejects invalid or privileged configured ports', async () => {
    for (const value of ['0', '80', '65536', 'NaN', '13189.5']) {
      vi.stubEnv('FOLIA_SERVICE_PORT', value); vi.resetModules();
      await expect(import('../../../dev/wallpaper/lyrics/http')).rejects.toThrow('Invalid loopback service port');
    }
  });
});
