import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WallpaperStage } from './WallpaperStage';
import { useWallpaper } from './useWallpaper';

// src/wallpaper/WallpaperApp.tsx — compact desktop stage, no library / login / playback UI.
export default function WallpaperApp() {
  const wallpaper = useWallpaper();
  const { snapshot, host, controller, settings, demo, aiTheme } = wallpaper;
  const { source } = snapshot;
  const { t } = useTranslation();
  const diagnosticRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const update = () => {
      const current = controller.snapshot;
      window.__foliaWallpaperDiagnostics = { build: __APP_VERSION__, native: host.native, title: current.source.track?.name,
        artist: current.source.track?.artist, timelineSeen: current.timelineSeen, timelineSource: current.timelineSource,
        positionSec: controller.getCurrentTimeSec(Date.now()), durationSec: current.source.clock.durationSec, playbackRate: current.playbackRate,
        playing: current.source.clock.playing, lyricStatus: current.lyricStatus, lyricOrigin: current.lyricOrigin, lyricOffsetSec: current.lyricOffsetSec, audioAlignmentStatus: current.audioAlignmentStatus,
        lineCount: current.source.lyrics?.lines.length ?? 0, mode: settings.mode, background: settings.background,
        aiThemeStatus: aiTheme.status, aiThemeName: aiTheme.theme?.[settings.themeVariant].name ?? '', themeSource: settings.aiTheme ? 'ai' : 'cover',
      };
      if (diagnosticRef.current) diagnosticRef.current.textContent = JSON.stringify(window.__foliaWallpaperDiagnostics, null, 2);
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [controller, host, settings.mode, settings.background, settings.aiTheme, settings.themeVariant, snapshot, source, aiTheme]);
  const unalignedStatus = !source.clock.playing ? 'audioPaused'
    : ['disabled', 'unavailable', 'model-error', 'device-error', 'stopped'].includes(snapshot.audioAlignmentStatus) ? 'audioUnavailable'
    : snapshot.audioAlignmentStatus === 'loading' ? 'audioLoading' : 'unaligned';
  const status = !source.track || source.playerState === 'idle' ? 'idle' : !snapshot.timelineSeen ? 'noTimeline'
    : snapshot.lyricStatus === 'unaligned' ? unalignedStatus : snapshot.lyricStatus;
  return <>
    <WallpaperStage wallpaper={wallpaper} />
    {settings.metadata && <aside className="wallpaper-info" data-testid="metadata">
      {source.track?.coverUrl && <img src={source.track.coverUrl} alt="" />}
      <div><strong>{source.track?.name ?? 'Folia'}</strong><span>{source.track?.artist ?? t('wallpaper.waiting')}</span>
        <small data-testid="status">{demo ? t('wallpaper.demo') : t(`wallpaper.${status}`)}
          {!demo && (status === 'word' || status === 'line') && snapshot.lyricOrigin.endsWith(' · duration-unverified')
            ? ` · ${t('wallpaper.unverifiedTimeline')}` : ''}
          {!demo && snapshot.audioAlignmentStatus === 'aligned' ? ` · ${t('wallpaper.audioAligned')}` : ''}</small>
        {settings.aiTheme && !demo && source.track && <small data-testid="ai-status">{t(`wallpaper.ai_${aiTheme.status}`)}
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
