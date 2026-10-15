import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// dev/wallpaper/release/build.mjs — repeatable public payload build; never initializes pairing or starts services.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
await fs.access(npm);
function run(args) { return new Promise((resolve, reject) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')));
  const child = spawn(process.execPath, args, { cwd: repo, windowsHide: true, stdio: 'inherit', env: { ...env, FOLIA_PUBLIC_BUILD: '1' } });
  child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`Build failed (${code})`)));
}); }
await run(['dev/wallpaper/release/fetch-vendors.mjs']);
await run([npm, 'run', 'build:wallpaper']);
await run([npm, 'run', 'build:wallpaper-lyrics']);
await run(['dev/wallpaper/release/assemble.mjs']);
await run([npm, 'ci', '--prefix', path.resolve(repo, '../../outputs/FoliaWallpaper_Publication/stage/FoliaWallpaperTools/service'),
  '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']);
await run(['dev/wallpaper/release/collect-licenses.mjs']);
console.log('Public payloads are ready. No credentials, model, or runtime pairing are created by this build.');
