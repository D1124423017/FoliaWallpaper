import type { WallpaperController } from './controller';
import { wallpaperTrack, wallpaperTrackKey } from './model';

// src/wallpaper/audioAlignmentClient.ts — one low-frequency observation loop; playback still uses the original MotionValue clock.
export function startAudioAlignment(controller: WallpaperController): () => void {
  const job = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let registered = '';
  const tick = async () => {
    const snapshot = controller.snapshot, track = wallpaperTrack(snapshot);
    try {
      if (track && snapshot.timelineSeen && track.durationSec > 0) {
        const at = Date.now();
        const signal = AbortSignal.any([job.signal, AbortSignal.timeout(2500)]);
        const candidate = controller.getAudioCandidate();
        const candidateKey = candidate ? `${wallpaperTrackKey(track)}:${candidate.candidate.origin}` : '';
        if (candidate && candidateKey !== registered) {
          const saved = await fetch('http://127.0.0.1:3189/audio-candidate', { method: 'POST', credentials: 'omit', signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(candidate) });
          if (saved.ok) registered = candidateKey;
        }
        await fetch('http://127.0.0.1:3189/audio-playback', { method: 'POST', credentials: 'omit', signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...track, at,
            positionSec: controller.getCurrentTimeSec(at), playbackRate: snapshot.playbackRate, playing: snapshot.source.clock.playing && !snapshot.suspended }) });
        const response = await fetch(`http://127.0.0.1:3189/audio-alignment?key=${encodeURIComponent(wallpaperTrackKey(track))}`, { credentials: 'omit', signal });
        const body = await response.json();
        if (body.app === 'FoliaWallpaperAudio' && body.schema === 1 && body.state && !job.signal.aborted) {
          if (candidate && body.state.origin !== candidate.candidate.origin) registered = '';
          controller.applyAudioAlignment(body.state);
        }
      }
    } catch { /* Music and rendering continue when the optional local model is unavailable. */ }
    if (!job.signal.aborted) timer = setTimeout(() => void tick(), 1000);
  };
  void tick();
  return () => { job.abort(); if (timer) clearTimeout(timer); };
}
