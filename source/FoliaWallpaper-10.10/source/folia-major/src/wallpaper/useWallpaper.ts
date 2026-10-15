import { useEffect, useMemo, useState } from 'react';
import { WallpaperController } from './controller';
import { wallpaperSettings } from './settings';
import { demoLyrics, startWallpaperDemo } from './demo';
import { useWallpaperAiTheme } from './aiTheme';
import { startAudioAlignment } from './audioAlignmentClient';
import { useWallpaperPreferences } from './preferences';
import { startSystemMediaClient } from './systemMediaClient';

// src/wallpaper/useWallpaper.ts — only discrete state enters React; host retains audio / time.
export function useWallpaper() {
  const host = window.__foliaWallpaperHost;
  const controller = useMemo(() => new WallpaperController(undefined, window.wallpaperMediaIntegration), []);
  const [snapshot, setSnapshot] = useState(controller.snapshot);
  const engineSettings = useWallpaperPreferences(state => state.engine);
  const desktopSettings = useWallpaperPreferences(state => state.overrides);
  const settings = useMemo(() => wallpaperSettings({ ...engineSettings, ...desktopSettings }), [engineSettings, desktopSettings]);
  const previewDemo = new URLSearchParams(location.search).get('demo') === '1';
  const demo = settings.demo || (!host.native && previewDemo);
  const previewPlayer = !host.native && new URLSearchParams(location.search).get('player') === '1';
  useEffect(() => {
    const update = () => setSnapshot(controller.snapshot);
    const unsubscribe = controller.subscribe(update);
    const receive = (event: typeof host.history[number]) => {
      if (event.type === 'settings') useWallpaperPreferences.getState().receiveEngine(host.settings);
      else if (event.type === 'suspend' || event.type !== 'audio' && !demo) controller.apply(event);
    };
    useWallpaperPreferences.getState().receiveEngine(host.settings);
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
  useEffect(() => !demo && (host.native || previewPlayer) ? startSystemMediaClient(controller, host) : undefined, [controller, demo, host, previewPlayer]);
  useEffect(() => !demo && host.native ? startAudioAlignment(controller) : undefined, [controller, demo, host.native]);
  const aiTheme = useWallpaperAiTheme(snapshot, settings.aiTheme && !demo && snapshot.mediaSource !== 'player');
  return { host, controller, snapshot, settings, demo, aiTheme };
}
