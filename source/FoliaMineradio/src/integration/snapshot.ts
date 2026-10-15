import { PlayerState, type Theme } from '../types';
import { currentTime, lyricCurrentTime } from '../stores/motionSignals';
import { usePlaybackStore, selectDisplaySong, selectDisplayLyrics, selectDisplayCoverUrl,
  selectDisplayDuration, selectDisplayPlayerState } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { omni } from '../services/onlineMusic/omni';
import { integrationSong, integrationCollectionSnapshot } from './catalog';
import { getIntegrationActions } from './hostActions';
import type { IntegrationSnapshot } from './contracts';
import { integrationAudioSnapshot } from './audio';
import { integrationShuffleEnabled } from './shufflePolicy';
import { integrationDisplayCover } from './displayCover';

// Pull continuous clocks at the frame boundary; they never become React state.
export function integrationSnapshot(theme: Theme, presentation: IntegrationSnapshot['presentation']): IntegrationSnapshot {
  const state = usePlaybackStore.getState(), song = selectDisplaySong(state);
  const output = useAudioSettingsStore.getState(), actions = getIntegrationActions();
  const normalized = song ? integrationSong(song) : null;
  if (normalized) normalized.picurl = integrationDisplayCover(selectDisplayCoverUrl(state)) || normalized.picurl;
  return { song: normalized, queue: state.playQueue.map(integrationSong),
    position: currentTime.get(), lyricPosition: lyricCurrentTime.get(), duration: selectDisplayDuration(state),
    playing: selectDisplayPlayerState(state) === PlayerState.PLAYING,
    volume: output.isMuted ? 0 : output.volume, liked: actions.isLiked, loopMode: output.loopMode, shuffleEnabled: integrationShuffleEnabled(),
    controlsDisabled: actions.controlsDisabled, playbackSource: state.activePlaybackContext === 'stage' ? 'external' : 'direct',
    lyrics: (selectDisplayLyrics(state)?.lines || []).map(line => ({ time: line.startTime,
      endTime: line.endTime, text: line.fullText, translation: line.translation,
      words: line.words.map(word => ({ time: word.startTime, endTime: word.endTime, text: word.text })) })),
    theme: { primary: theme.primaryColor, secondary: theme.secondaryColor, accent: theme.accentColor, background: theme.backgroundColor },
    audio: integrationAudioSnapshot(),
    accounts: omni.getProviderSummaries().map(account => ({ providerId: account.providerId,
      name: account.user?.nickname || account.displayName, connected: account.status === 'authenticated' })),
    collections: integrationCollectionSnapshot(), presentation, suspended: document.hidden };
}
