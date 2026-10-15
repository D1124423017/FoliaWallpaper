import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Zip, ZipPassThrough, unzipSync } from 'fflate';
import { unsupportedMineradioPresets } from '../mineradio/unsupported-output.mjs';

// dev/integration/release/source-archive.mjs — bundle reproducible modified source without private settings or runtimes.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const destination = path.resolve(repo, '../../outputs/FoliaMineradio');
const metadata = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'));
const version = `${metadata.version}-integration.4`;
const permittedDirectories = new Set(['api', 'api-ts', 'assets', 'build', 'dev', 'deploy', 'docs', 'electron', 'img', 'mods', 'packaging', 'public',
  'shared', 'skills', 'src', 'sync-server', 'test', 'worker', '.github']);
const ignoredDirectories = new Set(['.git', '.codegraph', 'node_modules', 'dist', 'test-results', 'playwright-report',
  '.integration-build', '.dev-credentials', 'models', '__pycache__', 'target', '.venv', 'logs']);
const ignoredFiles = /(?:\.log$|\.pyc$|\.pem$|\.pfx$|\.p12$|\.key$|\.exe$|\.dll$|\.onnx$|\.bin\.tmp$)/i;
const rootFile = /^(?:LICENSE(?:[.-].*)?|NOTICE(?:[.-].*)?|.*\.(?:md|html|ts|js|mjs|cjs|jsonc?|yml|yaml)|\.env\.(?:example|sample|template)|\.(?:npmrc|nvmrc|all-contributorsrc|editorconfig|gitattributes|gitignore|dockerignore)|Dockerfile)$/i;
const files = [];
const excludedVendorDirectories = new Set(['sonic-workshop', 'sonic-topography']);
const sha256 = contents => createHash('sha256').update(contents).digest('hex');

/** Preserve public npm build options while refusing credential-bearing or unknown configuration. */
function checkBuildConfiguration(name, contents) {
  if (name === '.nvmrc' && !/^\s*(?:v?\d+(?:\.\d+){0,2}|lts\/[\w-]+)\s*$/.test(contents.toString('utf8')))
    throw new Error('Unexpected .nvmrc content; source archive was not created.');
  if (name !== '.npmrc') return;
  const permitted = new Map([['allow-remote', 'root'], ['registry', 'https://registry.npmjs.org/'],
    ['replace-registry-host', 'never'], ['onnxruntime-node-install', 'skip']]);
  for (const line of contents.toString('utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[#;]/.test(trimmed)) continue;
    const [key, ...parts] = trimmed.split('=');
    if (!permitted.has(key.trim()) || permitted.get(key.trim()) !== parts.join('=').trim())
      throw new Error('Unexpected or private .npmrc option; source archive was not created.');
  }
}

/** Verify every stored ZIP entry against the captured source, rejecting omissions, extras and changed bytes. */
export function verifySourceArchive(archive, manifestBytes, records) {
  const contents = unzipSync(new Uint8Array(archive));
  const expected = new Map(records.map(record => [`FoliaMineradio/${record.path}`, record]));
  expected.set('FoliaMineradio/SOURCE-MANIFEST.json', { bytes: manifestBytes.length, sha256: sha256(manifestBytes) });
  if (Object.keys(contents).length !== expected.size) throw new Error('Archive entry count does not match its source manifest.');
  for (const [name, record] of expected) {
    const bytes = contents[name];
    if (!bytes || bytes.length !== record.bytes || sha256(bytes) !== record.sha256)
      throw new Error(`Source ZIP verification failed: ${name}`);
  }
  return { entries: expected.size, verified: 'all entry sizes and SHA-256 hashes' };
}

/** Restrict recursive traversal to source directories, refusing symlinks and obvious credential files. */
async function enumerate(directory, relative = '') {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isFile() && unsupportedMineradioPresets.has(entry.name)) continue;
    if (entry.isDirectory() && excludedVendorDirectories.has(entry.name) && /(?:^|\/)vendor\//.test(name)) continue;
    if (entry.isSymbolicLink()) continue;
    if (/^\.env(?:\.|$)/i.test(entry.name) && !/example|sample|template/i.test(entry.name)) continue;
    if (entry.isDirectory()) {
      // This exact official runtime evidence directory is source provenance, not a project build output.
      if (ignoredDirectories.has(entry.name) && name !== 'dev/integration/vendor/cache-content-type/dist'
        || name === 'build/ffmpeg' || name === 'release' || name === 'cache') continue;
      if (!relative && !permittedDirectories.has(entry.name)) continue;
      await enumerate(path.join(directory, entry.name), name);
    } else if (entry.isFile() && !ignoredFiles.test(entry.name) && (relative || rootFile.test(entry.name))) files.push(name);
  }
}

