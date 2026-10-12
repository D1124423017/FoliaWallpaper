import { useEffect, useMemo, useState } from 'react';
import { WallpaperController } from './controller';
import { wallpaperSettings } from './settings';
import { demoLyrics, startWallpaperDemo } from './demo';
import { useWallpaperAiTheme } from './aiTheme';
import { startBrowserTimeline } from './browserTimeline';
import { startAudioAlignment } from './audioAlignmentClient';

// src/wallpaper/useWallpaper.ts — only discrete state enters React; host retains audio / time.
export function useWallpaper() {
  const host = window.__foliaWallpaperHost;
  const controller = useMemo(() => new WallpaperController(undefined, window.wallpaperMediaIntegration), []);
  const [snapshot, setSnapshot] = useState(controller.snapshot);
  const [settings, setSettings] = useState(() => wallpaperSettings(host.settings));
  const previewDemo = new URLSearchParams(location.search).get('demo') === '1';
  const demo = settings.demo || (!host.native && previewDemo);
  useEffect(() => {
    const update = () => setSnapshot(controller.snapshot);
    const unsubscribe = controller.subscribe(update);
    const receive = (event: typeof host.history[number]) => {
      if (event.type === 'settings') setSettings(wallpaperSettings(host.settings));
      else if (event.type !== 'audio' && !demo) controller.apply(event);
    };
    host.history.forEach(receive);
    const removeHost = host.subscribe(receive);
    let stopDemo: (() => void) | undefined;
    if (demo) {
      stopDemo = startWallpaperDemo(host, controller);
      controller.setDemo(demoLyrics);
    }
    update();
    return () => { unsubscribe(); removeHost(); stopDemo?.(); };
  }, [controller, demo, host]);
  useEffect(() => () => controller.stop(), [controller]);
  useEffect(() => !demo && host.native ? startBrowserTimeline(controller) : undefined, [controller, demo, host.native]);
  useEffect(() => !demo && host.native ? startAudioAlignment(controller) : undefined, [controller, demo, host.native]);
  const aiTheme = useWallpaperAiTheme(snapshot, settings.aiTheme && !demo);
  return { host, controller, snapshot, settings, demo, aiTheme };
}
