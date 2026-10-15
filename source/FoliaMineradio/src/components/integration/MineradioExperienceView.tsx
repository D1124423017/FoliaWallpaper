import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../../types';
import type { IntegrationSnapshot } from '../../integration/contracts';
import { integrationSnapshot } from '../../integration/snapshot';
import { dispatchIntegrationAction } from '../../integration/dispatch';
import { currentTime, lyricCurrentTime } from '../../stores/motionSignals';
import { integrationAudioSnapshot } from '../../integration/audio';
import { usePlaybackStore } from '../../stores/usePlaybackStore';

// Original Mineradio is an isolated view. The Folia audio decks remain mounted in AppShell.
export default function MineradioExperienceView({ theme, presentation, profileKey }: {
  theme: Theme; presentation: IntegrationSnapshot['presentation'];
  profileKey: 'folia' | 'mineradio' | 'custom';
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ theme, presentation }); latest.current = { theme, presentation };
  const sendNow = useRef<(() => void) | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const child = frame.current?.contentWindow;
    let ready = false, raf = 0, last = 0, dirty = true;
    let priorSong: unknown, priorLyrics: unknown, priorQueue: unknown, priorState: unknown;
    const send = (snapshot: Partial<IntegrationSnapshot>) => child?.postMessage({
      type: 'folia-mineradio-core-v1', snapshot,
    }, '*');
    const full = () => {
      if (!ready) return;
      try { send(integrationSnapshot(latest.current.theme, latest.current.presentation)); dirty = false; }
      catch (failure) { setError(failure instanceof Error ? failure.message : '播放核心連線失敗'); }
    };
    const unsub = usePlaybackStore.subscribe(state => {
      if (priorSong !== state.currentSong || priorLyrics !== state.lyrics || priorQueue !== state.playQueue || priorState !== state.playerState) dirty = true;
      priorSong = state.currentSong; priorLyrics = state.lyrics; priorQueue = state.playQueue; priorState = state.playerState;
    });
    const receive = async (event: MessageEvent) => {
      if (event.source !== child) return;
      const data = event.data;
      if (data?.type === 'folia-mineradio-core-ready-v1') { ready = true; setError(''); full(); return; }
      if (data?.type === 'folia-mineradio-core-error-v1') { setError(String(data.error || '原版畫面載入失敗')); return; }
      if (data?.type !== 'folia-mineradio-action-v1' || typeof data.id !== 'string' || data.id.length > 100) return;
      try {
        const result = await dispatchIntegrationAction(data.action, data.args);
        child?.postMessage({ type: 'folia-mineradio-result-v1', id: data.id, result }, '*');
        full();
      } catch (failure) {
        child?.postMessage({ type: 'folia-mineradio-result-v1', id: data.id,
          error: failure instanceof Error ? failure.message : '操作失敗' }, '*');
      }
    };
    let lastFull = 0;
    const tick = (now: number) => {
      if (ready && now - last >= (document.hidden ? 1000 : 33)) {
        last = now;
        if (dirty || now - lastFull > 1000) { full(); lastFull = now; }
        else send({ position: currentTime.get(), lyricPosition: lyricCurrentTime.get(), suspended: document.hidden,
          audio: integrationAudioSnapshot() });
      }
      raf = requestAnimationFrame(tick);
    };
    const visibility = () => { dirty = true; full(); };
    sendNow.current = full;
    addEventListener('message', receive); document.addEventListener('visibilitychange', visibility);
    raf = requestAnimationFrame(tick);
    const timeout = setTimeout(() => { if (!ready) setError('Mineradio 畫面未就緒，請切回 Folia 並檢查安裝檔'); }, 15000);
    return () => {
      child?.postMessage({ type: 'folia-mineradio-core-v1', action: 'dispose' }, '*');
      cancelAnimationFrame(raf); clearTimeout(timeout); unsub(); sendNow.current = null;
      removeEventListener('message', receive); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => { sendNow.current?.(); }, [theme, presentation]);
  return <>
    <iframe ref={frame} src={`./integration/mineradio/index.html?profile=${profileKey}`} title="Mineradio 原版介面"
      data-testid="mineradio-experience" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0,
        zIndex: presentation.showLyrics || !presentation.showBackground ? 2 : 0,
        pointerEvents: presentation.showControls || presentation.showShelf ? 'auto' : 'none', background: 'transparent' }} />
    {error && <div role="alert" style={{ position: 'absolute', bottom: 60, left: 20, padding: 14, background: '#241818', color: '#fff', borderRadius: 12 }}>{error}</div>}
  </>;
}
