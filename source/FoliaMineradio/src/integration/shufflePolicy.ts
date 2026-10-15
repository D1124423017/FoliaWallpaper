import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import type { IntegrationActions } from './contracts';

// Keep the original three Folia repeat settings intact; this optional presentation policy randomizes each new round.
const STORAGE_KEY = 'folia_integration_shuffle_v1';
let enabled = false;
export const integrationShuffleEnabled = () => enabled;
export function setIntegrationShuffleEnabled(value: boolean) {
  enabled = value;
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* A session still works without persistence. */ }
}
export function startIntegrationShuffle(readActions: () => IntegrationActions): () => void {
  try { enabled = localStorage.getItem(STORAGE_KEY) === 'true' && useAudioSettingsStore.getState().loopMode === 'all'; } catch { enabled = false; }
  let disposed = false, pending = false, previousKey = '', previousIndex = -1;
  const observe = () => {
    const state = usePlaybackStore.getState(), key = state.currentSong ? getPlaybackSongKey(state.currentSong) : '';
    const index = state.playQueue.findIndex(song => getPlaybackSongKey(song) === key);
    const newRound = Boolean(key && key !== previousKey && index === 0 && previousIndex > 0);
    previousKey = key; previousIndex = index;
    if (!enabled || state.activePlaybackContext === 'stage' || !newRound || pending) return;
    pending = true;
    // Finish the core's synchronous track handover before mutating its upcoming queue.
    queueMicrotask(() => {
      pending = false;
      if (disposed || !enabled) return;
      const latest = usePlaybackStore.getState();
      if (latest.activePlaybackContext === 'stage' || !latest.currentSong || getPlaybackSongKey(latest.currentSong) !== key) return;
      const actions = readActions();
      for (let from = latest.playQueue.length - 1; from > 1; from--) {
        const to = 1 + Math.floor(Math.random() * from);
        if (from !== to) actions.moveQueue(from, to);
      }
    });
  };
  observe();
  const unsubscribe = usePlaybackStore.subscribe(observe);
  const unsubscribeAudio = useAudioSettingsStore.subscribe(state => {
    if (enabled && state.loopMode !== 'all') setIntegrationShuffleEnabled(false);
  });
  return () => { disposed = true; unsubscribe(); unsubscribeAudio(); };
}
