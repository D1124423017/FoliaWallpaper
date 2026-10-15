import { useEffect, useRef } from 'react';
import { PlayerState, type Theme } from '../types';
import { usePlaybackStore, selectDisplaySong, selectDisplayCoverUrl, selectDisplayDuration,
  selectDisplayLyrics, selectDisplayPlayerState } from '../stores/usePlaybackStore';
import { currentTime, lyricCurrentTime } from '../stores/motionSignals';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { getProviderSongMetadata, getSongArtistLabel } from '../services/onlineMusic/songMetadata';
import { integrationAudioSnapshot } from './audio';
import type { SharedPlaybackSnapshot } from './wallpaperContracts';

// The long-lived player publishes the same parsed lyric object and clocks to the desktop companion.
export function useWallpaperPublisher(theme: Theme, loading: boolean, clock: {
  getDisplayElement: () => HTMLAudioElement | null; lyricOffsetMs: number;
}) {
  const latest = useRef({ theme, loading, clock }); latest.current = { theme, loading, clock };
  useEffect(() => {
    const publish = window.electron?.publishIntegrationWallpaper;
    if (!publish) return;
    let stopped = false, coverKey = '', inlineCover: string | null = null, coverJob: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const resolveCover = (cover: string | null) => {
      if (coverKey === (cover || '')) return;
      coverJob?.abort(); coverKey = cover || ''; inlineCover = cover?.startsWith('data:image/') ? cover : null;
      if (!cover || inlineCover) return;
      const job = coverJob = new AbortController();
      void fetch(cover, { signal: AbortSignal.any([job.signal, AbortSignal.timeout(5000)]) }).then(async response => {
        if (!response.ok) return;
        const blob = await response.blob();
        if (blob.size > 500000 || !/^image\/(?:png|jpeg|webp)$/.test(blob.type)) return;
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Cover unavailable')); reader.readAsDataURL(blob);
        });
        if (!stopped && !job.signal.aborted) inlineCover = data;
      }).catch(() => { /* The public cover URL remains available when CORS prevents an inline copy. */ });
    };
    const tick = () => {
      const state = usePlaybackStore.getState(), selected = selectDisplaySong(state), lyrics = selectDisplayLyrics(state);
      const direct = state.activePlaybackContext === 'main';
      const song = direct ? selected : null;
      const cover = song ? selectDisplayCoverUrl(state) : null;
      resolveCover(cover);
      const metadata = song ? getProviderSongMetadata(song) : null;
      const source = song ? getPlaybackSourceRef(song) : null;
      const provider = source?.kind === 'online' ? source.providerId : source?.kind || '';
      const element = latest.current.clock.getDisplayElement();
      const position = element && Number.isFinite(element.currentTime) ? element.currentTime : currentTime.get();
      const lyricSource = song?.onlineLyricsState?.lyricsSource === 'imported' ? '匯入歌詞'
        : song?.onlineLyricsState?.matchedLyricsSource || (lyrics?.lines.length ? 'Folia 已解析歌詞' : '');
      const snapshot: SharedPlaybackSnapshot = {
        app: 'FoliaMineradioPlayer', schema: 1, capturedAt: Date.now(), playbackSource: direct ? 'direct' : 'external',
        song: song ? { key: getPlaybackSongKey(song), title: song.name, artist: getSongArtistLabel(song),
          album: metadata?.album?.name || '', cover: inlineCover || (/^https?:/.test(cover || '') ? cover : null), provider } : null,
        clock: { positionSec: Math.max(0, position), lyricPositionSec: Math.max(0, direct
            ? position - latest.current.clock.lyricOffsetMs / 1000 : lyricCurrentTime.get()),
          durationSec: Math.max(0, selectDisplayDuration(state)), playing: !!song && selectDisplayPlayerState(state) === PlayerState.PLAYING },
        lyrics: song ? lyrics : null, theme: latest.current.theme, audio: integrationAudioSnapshot(),
        sources: { music: provider, lyrics: String(lyricSource), timeline: direct ? 'Folia 音訊時鐘' : '外部播放器',
          lyricsStatus: !song ? 'idle' : latest.current.loading ? 'loading' : !lyrics?.lines.length ? 'missing'
            : lyrics.isWordByWord ? 'word' : lyrics.lines.some(line => line.endTime > line.startTime) ? 'line' : 'text' },
      };
      publish(snapshot);
    };
    void window.electron?.getIntegrationWallpaperStatus?.().then(() => {
      if (!stopped) { tick(); timer = setInterval(tick, 250); }
    }).catch(() => { /* The original Folia build has no integration feed. */ });
    return () => { stopped = true; if (timer) clearInterval(timer); coverJob?.abort(); };
  }, []);
}
