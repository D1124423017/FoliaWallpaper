import { useEffect, useMemo, useState } from 'react';
import { generateBuiltinDualTheme } from '../utils/builtinTheme/generateBuiltinDualTheme';
import { extractColors } from '../utils/colorExtractor';
import { selectWallpaperTheme } from './aiTheme';
import type { useWallpaper } from './useWallpaper';

// src/wallpaper/useWallpaperTheme.ts — one shared theme for the original stage and its controls.
export function useWallpaperTheme(wallpaper: ReturnType<typeof useWallpaper>) {
  const { source } = wallpaper.snapshot;
  const cover = source.track?.coverUrl ?? null;
  const [baseTheme, setBaseTheme] = useState(() => generateBuiltinDualTheme());
  useEffect(() => {
    let cancelled = false;
    if (!cover) { setBaseTheme(generateBuiltinDualTheme()); return; }
    void extractColors(cover, 5).then(colors => {
      if (!cancelled) setBaseTheme(generateBuiltinDualTheme({ coverColors: colors }));
    }).catch(() => { if (!cancelled) setBaseTheme(generateBuiltinDualTheme()); });
    return () => { cancelled = true; };
  }, [cover, source.track?.seed]);
  const theme = selectWallpaperTheme(baseTheme, wallpaper.aiTheme, String(source.track?.seed ?? ''),
    wallpaper.settings.aiTheme && !wallpaper.demo, wallpaper.settings.themeVariant);
  const intensity = wallpaper.settings.animationIntensity;
  const selectedTheme = wallpaper.snapshot.mediaSource === 'player' && wallpaper.snapshot.playerTheme ? wallpaper.snapshot.playerTheme : theme;
  return useMemo(() => intensity === 'auto' ? selectedTheme : { ...selectedTheme, animationIntensity: intensity }, [selectedTheme, intensity]);
}
