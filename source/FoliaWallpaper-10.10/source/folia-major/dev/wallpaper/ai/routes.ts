import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readJsonBody, LYRIC_SERVICE_PORT } from '../lyrics/http';
import { loadAiSettings, publicAiSettings, saveAiSettings, aiSettingsRevision } from './config';
import { generateWallpaperTheme, readThemeInput, AiBusyError } from './generate';
import { publicGeminiAlignmentSettings, saveGeminiAlignmentSettings } from '../audio/geminiSettings';

// dev/wallpaper/ai/routes.ts — theme generation for wallpapers; token-protected setup stays on loopback.
const token = randomBytes(32).toString('hex');
export const aiSettingsUrl = `http://127.0.0.1:${LYRIC_SERVICE_PORT}/settings?token=${token}`;
export function validAiSetupToken(value: string | null): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
}
export async function handleAiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${LYRIC_SERVICE_PORT}`);
  if (!['/settings', '/ai/config', '/ai/audio', '/theme', '/ai-state'].includes(url.pathname)) return false;
  const send = (status: number, data: unknown) => { if (!res.destroyed) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data)); };
  if (['/settings', '/ai/config', '/ai/audio'].includes(url.pathname) && !validAiSetupToken(url.searchParams.get('token'))) { send(403, { error: 'Open the local AI setup launcher' }); return true; }
  if (url.pathname === '/ai-state' && req.method === 'GET') send(200, { app: 'FoliaWallpaperAI', schema: 1, revision: await aiSettingsRevision() });
  else if (url.pathname === '/settings' && req.method === 'GET') {
    const html = await fs.readFile(path.join(process.cwd(), 'dev/wallpaper/ai/settings.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'" }).end(html);
  } else if (url.pathname === '/ai/config' && req.method === 'GET') send(200, publicAiSettings(await loadAiSettings()));
  else if (url.pathname === '/ai/config' && req.method === 'POST') {
    try { await saveAiSettings(await readJsonBody(req, 8192)); send(200, { saved: true }); }
    catch { send(400, { error: '請檢查服務、API 金鑰、網址與模型設定。' }); }
  } else if (url.pathname === '/ai/audio' && req.method === 'GET') send(200, publicGeminiAlignmentSettings());
  else if (url.pathname === '/ai/audio' && req.method === 'POST') {
    try { saveGeminiAlignmentSettings(await readJsonBody(req, 1024)); send(200, publicGeminiAlignmentSettings()); }
    catch { send(400, { error: '請先安裝本機音訊分析配套，並提供啟用或停用設定。' }); }
  } else if (url.pathname === '/theme' && req.method === 'POST') {
    let input; try { input = readThemeInput(await readJsonBody(req, 12000)); } catch { send(400, { error: 'Invalid theme source' }); return true; }
    const job = new AbortController(); res.on('close', () => { if (!res.writableEnded) job.abort(); });
    try { const theme = await generateWallpaperTheme(input, job.signal); send(200, { app: 'FoliaWallpaperAI', schema: 1, theme, status: theme ? 'ready' : 'unconfigured' }); }
    catch (error) { send(error instanceof AiBusyError ? 429 : 503, { error: 'AI 主題暫時無法產生，請檢查連線設定。' }); }
  } else send(405, { error: 'Method not allowed' });
  return true;
}
