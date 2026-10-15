import { initialWebLyricSourceState } from '../types/webLyricSource';
import type { SharedPlaybackSnapshot } from '../integration/wallpaperContracts';
import type { WallpaperSnapshot } from './types';

// Preserve the original Folia lyric object and its offset-corrected clock, without another search or ASR job.
export function applyPlayerSnapshot(previous: WallpaperSnapshot, data: SharedPlaybackSnapshot): WallpaperSnapshot {
  const song = data.song;
  const sameTrack = previous.mediaSource === 'player' && previous.source.track?.seed === song?.key;
  return { ...previous, mediaSource: 'player', timelineSource: song ? 'player' : 'none',
    timelineSeen: !!song, companionUpdatedAtMs: data.capturedAt, playbackRate: 1,
    playerTheme: data.theme, playerPositionSec: data.clock.positionSec, playerSources: data.sources,
    source: { ...initialWebLyricSourceState(), connectionStatus: 'connected',
      track: song ? sameTrack && previous.source.track?.coverUrl === song.cover ? previous.source.track
        : { name: song.title, artist: song.artist, coverUrl: song.cover, seed: song.key } : null,
      lyrics: data.lyrics, playerState: song ? data.clock.playing ? 'playing' : 'paused' : 'idle',
      clock: { positionSec: data.clock.lyricPositionSec, durationSec: data.clock.durationSec,
        anchoredAtMs: data.capturedAt, playing: !!song && data.clock.playing } },
    album: song?.album || '', lyricOrigin: data.sources.lyrics || 'Folia 播放器', lyricOffsetSec: 0,
    lyricStatus: !song ? 'idle' : data.lyrics?.lines.length
      ? data.sources.lyricsStatus === 'text' || !data.lyrics.lines.some(line => line.endTime > line.startTime) ? 'text' : data.lyrics.isWordByWord ? 'word' : 'line'
      : data.sources.lyricsStatus === 'loading' ? 'loading' : 'missing',
    audioAlignmentStatus: 'off', audioAlignmentMethod: undefined };
}
