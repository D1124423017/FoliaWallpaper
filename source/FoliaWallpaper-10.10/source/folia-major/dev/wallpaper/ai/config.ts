import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

// dev/wallpaper/ai/config.ts — private connection settings; new keys are protected with Windows user DPAPI.
export const aiDirectory = path.join(os.homedir(), 'AppData', 'Roaming', 'FoliaWallpaper');
export type AiSettings = Record<string, unknown>;
const fields = ['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_API_URL', 'OPENAI_API_MODEL', 'OPENAI_API_TEMPERATURE', 'OPENAI_API_STREAM', 'GEMINI_API_KEY'];
export function validateAiSettings(data: Record<string, unknown>): AiSettings {
  if (data.provider !== 'gemini' && data.provider !== 'openai') throw new Error('Invalid provider');
  if (typeof data.apiKey !== 'string' || data.apiKey.length > 1024) throw new Error('Invalid API key');
  const settings: AiSettings = { AI_PROVIDER: data.provider };
  if (data.provider === 'gemini') settings.GEMINI_API_KEY = data.apiKey.trim();
  else {
    if (typeof data.apiUrl !== 'string' || data.apiUrl.length > 2048 || typeof data.model !== 'string' || !data.model.trim() || data.model.length > 256) throw new Error('API URL and model required');
    const url = new URL(data.apiUrl);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('Use HTTPS or a local model URL');
    settings.OPENAI_API_URL = url.toString(); settings.OPENAI_API_MODEL = data.model.trim(); settings.OPENAI_API_KEY = data.apiKey.trim();
  }
  return settings;
}
function dpapi(value: string, decrypt: boolean): Promise<string> {
  // Direct .NET DPAPI avoids Windows PowerShell module auto-loading failures under a PowerShell 7 parent.
  const prefix = "$null=[Reflection.Assembly]::LoadWithPartialName('System.Security'); $scope=[Security.Cryptography.DataProtectionScope]::CurrentUser; ";
  const code = prefix + (decrypt
    ? '$bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,$scope)))'
    : '$bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,$scope)))');
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', code], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Credential protection timed out')); }, 10_000);
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('Credential protection unavailable')); });
    child.on('close', code => { clearTimeout(timer); code === 0 && output ? resolve(output) : reject(new Error('Credential protection failed')); });
    child.stdin.on('error', () => reject(new Error('Credential protection unavailable')));
    child.stdin.end(value);
  });
}
export async function aiSettingsRevision(): Promise<string> {
  for (const file of [path.join(aiDirectory, 'ai-config.json'), path.join(os.homedir(), 'AppData', 'Roaming', 'Folia', 'config.json')]) {
    try { const stat = await fs.stat(file); return `${stat.mtimeMs}:${stat.size}`; } catch { /* An absent config is unconfigured. */ }
  }
  return 'none';
}
export async function loadAiSettings(): Promise<AiSettings> {
  let saved: AiSettings;
  try { saved = JSON.parse(await fs.readFile(path.join(aiDirectory, 'ai-config.json'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot read AI settings');
    try {
      const folia = JSON.parse(await fs.readFile(path.join(os.homedir(), 'AppData', 'Roaming', 'Folia', 'config.json'), 'utf8'));
      return Object.fromEntries(fields.map(field => [field, folia[field]]));
    } catch { return {}; }
  }
  const key = typeof saved.protectedKey === 'string' ? await dpapi(saved.protectedKey, true) : '';
  return { ...saved, [saved.AI_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY']: key };
}
export async function saveAiSettings(data: Record<string, unknown>): Promise<void> {
  const settings = validateAiSettings(data);
  const field = settings.AI_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
  const previous = await loadAiSettings();
  const key = String(settings[field] || ((previous.AI_PROVIDER || 'gemini') === settings.AI_PROVIDER ? previous[field] ?? '' : ''));
  if (!key) throw new Error('API key required');
  delete settings[field]; settings.protectedKey = await dpapi(key, false);
  await fs.mkdir(aiDirectory, { recursive: true });
  const file = path.join(aiDirectory, 'ai-config.json');
  await fs.writeFile(`${file}.tmp`, JSON.stringify(settings)); await fs.rename(`${file}.tmp`, file);
}
export function publicAiSettings(settings: AiSettings) {
  const provider = settings.AI_PROVIDER === 'openai' ? 'openai' : 'gemini';
  return { provider, configured: Boolean(settings[provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY']),
    apiUrl: typeof settings.OPENAI_API_URL === 'string' ? settings.OPENAI_API_URL : '',
    model: typeof settings.OPENAI_API_MODEL === 'string' ? settings.OPENAI_API_MODEL : '' };
}
