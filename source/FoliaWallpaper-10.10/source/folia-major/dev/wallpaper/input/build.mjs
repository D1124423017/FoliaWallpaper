import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// dev/wallpaper/input/build.mjs — compile the small relay from source with Windows' bundled .NET compiler.
if (process.platform !== 'win32') { console.log('Desktop wheel relay is Windows-only; skipped.'); process.exit(0); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const compiler = path.join(process.env.WINDIR ?? 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const output = path.join(repo, 'dist-wallpaper-lyrics', 'FoliaDesktopWheel.exe');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.access(compiler);
const run = promisify(execFile);
const result = await run(compiler, ['/nologo', '/target:exe', '/platform:anycpu', '/optimize+', `/out:${output}`,
  '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', path.join(repo, 'dev/wallpaper/input/FoliaDesktopWheel.cs')], { windowsHide: true });
if (result.stdout) console.log(result.stdout.trim());
console.log((await run(output, ['--self-test'], { windowsHide: true })).stdout.trim());
