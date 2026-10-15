import { createMediaSelectionStore } from './sourceSelection';

// dev/wallpaper/media/preference.ts — one persisted playback preference shared by local routes and observers.
export const mediaSelectionStore = createMediaSelectionStore(process.env.FOLIA_LYRICS_RUNTIME);
