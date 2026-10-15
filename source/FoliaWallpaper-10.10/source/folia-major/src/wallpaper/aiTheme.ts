import { useEffect, useState } from 'react';
import { sanitizeDualTheme } from '../services/themeSanitizer';
import type { Theme, DualTheme } from '../types';
import type { WallpaperSnapshot } from './types';

// src/wallpaper/aiTheme.ts — one discrete theme job per song; cancel late results and retain cover colors on failure.
export type AiThemeStatus = 'off' | 'waitingLyrics' | 'loading' | 'ready' | 'unconfigured' | 'error';
export interface AiThemeState { key: string; status: AiThemeStatus; theme: DualTheme | null }
export async function fetchAiRevision(signal: AbortSignal): Promise<string> {
  const response = await fetch('http://127.0.0.1:3189/ai-state', { credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
  if (!response.ok) throw new Error('AI service offline');
  const body = await response.json();
  if (body.app !== 'FoliaWallpaperAI' || body.schema !== 1 || typeof body.revision !== 'string') throw new Error('Invalid AI state');
  return body.revision;
}
export async function fetchWallpaperAiTheme(title: string, lyricsText: string, signal: AbortSignal): Promise<DualTheme | null> {
  const response = await fetch('http://127.0.0.1:3189/theme', { method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, lyricsText }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(65_000)]) });
  if (!response.ok) throw new Error(`AI bridge HTTP ${response.status}`);
  const body = await response.json();
  if (body.app !== 'FoliaWallpaperAI' || body.schema !== 1) throw new Error('Unexpected AI response');
  if (body.status === 'unconfigured' && body.theme === null) return null;
  if (body.status !== 'ready' || !body.theme?.light || !body.theme?.dark) throw new Error('Invalid theme response');
  return sanitizeDualTheme(body.theme);
}
export function selectWallpaperTheme(base: DualTheme, ai: AiThemeState, key: string, enabled: boolean, variant: 'light' | 'dark'): Theme {
  return (enabled && ai.key === key && ai.status === 'ready' && ai.theme ? ai.theme : base)[variant];
}
export function useWallpaperAiTheme(snapshot: WallpaperSnapshot, enabled: boolean) {
  const key = String(snapshot.source.track?.seed ?? '');
  const title = snapshot.source.track?.name ?? '';
  const lyricsText = snapshot.source.lyrics?.lines.map(line => line.fullText).join('\n').slice(0, 2000) ?? '';
  const [state, setState] = useState<AiThemeState>({ key: '', status: 'off', theme: null });
  useEffect(() => {
    const job = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    if (!enabled || !key || !lyricsText.trim()) {
      setState({ key, status: enabled && key ? 'waitingLyrics' : 'off', theme: null });
      return () => job.abort();
    }
    let revision = '';
    // Only a settings change retries a failed provider call; polling itself never calls a paid API.
    const watchSettings = async () => {
      try { const next = await fetchAiRevision(job.signal); if (next !== revision) { void run(); return; } } catch { /* Wait for the companion. */ }
      if (!job.signal.aborted) timer = setTimeout(() => void watchSettings(), 15_000);
    };
    const run = async () => {
      setState({ key, status: 'loading', theme: null });
      try {
        revision = await fetchAiRevision(job.signal);
        const theme = await fetchWallpaperAiTheme(title, lyricsText, job.signal);
        if (job.signal.aborted) return;
        setState({ key, status: theme ? 'ready' : 'unconfigured', theme });
        timer = setTimeout(() => void watchSettings(), 15_000);
      } catch (error) {
        if (job.signal.aborted) return;
        setState({ key, status: 'error', theme: null });
        timer = setTimeout(() => void (String(error).includes('HTTP 429') ? run() : watchSettings()), 15_000);
      }
    };
    void run();
    return () => { job.abort(); if (timer) clearTimeout(timer); };
  }, [enabled, key, title, lyricsText]);
  return state.key === key ? state : { key, status: 'waitingLyrics' as const, theme: null };
}
