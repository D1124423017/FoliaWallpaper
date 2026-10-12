import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

// dev/wallpaper/release/fetch-vendors.mjs — pinned public binaries; hashes are checked before extraction.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cache = path.resolve(repo, '../../outputs/FoliaWallpaper_Publication/vendor-cache');
await fs.mkdir(cache, { recursive: true });
const vendors = [
  { name: 'node-v24.21.0-win-x64.zip', url: 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip', sha: '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541' },
  { name: 'uv-x86_64-pc-windows-msvc.zip', url: 'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-x86_64-pc-windows-msvc.zip', sha: '088962f9e7b7bd9ea740c04c650b2a21c8928c345bd99ac24350dc924dba656c' },
];
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function download(url, file) {
  const response = await fetch(url); if (!response.ok || !response.body) throw new Error(`Download failed: ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${file}.part`)); await fs.rename(`${file}.part`, file);
}
function expand(file, destination) {
  return new Promise((resolve, reject) => {
    const script = '$v=[Console]::In.ReadToEnd() | ConvertFrom-Json; Expand-Archive -LiteralPath $v.file -DestinationPath $v.destination -ErrorAction Stop';
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Vendor extraction failed')));
    child.stdin.end(JSON.stringify({ file, destination }));
  });
}
for (const vendor of vendors) {
  const file = path.join(cache, vendor.name);
  if (!(await exists(file))) await download(vendor.url, file);
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== vendor.sha) throw new Error(`Vendor checksum mismatch: ${vendor.name}`);
  const destination = path.join(cache, vendor.name.replace(/\.zip$/, ''));
  if (!(await exists(destination))) await expand(file, destination);
  console.log(`Verified ${vendor.name}`);
}
for (const kind of ['APACHE', 'MIT']) {
  const file = path.join(cache, `uv-LICENSE-${kind}`);
  if (!(await exists(file))) await download(`https://raw.githubusercontent.com/astral-sh/uv/0.13.0/LICENSE-${kind}`, file);
}
