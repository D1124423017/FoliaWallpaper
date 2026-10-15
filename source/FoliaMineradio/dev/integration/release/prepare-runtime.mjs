import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { downloadArtifact } from '@electron/get';
import { extract } from '@electron-internal/extract-zip';
import { prepareBundledFfmpeg } from '../../../packaging/ffmpeg/fetch-ffmpeg.mjs';

// dev/integration/release/prepare-runtime.mjs — fetch checked official build runtimes without building or launching the app.
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const config = require('./electron-builder.cjs');
const cache = path.join(repo, '.integration-build/cache');
process.env.ELECTRON_BUILDER_CACHE = path.join(cache, 'builder');
await fs.mkdir(cache, { recursive: true });
const results = await Promise.allSettled([
  (async () => {
    const checksums = require('../../../node_modules/electron/checksums.json');
    const archiveName = `electron-v${config.electronVersion}-win32-x64.zip`;
    const expected = checksums[archiveName];
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`No pinned Electron checksum: ${archiveName}`);
    const archive = await downloadArtifact({ version: config.electronVersion, platform: 'win32', arch: 'x64',
      artifactName: 'electron', checksums, cacheRoot: path.join(cache, 'electron'), tempDirectory: cache,
      mirrorOptions: { mirror: 'https://github.com/electron/electron/releases/download/' } });
    const actual = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
    if (actual !== expected) throw new Error('Electron archive checksum mismatch.');
    const runtime = path.join(repo, '.integration-build/runtime', `electron-${config.electronVersion}`);
    await fs.mkdir(runtime, { recursive: true });
    await extract(archive, { dir: runtime });
    const executable = path.join(runtime, 'electron.exe');
    await fs.access(executable);
    return { kind: 'electron', version: config.electronVersion, archive, sha256: actual, executable };
  })(),
  (async () => ({ kind: 'ffmpeg', directory: await prepareBundledFfmpeg({ platform: 'win32', arch: 'x64', outputRoot: path.join(repo, 'build/ffmpeg') }) }))(),
  (async () => {
    const windows = require('app-builder-lib/out/toolsets/windows.js');
    const compiler = await windows.getMakeNsisPath(config.toolsets.nsis);
    const plugins = await windows.getNsisPluginsPath(config.toolsets.nsis);
    const elevate = await windows.getNsisElevatePath(config.toolsets.nsis);
    await fs.access(compiler.path);
    return { kind: 'nsis', toolset: config.toolsets.nsis, compiler, plugins, elevate };
  })(),
]);
const report = results.map(result => result.status === 'fulfilled' ? result.value : { error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
await fs.writeFile(path.join(repo, '.integration-build/runtime-manifest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (results.some(result => result.status === 'rejected')) process.exitCode = 1;
