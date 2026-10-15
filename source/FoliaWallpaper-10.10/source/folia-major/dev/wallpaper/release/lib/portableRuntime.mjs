import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

// dev/wallpaper/release/lib/portableRuntime.mjs — recipient-owned portable paths and pairing; no developer credentials.
export const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const data = path.join(root, '.data'), audio = path.join(root, 'audio');
export const node = path.join(root, 'runtime', 'node.exe'), uv = path.join(root, 'runtime', 'uv.exe');
export const port = Number(process.env.FOLIA_SERVICE_PORT ?? 3189);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
export async function prepare() {
  await fs.mkdir(data, { recursive: true });
  let token;
  try { token = (await fs.readFile(path.join(data, 'timeline-token'), 'utf8')).trim(); } catch {}
  if (!/^[a-f0-9]{64}$/.test(token ?? '')) { token = randomBytes(32).toString('hex'); await fs.writeFile(path.join(data, 'timeline-token'), token); }
  await fs.writeFile(path.join(root, 'chrome', 'connection.js'), `// This computer's local timeline pairing; not an AI key.\nexport const token = ${JSON.stringify(token)};\n`);
  let id;
  try { id = (await fs.readFile(path.join(data, 'runtime-id'), 'utf8')).trim(); } catch {}
  if (!/^[a-f0-9]{32}$/.test(id ?? '')) { id = randomBytes(16).toString('hex'); await fs.writeFile(path.join(data, 'runtime-id'), id); }
  return id;
}
export async function health() {
  try { const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
    const value = await response.json(); return value.app === 'FoliaWallpaperLyrics' && value.schema === 1 ? value : null;
  } catch { return null; }
}
export function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: root, windowsHide: true, stdio: 'inherit', ...options });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`Command failed (${code}): ${path.basename(file)}`)));
  });
}
export const audioEnv = () => ({ ...process.env, UV_CACHE_DIR: path.join(audio, 'uv-cache'), UV_PYTHON_INSTALL_DIR: path.join(audio, 'python'), UV_NO_PROGRESS: '1',
  HF_HOME: path.join(audio, 'hf-cache'), HF_HUB_DISABLE_SYMLINKS_WARNING: '1' });
