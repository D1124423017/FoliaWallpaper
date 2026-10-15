import type { WallpaperController } from './controller';
import type { WallpaperHost } from './types';
import { readMediaSelection } from './mediaSources';
import { wallpaperServiceUrl } from './serviceUrl';
import { fetchDirectPlayerSnapshot } from './directPlayerClient';
import { readSharedPlayback } from '../../shared/integrationPlayback.mjs';

// src/wallpaper/systemMediaClient.ts — bounded polling; audio and clock updates stay outside React.
export function startSystemMediaClient(controller: WallpaperController, host: WallpaperHost): () => void {
  const job = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0, polling = false, pending = false;
  let allowDirectPlayer = false;
  let selectionKey = '';
  const poll = async () => {
    if (polling) { pending = true; return; }
    if (timer) clearTimeout(timer);
    polling = true;
    const before = revision;
    let delay = 700;
    try {
      const response = await fetch(wallpaperServiceUrl('system-media'), { credentials: 'omit', signal: AbortSignal.any([job.signal, AbortSignal.timeout(2500)]) });
      if (!response.ok) throw new Error('Media service unavailable');
      const data = await response.json();
      if (data.app !== 'FoliaWallpaperMedia' || data.schema !== 1 || job.signal.aborted) throw new Error('Invalid media service');
      if (before !== revision) return;
      const selected = readMediaSelection(data.selection);
      const nextSelectionKey = JSON.stringify(selected);
      if (selectionKey && nextSelectionKey !== selectionKey) controller.clearPlayer();
      selectionKey = nextSelectionKey;
      allowDirectPlayer = data.selection?.kind === 'auto'
        || data.selection?.kind === 'application' && data.selection.id === 'folia-mineradio';
      let player = readSharedPlayback(data.player);
      if (player && player.playbackSource !== 'direct') { controller.clearPlayer(); player = null; }
      if (!player && allowDirectPlayer) player = await fetchDirectPlayerSnapshot(job.signal).catch(() => null);
      if (before !== revision || job.signal.aborted) return;
      const now = Date.now();
      controller.apply({ type: 'source-selection', data: data.selection?.kind === 'browser' || data.selection?.kind === 'application', at: now });
      if (!player && data.media) controller.clearPlayer();
      controller.applyPlayer(player, now);
      if (!player) controller.apply({ type: 'system-media', data: data.media, at: now });
      if (player) host.emit('player-audio', player.clock.playing ? player.audio : null);
      const audio = data.audio;
      const fresh = audio && typeof audio.at === 'number' && Math.abs(now - audio.at) < 4000;
      controller.apply({ type: 'audio-activity', data: fresh && audio.available === true && audio.active === true, at: now });
      host.emit('system-audio', { peak: fresh && Number.isFinite(audio.peak) ? Math.min(1, Math.max(0, audio.peak)) : 0 });
    } catch {
      delay = 2000;
      if (!job.signal.aborted && before === revision && allowDirectPlayer) {
        const player = await fetchDirectPlayerSnapshot(job.signal).catch(() => null);
        if (!job.signal.aborted && before === revision && player) {
          controller.applyPlayer(player, Date.now()); host.emit('player-audio', player.clock.playing ? player.audio : null);
          delay = 700;
        }
      }
      if (!job.signal.aborted && before === revision) { controller.apply({ type: 'audio-activity', data: false, at: Date.now() }); host.emit('system-audio', { peak: 0 }); }
    } finally {
      polling = false;
      if (!job.signal.aborted) { const next = pending ? 0 : delay; pending = false; timer = setTimeout(() => void poll(), next); }
    }
  };
  const unsubscribe = host.subscribe(event => {
    if (event.type !== 'media-source-changed') return;
    const selection = readMediaSelection(event.data);
    if (!selection) return;
    revision++;
    selectionKey = JSON.stringify(selection);
    allowDirectPlayer = selection.kind === 'auto' || selection.kind === 'application' && selection.id === 'folia-mineradio';
    const now = Date.now();
    controller.apply({ type: 'source-selection', data: selection.kind !== 'auto', at: now });
    controller.clearPlayer();
    controller.apply({ type: 'system-media', data: null, at: now });
    controller.apply({ type: 'audio-activity', data: false, at: now });
    host.emit('system-audio', { peak: 0 });
    void poll();
  });
  const expiry = setInterval(() => controller.apply({ type: 'system-expired', data: {}, at: Date.now() }), 500);
  void poll();
  return () => { unsubscribe(); job.abort(); clearInterval(expiry); if (timer) clearTimeout(timer); };
}
