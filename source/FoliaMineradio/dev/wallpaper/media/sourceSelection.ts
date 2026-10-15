import fs from 'node:fs';
import path from 'node:path';
import type { BrowserMedia } from '../browserMedia';
import { selectSystemMedia, type SystemMedia } from './select';
import { automaticMediaSelection, readMediaSelection, type MediaSelection } from '../../../src/wallpaper/mediaSources';

// dev/wallpaper/media/sourceSelection.ts — pin one live tab/app and persist that choice independently of visual presets.
export interface BrowserSource { id: string; media: BrowserMedia }
export function selectConfiguredMedia(sessions: SystemMedia[], browser: BrowserSource[], selection: MediaSelection, now: number): SystemMedia | null {
  if (selection.kind === 'auto') return selectSystemMedia(sessions, browser.map(value => value.media), now);
  const windows = sessions.filter(value => now - value.at <= 4000);
  const tabs = browser.filter(value => now - value.media.at <= 4000);
  if (selection.kind === 'application') {
    const selected = windows.filter(value => value.app === selection.id);
    if (!selected.length) return null;
    // A paused, explicitly selected app stays paused. Only an exact browser song may lend its clock.
    const matching = /chrome|edge|firefox|youtube/i.test(selection.id) ? tabs.filter(({ media }) => selected.some(value =>
      value.title === media.title && artistKey(value.artist) === artistKey(media.artist))) : [];
    return selectSystemMedia(selected, matching.map(value => value.media), now);
  }
  const tab = tabs.find(value => value.id === selection.id)?.media;
  if (!tab) return null;
  const matching = windows.filter(value => /chrome|edge|firefox|youtube/i.test(value.app)
    && value.title === tab.title && artistKey(value.artist) === artistKey(tab.artist));
  return selectSystemMedia(matching, [tab], now);
}
const artistKey = (value: string) => value.replace(/VEVO$|\s*-\s*Topic$/iu, '').trim().toLocaleLowerCase();
export function createMediaSelectionStore(folder: string | undefined) {
  const file = folder ? path.join(folder, 'media-source.json') : null;
  let selection = automaticMediaSelection();
  if (file) try {
    if (fs.statSync(file).size <= 4096) selection = readMediaSelection(JSON.parse(fs.readFileSync(file, 'utf8'))) ?? selection;
  } catch { /* A missing/corrupt local preference starts with automatic selection. */ }
  return { get: () => ({ ...selection }), set: (value: unknown) => {
    const next = readMediaSelection(value);
    if (!next) throw new TypeError('Invalid media selection');
    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
    }
    selection = next;
    return { ...selection };
  } };
}
