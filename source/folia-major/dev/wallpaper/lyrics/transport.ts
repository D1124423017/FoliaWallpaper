import { AsyncLocalStorage } from 'node:async_hooks';
import type { LyricProviderTransport } from '../../../src/utils/lyrics/providers/transport';

// dev/wallpaper/lyrics/transport.ts — public lyric requests only; no browser proxy or user credentials.
export const lyricRequestContext = new AsyncLocalStorage<AbortSignal>();
export function throwIfLyricRequestAborted() { lyricRequestContext.getStore()?.throwIfAborted(); }
export const nativeLyricTransport: LyricProviderTransport = async (url, init) => {
  throwIfLyricRequestAborted();
  const target = new URL(url);
  if (!['u.y.qq.com', 'complexsearch.kugou.com', 'mobiles.kugou.com', 'lyrics.kugou.com'].includes(target.hostname)) {
    throw new Error('Unsupported lyric host');
  }
  target.protocol = 'https:';
  const context = lyricRequestContext.getStore();
  const timeout = AbortSignal.timeout(6500);
  return fetch(target, { ...init, credentials: 'omit', signal: context ? AbortSignal.any([context, timeout]) : timeout });
};
