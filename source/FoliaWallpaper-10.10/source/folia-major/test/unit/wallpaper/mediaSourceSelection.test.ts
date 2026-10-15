import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMediaSelectionStore, selectConfiguredMedia } from '../../../dev/wallpaper/media/sourceSelection';
import { readMediaSelection } from '../../../src/wallpaper/mediaSources';
import { applyWallpaperEvent, initialWallpaperSnapshot, wallpaperCurrentTimeSec } from '../../../src/wallpaper/model';
import type { SystemMedia } from '../../../dev/wallpaper/media/select';

// test/unit/wallpaper/mediaSourceSelection.test.ts — explicit choice wins over unrelated playback and survives restart.
const media = (changes: Partial<SystemMedia> = {}): SystemMedia => ({ title: 'Song', artist: 'Singer', album: '', app: 'Spotify',
  current: true, playing: true, position: 20, duration: 200, playbackRate: 1, at: 1000, cover: null, origin: 'system', timelineAvailable: true, ...changes });
describe('explicit playback source', () => {
  it('keeps the selected paused native app rather than a playing browser', () => {
    const selected = selectConfiguredMedia([media({ playing: false }), media({ app: 'Chrome', title: 'Other' })],
      [{ id: '42', media: media({ title: 'Other' }) }], { kind: 'application', id: 'Spotify' }, 1000);
    expect(selected?.title).toBe('Song'); expect(selected?.playing).toBe(false); expect(selected?.origin).toBe('system');
  });
  it('returns no track when the selected app or tab is missing or stale', () => {
    expect(selectConfiguredMedia([media()], [], { kind: 'application', id: 'VLC' }, 1000)).toBeNull();
    expect(selectConfiguredMedia([media()], [{ id: '41', media: media() }], { kind: 'browser', id: '42' }, 1000)).toBeNull();
    expect(selectConfiguredMedia([media()], [{ id: '42', media: media() }], { kind: 'browser', id: '42' }, 6001)).toBeNull();
  });
  it('follows autoplay in the selected tab without borrowing another app clock or cover', () => {
    const selection = { kind: 'browser' as const, id: '42' };
    const tabs = [{ id: '42', media: media({ position: 71, playing: false }) }, { id: '43', media: media({ title: 'Other' }) }];
    const selected = selectConfiguredMedia([media({ cover: 'data:image/png;base64,YQ==' })], tabs, selection, 1000);
    expect(selected?.position).toBe(71); expect(selected?.playing).toBe(false); expect(selected?.cover).toBeNull();
    tabs[0].media = media({ title: 'Next song', position: 1 });
    expect(selectConfiguredMedia([], tabs, selection, 1000)?.title).toBe('Next song');
  });
  it('can select a generic connected HTML media page by tab id', () => {
    const selected = selectConfiguredMedia([], [{ id: '42', media: { ...media(), site: 'example.com' } }], { kind: 'browser', id: '42' }, 1000);
    expect(selected?.origin).toBe('browser'); expect(selected?.position).toBe(20);
  });
  it('preserves an exact matching browser cover and ignores unrelated Windows media', () => {
    const chosen = selectConfiguredMedia([media({ app: 'Chrome', artist: 'SingerVEVO', position: 2, cover: 'data:image/png;base64,YQ==' }),
      media({ app: 'VLC', title: 'Other' })], [{ id: '42', media: media({ position: 88 }) }], { kind: 'browser', id: '42' }, 1000);
    expect(chosen?.cover).toBe('data:image/png;base64,YQ=='); expect(chosen?.position).toBe(88);
  });
  it('keeps a selected Chrome session paused when another tab plays a different song', () => {
    const selected = selectConfiguredMedia([media({ app: 'Chrome', playing: false })],
      [{ id: '42', media: media({ title: 'Other' }) }], { kind: 'application', id: 'Chrome' }, 1000);
    expect(selected?.playing).toBe(false); expect(selected?.title).toBe('Song');
  });
  it('blocks native metadata and the old browser relay while a manual source is offline', () => {
    let state = applyWallpaperEvent(initialWallpaperSnapshot(), { type: 'metadata', data: { title: 'Native song', artist: '' }, at: 1000 });
    state = applyWallpaperEvent(state, { type: 'source-selection', data: true, at: 1000 });
    state = applyWallpaperEvent(state, { type: 'system-media', data: null, at: 1000 });
    expect(state.source.track).toBeNull();
    for (const type of ['metadata', 'thumbnail', 'playback', 'timeline', 'browser-timeline'])
      expect(applyWallpaperEvent(state, { type, data: { title: 'Wrong', state: 'playing', position: 120 }, at: 9000 })).toBe(state);
    state = applyWallpaperEvent(state, { type: 'system-media', data: media({ playing: false }), at: 1000 });
    expect(wallpaperCurrentTimeSec(state, 6000)).toBe(20);
    state = applyWallpaperEvent(state, { type: 'source-selection', data: false, at: 9000 });
    expect(applyWallpaperEvent(state, { type: 'metadata', data: { title: 'Native recovery' }, at: 9000 }).source.track?.name).toBe('Native recovery');
  });
  it('validates bounded identifiers and persists without storing song data', () => {
    for (const invalid of [{ kind: 'other', id: '42' }, { kind: 'browser', id: 'https://example.com' }, { kind: 'auto', id: '42' },
      { kind: 'application', id: '' }, { kind: 'application', id: 'a\nb' }]) expect(readMediaSelection(invalid)).toBeNull();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-sources-'));
    try {
      const store = createMediaSelectionStore(folder);
      expect(store.get()).toEqual({ kind: 'auto', id: '' });
      store.set({ kind: 'browser', id: '42', title: 'Not saved' });
      expect(createMediaSelectionStore(folder).get()).toEqual({ kind: 'browser', id: '42' });
      expect(fs.readFileSync(path.join(folder, 'media-source.json'), 'utf8')).not.toContain('Not saved');
      expect(() => store.set({ kind: 'bad', id: '' })).toThrow();
      expect(store.get().id).toBe('42');
      fs.writeFileSync(path.join(folder, 'media-source.json'), '{bad');
      expect(createMediaSelectionStore(folder).get()).toEqual({ kind: 'auto', id: '' });
    } finally {
      const resolved = path.resolve(folder);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('folia-sources-')) throw new Error('Unsafe test cleanup');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });
});
