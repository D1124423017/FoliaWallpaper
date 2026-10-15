import { readSharedPlayback } from '../../shared/integrationPlayback.mjs';

// Bypass a temporarily stale lyrics intermediary using the same bounded, read-only player protocol.
export async function fetchDirectPlayerSnapshot(signal: AbortSignal) {
  const response = await fetch('http://127.0.0.1:32120/snapshot', {
    credentials: 'omit', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(1200)]),
  });
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 2500000) throw new Error('Player feed unavailable');
  const body = await response.text();
  if (body.length > 2500000) throw new Error('Player feed too large');
  const snapshot = readSharedPlayback(JSON.parse(body));
  return snapshot?.playbackSource === 'direct' ? snapshot : null;
}
