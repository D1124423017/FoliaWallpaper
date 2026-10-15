// src/wallpaper/mediaSources.ts — shared, bounded source selection contract; identifiers never launch programs.
export interface MediaSelection { kind: 'auto' | 'browser' | 'application'; id: string }
export interface MediaSourceOption { kind: 'browser' | 'application'; id: string; label: string; title: string; artist: string; playing: boolean; connected?: boolean }
export interface MediaSourcesSnapshot { app: 'FoliaWallpaperSources'; schema: 1; selection: MediaSelection; sources: MediaSourceOption[] }
export const automaticMediaSelection = (): MediaSelection => ({ kind: 'auto', id: '' });
export function readMediaSelection(value: unknown): MediaSelection | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.kind === 'auto' && data.id === '') return automaticMediaSelection();
  if (data.kind === 'browser' && typeof data.id === 'string' && /^\d{1,12}$/.test(data.id)) return { kind: 'browser', id: data.id };
  if (data.kind === 'application' && typeof data.id === 'string' && data.id.trim() && data.id.length <= 300
    && !/[\u0000-\u001f\u007f]/.test(data.id)) return { kind: 'application', id: data.id };
  return null;
}
export const mediaSelectionKey = (value: MediaSelection): string => JSON.stringify([value.kind, value.id]);
export function isBrowserApplication(value: string): boolean { return /chrome|msedge|edge|firefox|brave|opera|vivaldi/i.test(value); }
