import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../../types';
import type { WallpaperSettings } from '../settings';
import type { useWallpaperMotion } from '../useWallpaperMotion';

// Isolate upstream Three r128, streaming MotionValues into its original shaders outside React.
interface Props {
  settings: WallpaperSettings; theme: Theme; cover: string | null;
  playing: boolean; suspended: boolean; motion: ReturnType<typeof useWallpaperMotion>;
}
export function MineradioLayer(props: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  const sendRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  latest.current = props;
  useEffect(() => {
    let lastSend = 0, request = 0, ready = false;
    const send = () => {
      const { settings, theme, motion, cover, playing, suspended } = latest.current;
      const band = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value / 255 : 0));
      frame.current?.contentWindow?.postMessage({ type: 'folia-mineradio-v1', data: {
        preset: settings.mineradioPreset, intensity: settings.mineradioIntensity, speed: settings.mineradioSpeed,
        point: settings.mineradioPoint, bloom: settings.mineradioBloom, opacity: settings.mineradioOpacity,
        cover, playing, suspended: suspended || document.hidden,
        position: motion.currentTime.get(), power: band(motion.audioPower.get()),
        bass: band(motion.audioBands.bass.get()), mid: band(motion.audioBands.mid.get()), treble: band(motion.audioBands.treble.get()),
        theme: { primary: theme.primaryColor, secondary: theme.secondaryColor, accent: theme.accentColor, background: theme.backgroundColor },
      } }, '*'); // file:// WE frames have opaque origins; the receiver validates event.source.
    };
    const tick = (now: number) => {
      const interval = latest.current.playing && !latest.current.suspended ? 33 : 250;
      if (ready && !document.hidden && now - lastSend >= interval) { lastSend = now; send(); }
      request = requestAnimationFrame(tick);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'folia-mineradio-ready-v1') { ready = true; setFailed(false); send(); }
      if (event.data?.type === 'folia-mineradio-error-v1') setFailed(true);
    };
    const visibility = () => send();
    sendRef.current = send;
    addEventListener('message', receive); document.addEventListener('visibilitychange', visibility);
    request = requestAnimationFrame(tick);
    const timeout = setTimeout(() => { if (!ready) setFailed(true); }, 10000);
    return () => {
      clearTimeout(timeout); cancelAnimationFrame(request);
      sendRef.current = null;
      removeEventListener('message', receive); document.removeEventListener('visibilitychange', visibility);
      frame.current?.contentWindow?.postMessage({ type: 'folia-mineradio-v1', action: 'dispose' }, '*');
    };
  }, []);
  useEffect(() => { sendRef.current?.(); }, [props.settings, props.theme, props.cover, props.playing, props.suspended]);
  return <><iframe ref={frame} title="Mineradio 原版視覺" className="wallpaper-mineradio-layer" src="./mineradio/index.html" tabIndex={-1} />
    {failed && <div className="wallpaper-mineradio-error" role="status">Mineradio 視覺載入失敗，請切回 Folia 或重新載入桌布。</div>}</>;
}