async function main() {
if (process.argv.length > 3 || process.argv.length === 3 && process.argv[2] !== '--check') throw new Error('Only --check is supported.');
await enumerate(repo);
files.sort();
for (const required of ['assets/placeholder_cover.jpg', 'assets/placeholder_cover-2.jpg', '.npmrc', '.nvmrc', 'package-lock.json',
  'docs/integration/BUILD-WINDOWS.md', 'dev/integration/mineradio/fonts/JetBrainsMono.ttf',
  'dev/integration/release/build.mjs', 'dev/integration/release/vite.config.ts', 'dev/integration/release/electron-builder.cjs',
  'dev/integration/release/source-archive.mjs', 'dev/wallpaper/release/build.mjs',
  'dev/integration/release/renderer-scope.mjs', 'dev/integration/release/shipping-scope.mjs',
  'dev/integration/release/vendor-scope.mjs', 'dev/integration/mineradio/unsupported-output.mjs',
  'dev/integration/release/licensed-backend.mjs', 'dev/integration/vendor/REPLACEMENTS.json',
  'dev/integration/vendor/cache-content-type-2.1.0.tgz', 'dev/integration/vendor/koa-compose-903480c-official.tgz',
  'dev/integration/vendor/cache-content-type/LICENSE', 'dev/integration/vendor/koa-compose/LICENSE',
  'dev/integration/vendor/cache-content-type/dist/commonjs/index.js', 'dev/integration/vendor/cache-content-type/dist/commonjs/package.json',
  'docs/integration/third-party-notices/opencc-js@1.4.2/THIRD_PARTY_LICENSES.md',
  'docs/integration/third-party-notices/opencc-js@1.4.2/Apache-2.0.txt',
  'test/unit/services/neteaseAccountFreshness.test.ts',
  'test/unit/cache/automixProfileCategory.test.ts', 'test/unit/cache/coverCache.test.ts',
  'test/unit/cache/persistPlaybackCache.test.ts', 'test/unit/cache/themeCache.test.ts']) {
  if (!files.includes(required)) throw new Error(`Required build source is missing: ${required}`);
}
const records = [];
for (const name of files) {
  const contents = await fs.readFile(path.join(repo, name));
  checkBuildConfiguration(name, contents);
  if (/\.(?:[cm]?js|tsx?|json|ya?ml|md|txt|html|css)$/i.test(name)
    && /(?:AIza[0-9A-Za-z_-]{35}|AQ\.[0-9A-Za-z_-]{40,})/.test(contents.toString('utf8')))
    throw new Error(`Potential private API key in source file: ${name}. Source archive was not created.`);
  records.push({ path: name, bytes: contents.length, sha256: sha256(contents) });
}
let commit = null;
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* A source archive may have no Git checkout. */ }
const manifest = { productName: 'Folia Mineradio', version, deliveryRevision: 'license.1', upstreamFoliaCommit: commit, archiveMethod: 'ZIP store (no compression)',
  containsUncommittedChanges: true, files: records, excluded: [...ignoredDirectories, ...[...excludedVendorDirectories].map(name => `vendor/${name}`),
    ...unsupportedMineradioPresets, 'build/ffmpeg', 'private .env files', 'binary runtime files'] };
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ files: records.length, bytes: records.reduce((sum, item) => sum + item.bytes, 0), checked: 'source file selection and key scan' }, null, 2));
} else {
  await fs.mkdir(destination, { recursive: true });
  const archivePath = path.join(destination, `Folia-Mineradio-Source-${version}-license.1.zip`);
  const temporaryPath = `${archivePath}.incomplete`;
  const output = createWriteStream(temporaryPath);
  const completed = new Promise((resolve, reject) => { output.once('finish', resolve); output.once('error', reject); });
  const zip = new Zip((error, data, final) => {
    if (error) output.destroy(error); else { output.write(data); if (final) output.end(); }
  });
  // ZipDeflate in fflate 0.8.3 corrupts this project's JetBrainsMono.ttf. Store all files verbatim.
  const append = (name, contents) => { const file = new ZipPassThrough(`FoliaMineradio/${name}`); zip.add(file); file.push(contents, true); };
  for (const record of records) {
    const contents = await fs.readFile(path.join(repo, record.path));
    if (sha256(contents) !== record.sha256) throw new Error(`Source changed during packaging: ${record.path}. Retry after edits finish.`);
    append(record.path, contents);
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  append('SOURCE-MANIFEST.json', manifestBytes);
  zip.end();
  await completed;
  const archive = await fs.readFile(temporaryPath);
  const verification = verifySourceArchive(archive, manifestBytes, records);
  await fs.rename(temporaryPath, archivePath);
  const archiveHash = sha256(archive);
  await fs.writeFile(`${archivePath}.sha256`, `${archiveHash}  ${path.basename(archivePath)}\n`);
  console.log(JSON.stringify({ archive: archivePath, files: records.length, sha256: archiveHash, verification, published: false }, null, 2));
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
