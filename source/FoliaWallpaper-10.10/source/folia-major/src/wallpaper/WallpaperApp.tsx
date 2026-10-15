import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WallpaperStage } from './WallpaperStage';
import { useWallpaper } from './useWallpaper';
import { useWallpaperTheme } from './useWallpaperTheme';
import { useWallpaperAssets } from './useWallpaperAssets';
import { WallpaperControls } from './WallpaperControls';
import { wallpaperLyricPresentation } from './lyricPresentation';

// src/wallpaper/WallpaperApp.tsx — compact desktop stage, no library / login / playback UI.
export default function WallpaperApp() {
  const wallpaper = useWallpaper();
  const theme = useWallpaperTheme(wallpaper);
  useWallpaperAssets();
  const { snapshot, host, controller, settings, demo, aiTheme } = wallpaper;
  const { source } = snapshot;
  const { t } = useTranslation();
  const diagnosticRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const update = () => {
      const current = controller.snapshot;
      window.__foliaWallpaperDiagnostics = { build: __APP_VERSION__, native: host.native, title: current.source.track?.name,
        artist: current.source.track?.artist, timelineSeen: current.timelineSeen, timelineSource: current.timelineSource, mediaSource: current.mediaSource, audioActive: current.audioActive,
        positionSec: controller.getCurrentTimeSec(Date.now()), durationSec: current.source.clock.durationSec, playbackRate: current.playbackRate,
        playing: current.source.clock.playing, lyricStatus: current.lyricStatus, lyricOrigin: current.lyricOrigin, lyricOffsetSec: current.lyricOffsetSec, audioAlignmentStatus: current.audioAlignmentStatus,
        audioAlignmentMethod: current.audioAlignmentMethod,
        lineCount: current.source.lyrics?.lines.length ?? 0, lyricDisplay: wallpaperLyricPresentation(current).mode,
        animatedLineCount: wallpaperLyricPresentation(current).timedLines.length, mode: settings.mode, background: settings.background,
        aiThemeStatus: aiTheme.status, aiThemeName: aiTheme.theme?.[settings.themeVariant].name ?? '', themeSource: settings.aiTheme ? 'ai' : 'cover',
        animationIntensity: theme.animationIntensity,
        visualSystem: settings.visualSystem, mineradioPreset: settings.mineradioPreset,
      };
      if (diagnosticRef.current) diagnosticRef.current.textContent = JSON.stringify(window.__foliaWallpaperDiagnostics, null, 2);
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [controller, host, settings.mode, settings.background, settings.aiTheme, settings.themeVariant, settings.visualSystem, settings.mineradioPreset, snapshot, source, aiTheme, theme.animationIntensity]);
  const unalignedStatus = !source.clock.playing ? 'audioPaused'
    : snapshot.audioAlignmentStatus === 'gemini-requesting' ? 'audioGemini'
    : ['disabled', 'unavailable', 'model-error', 'device-error', 'stopped'].includes(snapshot.audioAlignmentStatus) ? 'audioUnavailable'
    : snapshot.audioAlignmentStatus === 'loading' ? 'audioLoading' : 'unaligned';
  const unidentifiedAudio = snapshot.audioActive && (!source.track || source.playerState !== 'playing');
  const status = unidentifiedAudio ? 'audioOnly' : !source.track || source.playerState === 'idle' ? 'idle' : !snapshot.timelineSeen ? source.lyrics?.lines.length ? 'lyricsNoTimeline' : 'noTimeline'
    : snapshot.lyricStatus === 'unaligned' ? unalignedStatus : snapshot.lyricStatus;
  return <>
    <WallpaperStage wallpaper={wallpaper} theme={theme} />
    <WallpaperControls settings={settings} theme={theme} track={source.track} />
    {settings.metadata && <aside className="wallpaper-info" data-testid="metadata">
      {!unidentifiedAudio && source.track?.coverUrl && <img src={source.track.coverUrl} alt="" />}
      <div><strong>{unidentifiedAudio ? 'Folia' : source.track?.name ?? 'Folia'}</strong><span>{unidentifiedAudio ? t('wallpaper.systemAudio') : source.track?.artist ?? t('wallpaper.waiting')}</span>
        <small data-testid="status">{demo ? t('wallpaper.demo') : t(`wallpaper.${status}`)}
          {!demo && (status === 'word' || status === 'line') && snapshot.lyricOrigin.endsWith(' · duration-unverified')
            ? ` · ${t('wallpaper.unverifiedTimeline')}` : ''}
          {!demo && snapshot.audioAlignmentStatus === 'aligned' ? ` · ${t(snapshot.audioAlignmentMethod === 'gemini' ? 'wallpaper.audioAlignedGemini' : 'wallpaper.audioAligned')}` : ''}</small>
        {!demo && source.track && <small data-testid="source-detail">
        {snapshot.mediaSource === 'player'
          ? `播放器直接播放 · 音樂：${snapshot.playerSources?.music || 'Folia'} · 歌詞：${snapshot.lyricOrigin || '等待歌詞'} · 時間軸：Folia 音訊時鐘`
          : `桌布跟隨外部播放器 · 歌詞：${snapshot.lyricOrigin || '等待歌詞'} · 時間軸：${({ native: 'Wallpaper Engine', browser: '瀏覽器', system: 'Windows 媒體', none: '未提供', player: 'Folia 音訊' })[snapshot.timelineSource]}`}
        </small>}
        {settings.aiTheme && !demo && source.track && snapshot.mediaSource !== 'player' && <small data-testid="ai-status">{t(`wallpaper.ai_${aiTheme.status}`)}
          {aiTheme.status === 'ready' ? `：${aiTheme.theme?.[settings.themeVariant].name ?? ''}` : ''}</small>}</div>
    </aside>}
    {settings.diagnostics && <pre ref={diagnosticRef} className="wallpaper-diagnostics" />}
    {!host.native && <div className="wallpaper-preview">
      <span>{t('wallpaper.preview')}</span>
      {!demo && <a href="?demo=1">{t('wallpaper.openDemo')}</a>}
      {demo && <>
        <button onClick={() => controller.apply({ type: 'playback', data: { state: source.playerState === 'playing' ? 'paused' : 'playing' }, at: Date.now() })}>{t('wallpaper.pauseResume')}</button>
        <button onClick={() => controller.apply({ type: 'timeline', data: { position: 17, duration: 50 }, at: Date.now() })}>{t('wallpaper.seek')}</button>
      </>}
    </div>}
  </>;
}
