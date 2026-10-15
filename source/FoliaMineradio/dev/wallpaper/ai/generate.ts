import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { THEME_GENERATION_PROMPT_PREFIX, buildThemeSourcePrompt, parseAiThemeJsonInput } from '../../../src/utils/aiThemePrompts';
import { sanitizeDualTheme } from '../../../src/services/themeSanitizer';
import { aiDirectory, loadAiSettings, publicAiSettings } from './config';
import type { DualTheme } from '../../../src/types';

// dev/wallpaper/ai/generate.ts — reuse Folia's original prompts, provider client and sanitizer with bounded durable caching.
export interface ThemeInput { title: string; lyricsText: string }
export class AiBusyError extends Error {}
const cache = new Map<string, DualTheme>();
type ThemeJob = { key: string; value: Promise<DualTheme>; controller: AbortController; users: number };
let loaded = false, pending: ThemeJob | null = null;
const require = createRequire(path.join(process.cwd(), 'package.json'));
const schema = { type: 'object', additionalProperties: false, required: ['light', 'dark'], properties: Object.fromEntries(['light', 'dark'].map(mode => [mode, {
  type: 'object', additionalProperties: false,
  required: ['name', 'description', 'backgroundColor', 'primaryColor', 'secondaryColor', 'accentColor', 'wordColors', 'lyricsIcons'],
  properties: { name: { type: 'string' }, description: { type: 'string' }, backgroundColor: { type: 'string' }, primaryColor: { type: 'string' }, secondaryColor: { type: 'string' }, accentColor: { type: 'string' },
    wordColors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['word', 'color'], properties: { word: { type: 'string' }, color: { type: 'string' } } } },
    lyricsIcons: { type: 'array', items: { type: 'string' } } },
}])) };
export function readThemeInput(value: Record<string, unknown>): ThemeInput {
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 500
    || typeof value.lyricsText !== 'string' || !value.lyricsText.trim() || value.lyricsText.length > 2000) throw new Error('Invalid theme source');
  return { title: value.title.trim(), lyricsText: value.lyricsText.trim() };
}
// Multiple monitors share a single request. Aborting one monitor only cancels the API after the last subscriber leaves.
function joinThemeJob(job: ThemeJob, signal: AbortSignal): Promise<DualTheme> {
  signal.throwIfAborted(); job.users++;
  return new Promise((resolve, reject) => {
    let released = false;
    const release = () => { if (released) return; released = true; signal.removeEventListener('abort', abort); if (--job.users === 0) job.controller.abort(); };
    const abort = () => { release(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    job.value.then(value => { if (!released) { release(); resolve(value); } }, error => { if (!released) { release(); reject(error); } });
  });
}
export async function generateWallpaperTheme(input: ThemeInput, signal: AbortSignal): Promise<DualTheme | null> {
  const settings = await loadAiSettings();
  if (!publicAiSettings(settings).configured) return null;
  signal.throwIfAborted();
  const connection = [settings.AI_PROVIDER || 'gemini', settings.OPENAI_API_URL, settings.OPENAI_API_MODEL,
    settings.OPENAI_API_TEMPERATURE, settings.OPENAI_API_STREAM, settings.AI_PROVIDER === 'openai' ? settings.OPENAI_API_KEY : settings.GEMINI_API_KEY];
  const key = createHash('sha256').update(JSON.stringify([input, connection])).digest('hex');
  if (!loaded) {
    loaded = true;
    try { for (const [key, value] of JSON.parse(await fs.readFile(path.join(aiDirectory, 'themes.json'), 'utf8')).slice(-64)) cache.set(key, sanitizeDualTheme(value)); } catch { /* Cache is optional. */ }
  }
  signal.throwIfAborted();
  if (cache.has(key)) return cache.get(key)!;
  if (pending) { if (pending.key === key) return joinThemeJob(pending, signal); throw new AiBusyError('Generating another theme'); }
  const controller = new AbortController();
  const value = (async () => {
    const { runAiJsonCompletion } = require('./electron/aiTextClient.cjs');
    const customFetch: typeof fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.any([controller.signal, ...(init?.signal ? [init.signal] : [])]) });
    const raw = await runAiJsonCompletion({ store: { get: (field: string) => settings[field] },
      systemPrompt: THEME_GENERATION_PROMPT_PREFIX, sourcePrompt: buildThemeSourcePrompt(input.lyricsText, false, input.title),
      schema, schemaName: 'dual_theme', maxTokens: 4096, timeoutMs: 60_000, customFetch });
    controller.signal.throwIfAborted();
    const theme = sanitizeDualTheme(parseAiThemeJsonInput(raw) as DualTheme);
    for (const mode of ['light', 'dark'] as const) { theme[mode].provider = 'Folia AI'; theme[mode].fontStyle = 'sans'; theme[mode].animationIntensity = 'normal'; }
    cache.set(key, theme); if (cache.size > 64) cache.delete(cache.keys().next().value!);
    try { await fs.mkdir(aiDirectory, { recursive: true }); await fs.writeFile(path.join(aiDirectory, 'themes.json'), JSON.stringify([...cache])); }
    catch { /* A cache write failure must not discard a successfully generated theme. */ }
    return theme;
  })();
  const job: ThemeJob = { key, value, controller, users: 0 };
  pending = job;
  // Cleanup attaches rejection handling before subscribers; no detached rejected API promise remains.
  void value.then(() => { if (pending === job) pending = null; }, () => { if (pending === job) pending = null; });
  return joinThemeJob(job, signal);
}
