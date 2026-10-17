import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// dev/integration/release/build.mjs — compile and package the combined player without modifying installed apps.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const options = new Set(process.argv.slice(2));
const permitted = new Set(['--check', '--dir', '--installer', '--skip-build']);
for (const option of options) if (!permitted.has(option)) throw new Error(`Unknown option: ${option}`);
if (options.has('--dir') && options.has('--installer')) throw new Error('Choose --dir or --installer.');
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITE_'))),
  ELECTRON: 'true', ELECTRON_DEV: 'false', FOLIA_INTEGRATION_BUILD: 'true',
  APP_VERSION_LABEL: 'Folia Mineradio Preview', APP_RELEASE_CHANNEL: 'internal',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ELECTRON_CACHE: path.join(repo, '.integration-build/cache/electron'),
  ELECTRON_BUILDER_CACHE: path.join(repo, '.integration-build/cache/builder'),
};
const required = [
  'electron/integration/main.cjs', 'dev/integration/release/electron-builder.cjs',
  'dev/integration/release/delivery-options.cjs',
  'node_modules/vite/bin/vite.js', 'node_modules/electron-builder/cli.js',
  'docs/integration/INSTALLER-LICENSE.txt',
];
for (const file of required) await fs.access(path.join(repo, file));
await fs.mkdir(path.join(repo, '.integration-build'), { recursive: true });
await fs.mkdir(path.join(repo, '.integration-build/public-env'), { recursive: true });
// Downloaded builder helpers are CommonJS .js files. Keep them outside the repository's ESM package scope.
await fs.mkdir(env.ELECTRON_BUILDER_CACHE, { recursive: true });
await fs.writeFile(path.join(env.ELECTRON_BUILDER_CACHE, 'package.json'), '{"private":true,"type":"commonjs"}\n');

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repo, env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Command failed (${code}): ${args[0]}`)));
  });
}

if (options.has('--check')) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const config = require('./electron-builder.cjs');
  await require('app-builder-lib/out/util/config/config.js').validateConfiguration(config);
  if (config.publish !== null || config.appId !== 'local.folia.mineradio') throw new Error('Unsafe package identity or publishing configuration.');
  console.log(JSON.stringify({ productName: config.productName, appId: config.appId, electronVersion: config.electronVersion,
    main: config.extraMetadata.main, version: config.extraMetadata.version,
    deliveryRevision: config.extraMetadata.foliaDeliveryRevision, output: config.directories.output,
    publish: 'never', verified: 'configuration only' }, null, 2));
} else {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This package recipe currently supports Windows x64 only.');
  if (!options.has('--skip-build')) await run(['dev/integration/mineradio/package.mjs']);
  if (!options.has('--skip-build')) await run(['node_modules/vite/bin/vite.js', 'build', '--config', 'dev/integration/release/vite.config.ts']);
  await fs.access(path.join(repo, '.integration-build/dist/index.html'));
  // Scope/notices must be collected after the same renderer build, including when --skip-build is used.
  await run(['dev/integration/release/collect-licenses.mjs']);
  await run(['node_modules/electron-builder/cli.js', '--config', 'dev/integration/release/electron-builder.cjs',
    '--win', options.has('--installer') ? 'nsis' : 'dir', '--x64', '--publish', 'never']);
  await run(['dev/integration/release/shipping-scope.mjs']);
  console.log('Local Windows package created; no installer was launched and nothing was published.');
}
