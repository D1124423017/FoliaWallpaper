import { useEffect, useState } from 'react';
import VisualizerRenderer from '../components/visualizer/VisualizerRenderer';
import { generateBuiltinDualTheme } from '../utils/builtinTheme/generateBuiltinDualTheme';
import { extractColors } from '../utils/colorExtractor';
import { NO_LYRIC_LINES } from '../utils/lyrics/noLyricLines';
import { selectWallpaperTheme } from './aiTheme';
import { useWallpaperMotion } from './useWallpaperMotion';
import type { useWallpaper } from './useWallpaper';

// src/wallpaper/WallpaperStage.tsx — original renderer / typography / backgrounds, new data host.
export function WallpaperStage({ wallpaper }: { wallpaper: ReturnType<typeof useWallpaper> }) {
  const { controller, host, snapshot, settings } = wallpaper;
  const { source } = snapshot;
  const cover = source.track?.coverUrl ?? null;
  const [baseTheme, setBaseTheme] = useState(() => generateBuiltinDualTheme());
  const theme = selectWallpaperTheme(baseTheme, wallpaper.aiTheme, String(source.track?.seed ?? ''), settings.aiTheme && !wallpaper.demo, settings.themeVariant);
  useEffect(() => {
    let cancelled = false;
    if (!cover) { setBaseTheme(generateBuiltinDualTheme()); return; }
    void extractColors(cover, 5).then(colors => {
      if (!cancelled) setBaseTheme(generateBuiltinDualTheme({ coverColors: colors }));
    }).catch(() => { if (!cancelled) setBaseTheme(generateBuiltinDualTheme()); });
    return () => { cancelled = true; };
  }, [cover, source.track?.seed]);
  const lines = source.lyrics?.lines ?? NO_LYRIC_LINES;
  const motion = useWallpaperMotion(controller, host, lines, settings.offsetSec, settings.audioGain);
  const ambient = !source.track || source.playerState === 'idle';
  useEffect(() => {
    document.documentElement.style.setProperty('--wallpaper-background', theme.backgroundColor);
    document.documentElement.style.setProperty('--wallpaper-text', theme.primaryColor);
    document.documentElement.style.setProperty('--wallpaper-accent', theme.accentColor);
  }, [theme]);
  return <div className="wallpaper-stage" data-visualizer={settings.mode} data-background={settings.background}>
    <VisualizerRenderer mode={settings.mode} {...motion}
      lines={snapshot.timelineSeen && !ambient ? lines : NO_LYRIC_LINES}
      theme={theme} subtitleTheme={theme} isDaylight={settings.themeVariant === 'light'} songTitle={source.track?.name} songArtist={source.track?.artist} songAlbum={snapshot.album}
      coverUrl={cover} seed={source.track?.seed ?? 'folia-wallpaper'}
      paused={!source.clock.playing || snapshot.suspended} staticMode={ambient || snapshot.suspended}
      background={{ mode: settings.background, common: { useCoverColorBg: !!cover } }}
      lyricsFontScale={settings.lyricsScale} subtitleFontScale={settings.lyricsScale}
      isPlayerChromeHidden={true} showText={true} showSubtitleTranslation={true} />
  </div>;
}
