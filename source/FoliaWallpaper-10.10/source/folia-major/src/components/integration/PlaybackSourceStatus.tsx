import { usePlaybackStore, selectDisplaySong, selectDisplayLyrics } from '../../stores/usePlaybackStore';
import { useEffect, useState } from 'react';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { omni } from '../../services/onlineMusic/omni';

// Expose source and lyric readiness so direct playback and external following are distinguishable.
export default function PlaybackSourceStatus({ loading = false }: { loading?: boolean }) {
  const context = usePlaybackStore(state => state.activePlaybackContext);
  const song = usePlaybackStore(selectDisplaySong);
  const lyrics = usePlaybackStore(selectDisplayLyrics);
  const timed = lyrics?.lines.some(line => line.endTime > line.startTime && line.startTime > 0);
  const audio = usePlaybackStore(state => state.audioSrc);
  const [sharing, setSharing] = useState('');
  useEffect(() => {
    if (!window.electron?.getIntegrationWallpaperStatus) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const value = await window.electron!.getIntegrationWallpaperStatus!();
        if (!stopped) setSharing(value.running ? value.sharing ? '桌布資料已就緒' : '桌布資料等待中' : '桌布資料輸出未啟動');
      } catch { if (!stopped) setSharing(''); }
      if (!stopped) timer = setTimeout(() => void poll(), 2000);
    };
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, []);
  const status = !song ? '尚未播放' : loading ? '正在取得歌詞' : !lyrics?.lines.length ? '未取得歌詞' : timed ? '同步歌詞' : '文字歌詞';
  const source = song ? getPlaybackSourceRef(song) : null;
  const provider = source?.kind === 'online' ? omni.getProviderLabel(source.providerId) : source?.kind === 'local' ? '本機音樂'
    : source?.kind === 'navidrome' ? 'Navidrome' : source?.kind === 'stage' ? '外部來源' : '';
  const lyricSource = song?.onlineLyricsState?.lyricsSource === 'imported' ? '匯入歌詞'
    : song?.onlineLyricsState?.matchedLyricsSource || (lyrics?.lines.length ? 'Folia 已解析歌詞' : '');
  const detail = [context === 'stage' ? '跟隨外部播放器' : '播放器直接播放', provider, status,
    context === 'stage' ? '外部時間軸' : audio ? 'Folia 音訊時鐘' : '尚無音訊時鐘', lyricSource, sharing].filter(Boolean).join(' · ');
  return <div role="status" data-testid="playback-source-status" style={{ position: 'absolute', bottom: 10, left: 14,
    zIndex: 100, pointerEvents: 'none', fontSize: 11, padding: '4px 8px', borderRadius: 8,
    color: '#eee', background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)', maxWidth: 'min(650px, 75vw)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail}>
    {detail}
  </div>;
}
