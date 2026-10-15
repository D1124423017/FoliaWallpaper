import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleBrowserMedia, browserSourceOptions, freshBrowserSources } from '../../../dev/wallpaper/browserMedia';
import { mediaSelectionStore } from '../../../dev/wallpaper/media/preference';

// test/unit/wallpaper/browserSourceLifecycle.test.ts — keep paused tabs selectable, but never extrapolate a stale clock.
const token = 'a'.repeat(64);
let directory: string | undefined;
async function request(data: unknown, authorization = token) {
  if (!directory) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-tabs-'));
    fs.writeFileSync(path.join(directory, 'timeline-token'), token);
    vi.stubEnv('FOLIA_LYRICS_RUNTIME', directory);
  }
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(data))]), { url: '/browser-media', method: 'POST',
    headers: { 'x-folia-timeline-token': authorization } }) as unknown as IncomingMessage;
  let status = 0;
  const res = { writeHead(value: number) { status = value; return res; }, end() { return res; } } as unknown as ServerResponse;
  await handleBrowserMedia(req, res); return status;
}
afterEach(async () => {
  for (const id of ['4201', '4202']) await request({ type: 'forget-tab', id });
  mediaSelectionStore.set({ kind: 'auto', id: '' });
  vi.unstubAllEnvs(); vi.useRealTimers();
  if (directory) {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('folia-tabs-')) throw new Error('Unsafe cleanup');
    fs.rmSync(resolved, { recursive: true, force: true }); directory = undefined;
  }
});
describe('browser tab lifecycle', () => {
  it('keeps a throttled/paused tab in the picker but expires its usable timeline', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    expect(await request({ id: '4201', title: 'Song', artist: 'Singer', site: 'www.youtube.com', position: 25, duration: 200, playing: false })).toBe(200);
    expect(browserSourceOptions(10000).find(value => value.id === '4201')?.connected).toBe(true);
    expect(freshBrowserSources(15000).some(value => value.id === '4201')).toBe(false);
    expect(browserSourceOptions(15000).find(value => value.id === '4201')).toMatchObject({ title: 'Song', connected: false, playing: false });
    expect(browserSourceOptions(190001).some(value => value.id === '4201')).toBe(false);
  });
  it('keeps option order stable as different tabs pause, resume or report more recently', async () => {
    const packet = (id: string, playing: boolean) => ({ id, title: id, artist: '', position: 1, duration: 200, playing });
    await request(packet('4201', false)); await request(packet('4202', true));
    const first = browserSourceOptions(Date.now()).map(value => value.id);
    await request(packet('4201', true)); await request(packet('4202', false));
    expect(browserSourceOptions(Date.now()).map(value => value.id)).toEqual(first);
  });
  it('supports authenticated explicit tab selection and removes closed tabs immediately', async () => {
    expect(await request({ type: 'pin-tab', id: '4201' })).toBe(200);
    expect(mediaSelectionStore.get()).toEqual({ kind: 'browser', id: '4201' });
    expect(await request({ type: 'pin-tab', id: 'bad' })).toBe(400);
    expect(await request({ type: 'pin-tab', id: '4202' }, 'b'.repeat(64))).toBe(403);
    expect(mediaSelectionStore.get().id).toBe('4201');
    await request({ id: '4201', title: 'Song', artist: '', position: 1, duration: 200, playing: false });
    await request({ type: 'forget-tab', id: '4201' });
    expect(browserSourceOptions(Date.now()).some(value => value.id === '4201')).toBe(false);
    expect(mediaSelectionStore.get().id).toBe('4201');
  });
});
