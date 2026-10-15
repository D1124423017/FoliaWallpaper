import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the shipped original-view adapter: state changes must reach native list renders without changing user preferences.
function runtime(shelf = 'off') {
  let mode = shelf;
  const window: any = { fx: { particleLyrics: false, shelf, shelfPinnedOpen: true, shelfPresence: 'always' },
    lyricsVisible: false, likedSongMap: {}, songAccountStateKey: (song: any) => `${song.source}:${song.id}`,
    shelfManager: { getMode: () => mode, setMode: vi.fn((next: string) => { mode = next; window.fx.shelfPinnedOpen = false; window.fx.shelfPresence = 'auto'; }) },
    setShelfPinnedOpen: vi.fn((pinned: boolean) => { window.fx.shelfPinnedOpen = pinned; }), setShelfMode: vi.fn(),
    trackSwitchToken: 0, uniforms: { uHasCover: { value: 0 } }, $results: { classList: { contains: () => true } } };
  for (const name of ['updateLikeButtons', 'safeShelfRebuild', 'renderLyrics', 'setPlayIcon', 'updateVolumeUi',
    'updatePlaybackProgressUi', 'safeRenderQueuePanel', 'renderUserPlaylistsList', 'refreshSearchResultActionStates']) window[name] = vi.fn();
  const bridge: any = { snapshot: { playing: false }, safeCover: (value: string) => value, errors: [], disposed: false, suspended: false, request: vi.fn() };
  const context = vm.createContext({ window, document: { getElementById: () => null, body: { classList: { toggle: () => {} } } },
    performance: { now: () => 0 }, EventTarget, Event, Image: class {} });
  vm.runInContext(readFileSync('dev/integration/mineradio/bridge-state.js', 'utf8'), context);
  const state = window.installFoliaMineradioState(bridge);
  vm.runInContext(readFileSync('dev/integration/mineradio/bridge-actions.js', 'utf8'), context);
  window.installFoliaMineradioActions(bridge);
  const snapshot = (patch: object = {}) => ({ song: null, queue: [], position: 0, lyricPosition: 0, playing: false, volume: 1, lyrics: [], collections: [], presentation: {}, theme: {}, ...patch });
  return { window, bridge, state, snapshot };
}
const row = { key: 'online:netease:42', name: 'Selected', artist: 'Artist', source: 'netease', duration: 240, liked: false };
describe('original Mineradio state updates', () => {
  it('refreshes a non-current queue favorite and a searched-row favorite from the authoritative host result', async () => {
    const { window, state, snapshot, bridge } = runtime();
    state.update(snapshot({ queue: [row] }), true, true);
    state.update(snapshot({ queue: [{ ...row, liked: true }] }), true, true);
    expect(window.playQueue[0].liked).toBe(true);
    expect(window.likedSongMap['netease:online:netease:42']).toBe(true);
    const searched = { ...row, key: 'online:qq:42', source: 'qq' };
    bridge.request.mockResolvedValue({ ok: true, key: searched.key, liked: true });
    await window.toggleLikeSong(searched);
    expect(window.likedSongMap['qq:online:qq:42']).toBe(true);
    expect(window.refreshSearchResultActionStates).toHaveBeenCalledOnce();
    expect(window.likedSongMap['netease:online:netease:42']).toBe(true);
  });
  it('refreshes the native 2D playlist list once when collection data changes', () => {
    const { window, state, snapshot } = runtime();
    const data = snapshot({ collections: [{ key: 'local:playlist:one', name: 'My playlist', cover: '', count: 1 }] });
    state.update(data, true, true); state.update(data, true, true);
    expect(window.userPlaylists[0]).toMatchObject({ id: 'local:playlist:one', name: 'My playlist', trackCount: 1 });
    expect(window.renderUserPlaylistsList).toHaveBeenCalledOnce();
  });
  it('keeps user-off unchanged and masks a pinned shelf without changing its saved mode or presence', () => {
    const off = runtime(); off.state.update(off.snapshot(), true, true);
    expect(off.window.shelfManager.getMode()).toBe('off'); expect(off.window.setShelfMode).not.toHaveBeenCalled();
    const { window, state, snapshot } = runtime('side');
    state.update(snapshot({ presentation: { showShelf: false } }), true, true);
    expect(window.shelfManager.getMode()).toBe('off');
    expect(window.fx).toMatchObject({ shelf: 'side', shelfPinnedOpen: true, shelfPresence: 'always' });
    state.update(snapshot({ presentation: { showShelf: true } }), true, true);
    expect(window.shelfManager.getMode()).toBe('side');
    expect(window.setShelfPinnedOpen).toHaveBeenCalledWith(true, true, false);
    expect(window.fx.shelfPresence).toBe('always');
  });
});
