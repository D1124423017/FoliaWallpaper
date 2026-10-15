import { usePlaybackStore, selectDisplaySong, selectDisplayDuration } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import { useAddToPlaylistStore } from '../stores/useAddToPlaylistStore';
import { omni } from '../services/onlineMusic/omni';
import { getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { getIntegrationActions } from './hostActions';
import { setIntegrationShuffleEnabled } from './shufflePolicy';
import { integrationCollections, integrationCollectionSongs, integrationSong, resolveIntegrationSong, searchIntegrationSongs } from './catalog';

// Only known user actions cross the frame boundary; the frame cannot supply arbitrary URLs or credentials.
export async function dispatchIntegrationAction(action: unknown, args: unknown): Promise<unknown> {
  const host = getIntegrationActions(), input = Array.isArray(args) ? args : [args];
  const state = usePlaybackStore.getState();
  if (typeof action !== 'string') throw new Error('無效的操作');
  if (['play', 'pause', 'toggle', 'next', 'previous', 'seek'].includes(action) && host.controlsDisabled)
    throw new Error('目前播放來源不支援此操作');
  if (['queueSong', 'shuffle', 'clearQueue', 'removeQueue', 'moveQueue', 'playMode'].includes(action)
    && state.activePlaybackContext === 'stage') throw new Error('外部播放器的佇列需在來源播放器編輯');
  switch (action) {
    case 'play': host.play(); break;
    case 'pause': host.pause(); break;
    case 'toggle': host.toggle(); break;
    case 'next': host.next(); break;
    case 'previous': host.previous(); break;
    case 'seek': {
      const seconds = Number(input[0]);
      if (!Number.isFinite(seconds)) throw new Error('無效的播放時間');
      const duration = selectDisplayDuration(state);
      host.seek(Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? duration : Infinity, seconds))); break;
    }
    case 'volume': {
      const volume = Number(input[0]);
      if (!Number.isFinite(volume)) throw new Error('無效的音量');
      const audio = useAudioSettingsStore.getState();
      if (audio.isMuted && volume > 0) audio.handleToggleMute();
      audio.handleSetVolume(Math.max(0, Math.min(1, volume))); break;
    }
    case 'playSong': {
      const song = resolveIntegrationSong(input[0]);
      if (input[1] === 'search') {
        const key = getPlaybackSongKey(song);
        await host.playSong(song, [song, ...state.playQueue.filter(item => getPlaybackSongKey(item) !== key)]);
      } else await host.playSong(song);
      break;
    }
    case 'queueSong': {
      const song = resolveIntegrationSong(input[0]);
      const options = input[1];
      if (options && typeof options === 'object' && 'next' in options && options.next === true) host.enqueueNext(song);
      else host.enqueue(song);
      break;
    }
    case 'search': return searchIntegrationSongs(String(input[0] || ''));
    case 'collections': return integrationCollections();
    case 'collectSong': {
      const song = resolveIntegrationSong(input[0]);
      const source = getPlaybackSourceRef(song);
      if (source.kind === 'stage') throw new Error('外部播放歌曲需在來源播放器加入歌單');
      if (source.kind === 'online' && (!omni.canAddSongToPlaylist(song) || !omni.getPlaylistsForSong(song).length))
        throw new Error('此來源目前沒有可加入的歌單，請先登入帳號並同步歌單');
      useAddToPlaylistStore.getState().open(song); break;
    }
    case 'collectionTracks': return (await integrationCollectionSongs(String(input[0]))).map(integrationSong);
    case 'playCollection': {
      const songs = await integrationCollectionSongs(String(input[0]));
      const first = input[1] == null ? songs[0] : songs.find(song => getPlaybackSongKey(song) === input[1]);
      if (input[1] != null && !first) throw new Error('指定歌曲不在這份歌單中，請重新載入歌單');
      if (!first) throw new Error('這份歌單沒有可播放的歌曲');
      await host.playSong(first, songs); break;
    }
    case 'like': {
      const song = input[0] == null ? selectDisplaySong(state) : resolveIntegrationSong(input[0]);
      if (!song) throw new Error('請先選擇歌曲');
      await host.toggleSongLike(song); await integrationCollections();
      return { ok: true, key: getPlaybackSongKey(song), liked: getIntegrationActions().isSongLiked(song) };
    }
    case 'shuffle': host.shuffleQueue(); break;
    case 'clearQueue': host.clearQueue(); break;
    case 'removeQueue': {
      const index = Number(input[0]);
      if (!Number.isInteger(index) || index < 0 || index >= state.playQueue.length) throw new Error('無效的佇列位置');
      host.removeQueue(index); break;
    }
    case 'moveQueue': {
      const from = Number(input[0]), to = Number(input[1]);
      if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < state.playQueue.length))
        throw new Error('無效的佇列位置');
      host.moveQueue(from, to); break;
    }
    case 'playMode': {
      const mode = input[0] === 'order' ? 'off' : input[0] === 'loop' ? 'all' : input[0] === 'single' ? 'one' : input[0];
      if (mode === 'shuffle' || mode === 'off' || mode === 'one' || mode === 'all') {
        const loop = mode === 'shuffle' ? 'all' : mode;
        setIntegrationShuffleEnabled(false);
        const audio = useAudioSettingsStore.getState();
        for (let i = 0; i < 3 && useAudioSettingsStore.getState().loopMode !== loop; i++) audio.handleToggleLoopMode();
        if (mode === 'shuffle') { host.shuffleQueue(); setIntegrationShuffleEnabled(true); }
      } else throw new Error('無效的播放模式');
      break;
    }
    case 'openSettings': {
      const section = input[0] === 'storage' ? 'storage' : input[0] === 'playback' || input[0] === 'track' ? 'playback' : 'appearance';
      useSettingsModalStore.getState().openSettings('options', section); break;
    }
    case 'openAccounts': host.openAccounts(); break;
    case 'home': host.navigateToHome(); break;
    default: throw new Error(`不支援的操作：${action}`);
  }
  return { ok: true, song: selectDisplaySong(usePlaybackStore.getState())?.name || null };
}
