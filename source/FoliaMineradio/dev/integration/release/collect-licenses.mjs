import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dependencyUsage } from './dependency-usage.mjs';
import { readVerifiedRendererScope } from './renderer-scope.mjs';
import { verifyLicensedBackend, retiredBackendVersions } from './licensed-backend.mjs';

// dev/integration/release/collect-licenses.mjs — retain original and dependency notices in every local package.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const destination = path.join(repo, '.integration-build/licenses');
const backendReplacements = await verifyLicensedBackend(repo);
// Recreate only this generated workspace directory; never carry stale package notices into a new release.
if (path.dirname(destination) !== path.join(repo, '.integration-build')) throw new Error('Invalid generated notices directory.');
try { if ((await fs.lstat(destination)).isSymbolicLink()) throw new Error('Generated notices directory must not be a symlink.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.rm(destination, { recursive: true, force: true });
await fs.mkdir(destination, { recursive: true });
await fs.writeFile(path.join(destination, 'backend-replacements.json'), JSON.stringify(backendReplacements, null, 2) + '\n');
for (const replacement of backendReplacements) {
  const folder = path.join(destination, 'backend-vendor-provenance', replacement.name);
  await fs.mkdir(folder, { recursive: true });
  await fs.copyFile(path.join(repo, replacement.sourceDirectory, 'PROVENANCE.json'), path.join(folder, 'PROVENANCE.json'));
}
await fs.copyFile(path.join(repo, 'LICENSE'), path.join(destination, 'Folia-AGPL-3.0.txt'));
const mineradio = path.join(repo, 'dev/wallpaper/mineradio/upstream');
await fs.copyFile(path.join(mineradio, 'LICENSE'), path.join(destination, 'Mineradio-GPL-3.0.txt'));
await fs.copyFile(path.join(mineradio, 'NOTICE.md'), path.join(destination, 'Mineradio-NOTICE.md'));
await fs.copyFile(path.join(repo, 'docs/integration/ATTRIBUTION.md'), path.join(destination, 'ATTRIBUTION.md'));
const records = new Map();
const packageFolders = new Map();
const noticeRoot = path.join(repo, 'docs/integration/third-party-notices');
const noticeSources = JSON.parse(await fs.readFile(path.join(noticeRoot, 'NOTICE-SOURCES.json'), 'utf8'));
const noticeGaps = JSON.parse(await fs.readFile(path.join(noticeRoot, 'NOTICE-GAPS.json'), 'utf8'));

/** Find verbatim notices below a package root without traversing dependencies, symlinks or generated caches. */
async function findNotices(folder, relative = '', depth = 0) {
  const found = [];
  for (const entry of await fs.readdir(path.join(folder, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory() && depth < 4 && !/^(?:node_modules|\.git|cache|test|tests|__tests__)$/.test(entry.name))
      found.push(...await findNotices(folder, name, depth + 1));
    else if (entry.isFile() && (/^(?:licen[cs]e|copying|notice|authors|third[-_ ]?party[-_ ]?(?:notices|licenses))(?:[.-]|$)/i.test(entry.name)
      || /(?:^|\/)licen[cs]es\//i.test(name))) found.push(name);
  }
  return found;
}

/** Walk package folders, including nested dependencies, and preserve license documents verbatim. */
async function collect(modules) {
  let entries; try { entries = await fs.readdir(modules, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const folder = path.join(modules, entry.name);
    if (entry.name.startsWith('@')) { await collect(folder); continue; }
    let metadata; try { metadata = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8')); } catch { continue; }
    packageFolders.set(folder.toLowerCase(), { folder, metadata });
    const key = `${metadata.name}@${metadata.version}`;
    if (!records.has(key)) {
      const files = await findNotices(folder);
      const output = path.join(destination, 'dependencies', key.replaceAll('/', '__'));
      if (files.length) await fs.mkdir(output, { recursive: true });
      for (const name of files) {
        await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
        await fs.copyFile(path.join(folder, name), path.join(output, name));
      }
      records.set(key, { name: metadata.name, version: metadata.version, license: metadata.license ?? null,
        repository: metadata.repository ?? null, licenseFiles: files });
    }
    await collect(path.join(folder, 'node_modules'));
  }
}

await collect(path.join(repo, 'node_modules'));
// Copied browser vendors need their full notices even when they are not npm runtime dependencies.
const vendorNotices = path.join(destination, 'vendors');
await fs.mkdir(vendorNotices, { recursive: true });
await fs.copyFile(path.join(repo, 'dev/wallpaper/mineradio/LICENSE-Three.js.txt'), path.join(vendorNotices, 'LICENSE-Three.js.txt'));
await fs.copyFile(path.join(repo, 'public/integration/mineradio/vendor/music-tempo.LICENCE'), path.join(vendorNotices, 'music-tempo.LICENCE'));
// These exact-version official documents are retained in source because their npm packages omit license files.
for (const source of noticeSources.entries) {
  const key = `${source.name}@${source.version}`;
  if (source.name === 'gsap') {
    const bundled = await fs.readFile(path.join(repo, 'dev/integration/mineradio/upstream/public/vendor/gsap.min.js'), 'utf8');
    if (!bundled.includes(`GSAP ${source.version}`)) throw new Error('GSAP bundled version does not match its retained Standard License notice.');
    if (!records.has(key)) records.set(key, { name: source.name, version: source.version, license: 'GSAP Standard No-Charge License',
      repository: 'https://github.com/greensock/GSAP', licenseFiles: [] });
  }
  const record = records.get(key);
  const retired = !record && retiredBackendVersions.get(key);
  if (!record && !retired) throw new Error(`Retained official notice does not match an installed dependency: ${key}`);
  const input = path.resolve(noticeRoot, source.file);
  if (!input.startsWith(`${noticeRoot}${path.sep}`)) throw new Error('Invalid supplemental notice path.');
  const bytes = await fs.readFile(input);
  if (bytes.length !== source.bytes || createHash('sha256').update(bytes).digest('hex') !== source.sha256)
    throw new Error(`Official notice checksum mismatch: ${source.file}`);
  const output = path.join(destination, retired ? 'historical-replaced-dependencies' : 'dependencies', key.replaceAll('/', '__'), path.basename(source.file));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, bytes);
  if (retired) continue; // Historical missing original text remains recorded; it is not counted as installed coverage.
  record.licenseFiles.push(path.basename(source.file));
  if (source.codeEvidence) {
    const proof = source.codeEvidence;
    const input = path.resolve(noticeRoot, proof.officialFile);
    if (!input.startsWith(`${noticeRoot}${path.sep}`)) throw new Error('Invalid corresponding-code notice path.');
    const official = await fs.readFile(input);
    if (official.length !== proof.officialBytes || createHash('sha256').update(official).digest('hex') !== proof.officialSha256)
      throw new Error(`Corresponding-code checksum mismatch: ${source.name}`);
    const candidates = [...packageFolders.values()].filter(({ metadata }) => metadata.name === source.name && metadata.version === source.version);
    if (!candidates.length) throw new Error(`Corresponding-code package absent: ${source.name}@${source.version}`);
    for (const { folder } of candidates) {
      const published = await fs.readFile(path.join(folder, proof.publishedFile));
      if (createHash('sha256').update(published).digest('hex') !== proof.publishedSha256)
        throw new Error(`Published source no longer matches its notice evidence: ${source.name}@${source.version}`);
      const equivalent = proof.mode === 'exact-file' ? published.equals(official)
        : proof.mode === 'optional-terminating-semicolon' && published.toString('utf8')
          .replace('return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));', 'return Promise.resolve(fn(context, dispatch.bind(null, i + 1)))') === official.toString('utf8');
      if (!equivalent) throw new Error(`Corresponding-code comparison failed: ${source.name}@${source.version}`);
    }
    record.correspondingCodeNotice = { mode: proof.mode, sourcePackageVersion: proof.sourcePackageVersion,
      publishedSha256: proof.publishedSha256, officialSha256: proof.officialSha256, officialUrl: proof.officialUrl };
  }
  (record.officialNotices ??= []).push({ url: source.url, sha256: source.sha256, retrievedOn: noticeSources.retrievedOn,
    ...(source.versionEvidence ? { versionEvidence: source.versionEvidence } : {}),
    ...(source.archiveEntry ? { archiveEntry: source.archiveEntry, archiveIntegrity: source.archiveIntegrity } : {}) });
}
for (const [name, parentName] of [['onnxruntime-common', 'onnxruntime-node'], ['@koromix/koffi-win32-x64', 'koffi'],
  ['dmg-builder', 'electron-builder']]) {
  for (const record of records.values()) {
    if (record.name !== name || record.licenseFiles.length) continue;
    const parent = records.get(`${parentName}@${record.version}`);
    if (!parent?.licenseFiles.length) throw new Error(`No same-version project notice for ${name}`);
    const source = path.join(destination, 'dependencies', `${parentName}@${record.version}`.replaceAll('/', '__'));
    const output = path.join(destination, 'dependencies', `${name}@${record.version}`.replaceAll('/', '__'));
    await fs.cp(source, output, { recursive: true });
    record.licenseFiles = [...parent.licenseFiles]; record.noticeInheritedFrom = `${parentName}@${record.version}`;
  }
}
await fs.copyFile(path.join(noticeRoot, 'NOTICE-SOURCES.json'), path.join(destination, 'official-notice-sources.json'));
// Preserve the publisher's declaration separately. Metadata is not a full license document.
for (const gap of noticeGaps.entries) {
  const key = `${gap.name}@${gap.version}`;
  const record = records.get(key);
  const retired = !record && retiredBackendVersions.get(key);
  if (!record && !retired) throw new Error(`Notice gap does not match an installed dependency: ${key}`);
  const source = gap.publisherMetadata;
  const input = path.resolve(noticeRoot, source.file);
  if (!input.startsWith(`${noticeRoot}${path.sep}`)) throw new Error('Invalid publisher metadata path.');
  const bytes = await fs.readFile(input);
  if (bytes.length !== source.bytes || createHash('sha256').update(bytes).digest('hex') !== source.sha256)
    throw new Error(`Publisher metadata checksum mismatch: ${source.file}`);
  const publisher = JSON.parse(bytes.toString('utf8'));
  if (publisher.name !== gap.name || publisher.version !== gap.version || publisher.license !== gap.declaredLicense)
    throw new Error(`Publisher metadata version/license mismatch: ${key}`);
  const output = path.join(destination, retired ? 'historical-replaced-dependencies' : 'dependencies', key.replaceAll('/', '__'), path.basename(source.file));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, bytes);
  if (retired) continue;
  record.publisherMetadata = { file: path.basename(source.file), url: source.url, sha256: source.sha256 };
  record.noticeLimitation = gap.limitation;
}
await fs.copyFile(path.join(noticeRoot, 'NOTICE-GAPS.json'), path.join(destination, 'notice-gaps.json'));
await fs.copyFile(path.join(noticeRoot, 'NOTICE-HISTORY.json'), path.join(destination, 'notice-history.json'));
await fs.copyFile(path.join(repo, 'docs/integration/NOTICE-GAPS.md'), path.join(destination, 'NOTICE-GAPS.md'));
const usage = await dependencyUsage(repo, packageFolders);
let rendererScope = null;
try { rendererScope = await readVerifiedRendererScope(repo); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (rendererScope) await fs.writeFile(path.join(destination, 'renderer-module-scope.json'), JSON.stringify(rendererScope, null, 2) + '\n');
for (const [key, record] of records) {
  record.usage = record.name === 'gsap' ? ['copied-visual-runtime'] : [...(usage.get(key) ?? ['unclassified-installed-superset'])].sort();
  const originalDocuments = record.licenseFiles.filter(file => !file.startsWith('PROJECT-LICENSE'));
  record.noticeStatus = !record.licenseFiles.length ? 'publisher-text-missing' : originalDocuments.length
    ? 'documents-retained' : 'project-notice-only';
  const renderer = rendererScope?.dependencies.find(dependency => dependency.name === record.name && dependency.version === record.version);
  record.rendererCodeModules = rendererScope ? renderer?.modules.filter(module => module.rendered).length ?? 0 : null;
}
const directRuntime = Object.keys(JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8')).dependencies ?? {});
const missingDirect = [...records.values()].filter(record => directRuntime.includes(record.name) && !record.licenseFiles.length);
if (missingDirect.length) throw new Error(`Direct runtime dependencies lack license documents: ${missingDirect.map(record => record.name).join(', ')}`);
await fs.writeFile(path.join(destination, 'dependency-manifest.json'), JSON.stringify([...records.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 2));
const unresolved = [...records.values()].filter(record => record.noticeStatus !== 'documents-retained');
await fs.writeFile(path.join(destination, 'notice-coverage.json'), JSON.stringify({
  dependencyVersions: records.size,
  documentsRetained: records.size - unresolved.length,
  projectNoticeOnly: unresolved.filter(record => record.noticeStatus === 'project-notice-only').length,
  publisherTextMissing: unresolved.filter(record => record.noticeStatus === 'publisher-text-missing').length,
  unresolved: unresolved.map(({ name, version, license, usage, noticeStatus, noticeLimitation }) =>
    ({ name, version, license, usage, noticeStatus, ...(noticeLimitation ? { noticeLimitation } : {}) })),
}, null, 2));
await fs.writeFile(path.join(destination, 'README.txt'), 'This directory retains available original notices and licenses, with unresolved source-version notice gaps explicitly listed in NOTICE-GAPS.md, notice-gaps.json and notice-coverage.json. Publisher metadata is not a substitute for license text and is never counted as a retained license document. The dependency manifest is a superset of build, type, test and runtime dependencies; not every listed package is delivered at runtime. Usage labels come from source imports and installed dependency graphs, not a minifier/tree-shaking proof. Type-definition and build-or-test-only entries should not be described as player runtime features. Official documents and hashes are recorded in official-notice-sources.json; versionEvidence explicitly identifies any project-level notice from a different source revision. Such entries have project-notice-only status, not original-version-complete status. GSAP 3.15.0 uses its Standard No-Charge License, not MIT; its unmodified official license page is retained under dependencies/gsap@3.15.0/. Electron and Chromium notices are additionally distributed beside the executable. FFmpeg notices are retained in ffmpeg-audio/.\n');
console.log(`Retained notices and metadata for ${records.size} dependency versions.`);
console.log(`Original-version text gaps: ${unresolved.length} (${unresolved.filter(record => record.noticeStatus === 'publisher-text-missing').length} publisher text missing; ${unresolved.filter(record => record.noticeStatus === 'project-notice-only').length} later project notices only). See notice-coverage.json.`);
