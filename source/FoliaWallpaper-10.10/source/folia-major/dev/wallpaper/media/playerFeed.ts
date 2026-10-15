import { readSharedPlayback } from '../../../shared/integrationPlayback.mjs';
import type { SharedPlaybackSnapshot } from '../../../src/integration/wallpaperContracts';

// Read the player feed on loopback only; it never supplies accounts, audio URLs or control commands.
let snapshot: SharedPlaybackSnapshot | null = null;
const port = Number(process.env.FOLIA_PLAYER_PORT || 32120);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid player feed port');
export const playerFeedSnapshot = (now = Date.now()) => snapshot && now - snapshot.capturedAt < 4000 ? snapshot : null;
export function startPlayerFeed(): () => void {
  const job = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/snapshot`, {
        signal: AbortSignal.any([job.signal, AbortSignal.timeout(1200)]), redirect: 'error',
      });
      const length = Number(response.headers.get('content-length') || 0);
      if (!response.ok || length > 2500000) throw new Error('Player feed unavailable');
      const body = await response.text();
      if (body.length > 2500000) throw new Error('Player feed too large');
      const next = readSharedPlayback(JSON.parse(body));
      if (!job.signal.aborted) snapshot = next;
    } catch { /* A stopped player expires naturally; external source selection remains intact. */ }
    if (!job.signal.aborted) timer = setTimeout(() => void poll(), 250);
  };
  void poll();
  return () => { job.abort(); if (timer) clearTimeout(timer); snapshot = null; };
}
