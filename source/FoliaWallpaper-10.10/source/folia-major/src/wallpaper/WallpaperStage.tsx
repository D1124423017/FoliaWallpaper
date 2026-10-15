import { useEffect, useMemo } from 'react';
import VisualizerRenderer from '../components/visualizer/VisualizerRenderer';
import { NO_LYRIC_LINES } from '../utils/lyrics/noLyricLines';
import { useWallpaperMotion } from './useWallpaperMotion';
import type { useWallpaper } from './useWallpaper';
import type { Theme } from '../types';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { useVisualizerAssetStore } from '../stores/useVisualizerAssetStore';
import { wallpaperAppearance } from './appearance';
import { MineradioLayer } from './mineradio/MineradioLayer';
import { wallpaperLyricPresentation } from './lyricPresentation';
import { WallpaperPendingLyrics } from './WallpaperPendingLyrics';

// src/wallpaper/WallpaperStage.tsx — original renderer / typography / backgrounds, new data host.
export function WallpaperStage({ wallpaper, theme }: { wallpaper: ReturnType<typeof useWallpaper>; theme: Theme }) {
  const { controller, host, snapshot, settings } = wallpaper;
  const { source } = snapshot;
  const cover = source.track?.coverUrl ?? null;
  const visual = useVisualizerSettingsStore();
  const assets = useVisualizerAssetStore();
  const appearance = useMemo(() => wallpaperAppearance(visual, assets, settings), [visual, assets, settings]);
  const presentation = wallpaperLyricPresentation(snapshot);
  const lines = presentation.timedLines;
  const motion = useWallpaperMotion(controller, host, lines, settings.offsetSec, settings.audioGain);
  const ambient = (!source.track || source.playerState === 'idle') && !snapshot.audioActive;
  useEffect(() => {
    document.documentElement.style.setProperty('--wallpaper-background', theme.backgroundColor);
    document.documentElement.style.setProperty('--wallpaper-text', theme.primaryColor);
    document.documentElement.style.setProperty('--wallpaper-accent', theme.accentColor);
    document.documentElement.style.setProperty('--text-primary', theme.primaryColor);
    document.documentElement.style.setProperty('--text-secondary', theme.secondaryColor);
  }, [theme]);
  return <div className="wallpaper-stage" data-visual-system={settings.visualSystem} data-visualizer={settings.mode} data-background={settings.background} data-animation-intensity={theme.animationIntensity}>
    {settings.visualSystem === 'mineradio' && <MineradioLayer settings={settings} theme={theme} cover={cover} motion={motion}
      playing={(source.clock.playing || snapshot.audioActive) && !ambient} suspended={snapshot.suspended} />}
    <div className="wallpaper-folia-layer">
    <VisualizerRenderer mode={settings.mode} {...motion}
      lines={snapshot.timelineSeen && !ambient ? lines : NO_LYRIC_LINES}
      theme={theme} subtitleTheme={theme} isDaylight={settings.themeVariant === 'light'} songTitle={source.track?.name} songArtist={source.track?.artist} songAlbum={snapshot.album}
      coverUrl={cover} seed={source.track?.seed ?? 'folia-wallpaper'}
      paused={!(source.clock.playing || snapshot.audioActive) || snapshot.suspended} staticMode={ambient || snapshot.suspended}
      background={{ ...appearance.background, transparent: settings.visualSystem === 'mineradio' }} visualizerTunings={appearance.tunings} visualizerOpacity={visual.visualizerOpacity}
      cappellaCustomAvatarImages={assets.cappellaCustomAvatarImages} cappellaCustomEmojiImages={assets.cappellaCustomEmojiImages}
      monetPortraitImage={assets.monetPortraitImage}
      onCladdaghTuningChange={visual.handleSetCladdaghTuning} onMonetTuningChange={visual.handleSetMonetTuning}
      onPendoloTuningChange={visual.handleSetPendoloTuning} onSonnetTuningChange={visual.handleSetSonnetTuning}
      onTemperaTuningChange={visual.handleSetTemperaTuning} onLumiereTuningChange={visual.handleSetLumiereTuning}
      lyricsFontScale={settings.lyricsScale} subtitleFontScale={settings.lyricsScale}
      isPlayerChromeHidden={true} showText={true} showSubtitleTranslation={true} />
    </div>
    {presentation.mode === 'preview' && <WallpaperPendingLyrics key={source.track?.seed}
      lines={presentation.previewLines} scale={settings.lyricsScale} opacity={visual.visualizerOpacity}
      timelineSeen={snapshot.timelineSeen} />}
  </div>;
}
