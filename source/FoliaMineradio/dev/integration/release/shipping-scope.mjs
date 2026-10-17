import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readVerifiedRendererScope } from './renderer-scope.mjs';
import { verifyVendorScope } from './vendor-scope.mjs';
import { verifyPackagedLicensedBackend, retiredBackendVersions } from './licensed-backend.mjs';
import getIntegrationDelivery from './delivery-options.cjs';

// Verify actual packaged code, rather than interpreting the lockfile as a list of distributed modules.
const defaultRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const excludedNames = new Set(['electron-updater', 'lazy-val']);

export async function verifyShippingScope({ repo = defaultRepo, appOutDir } = {}) {
  const require = createRequire(path.join(repo, 'package.json'));
  const asar = require('@electron/asar');
  const output = appOutDir ?? path.join(getIntegrationDelivery(repo).output, 'win-unpacked');
  const archive = path.join(output, 'resources/app.asar');
  const entries = asar.listPackage(archive).map(value => value.replaceAll('\\', '/').replace(/^\//, ''));
  const extract = file => asar.extractFile(archive, file.replaceAll('/', path.sep));
  const backendReplacements = await verifyPackagedLicensedBackend({ repo, entries, extract });
  const renderer = await readVerifiedRendererScope(repo);
  if (entries.some(file => /(?:^|\/)sonic-(?:workshop|topography)(?:\/|$)|(?:^|\/)sonic-(?:workshop|topography)-preset\.js$/i.test(file)))
    throw new Error('Unsupported third-party Sonic code was included in the integration package.');
  const packagedMetadata = JSON.parse(extract('package.json').toString('utf8'));
  if (packagedMetadata.name !== 'folia-mineradio' || packagedMetadata.version !== renderer.version)
    throw new Error('Packaged product/version does not match renderer license scope.');
  if (!extract('electron/main.cjs').equals(await fs.readFile(path.join(repo, 'electron/main.cjs'))))
    throw new Error('Packaged main process differs from the source used to scope dependencies.');
  for (const chunk of renderer.chunks) {
    const bytes = extract(`dist/${chunk.path}`);
    if (bytes.length !== chunk.bytes || hash(bytes) !== chunk.sha256) throw new Error(`Packaged renderer differs from scope: ${chunk.path}`);
  }
  for (const name of excludedNames) {
    if (entries.some(file => file === `node_modules/${name}` || file.startsWith(`node_modules/${name}/`)
      || file.includes(`/node_modules/${name}/`))) throw new Error(`Integration-only excluded dependency was packaged: ${name}`);
    if (renderer.dependencies.some(dependency => dependency.name === name && dependency.modules.some(module => module.rendered)))
      throw new Error(`Integration-only excluded dependency was bundled into the renderer: ${name}`);
  }
  const coverage = JSON.parse(await fs.readFile(path.join(repo, '.integration-build/licenses/notice-coverage.json'), 'utf8'));
  const historical = JSON.parse(await fs.readFile(path.join(repo, 'docs/integration/third-party-notices/NOTICE-HISTORY.json'), 'utf8'));
  const tracked = new Map(historical.entries.map(entry => [`${entry.name}@${entry.version}`, entry]));
  // Keep newly found unresolved versions visible even when they were absent from the original 26-item audit.
  for (const entry of coverage.unresolved) tracked.set(`${entry.name}@${entry.version}`, entry);
  for (const entry of backendReplacements) tracked.set(`${entry.name}@${entry.version}`, entry);
  const packages = [];
  for (const trackedEntry of tracked.values()) {
    const { name, version } = trackedEntry;
    const nodePackages = [];
    for (const file of entries) {
      if (file !== `node_modules/${name}/package.json` && !file.endsWith(`/node_modules/${name}/package.json`)) continue;
      const metadata = JSON.parse(extract(file).toString('utf8'));
      if (metadata.version !== version) continue;
      const folder = file.slice(0, -'/package.json'.length);
      const code = entries.filter(entry => entry.startsWith(`${folder}/`) && !entry.slice(folder.length + 1).startsWith('node_modules/')
        && /\.(?:[cm]?js|tsx?|wasm|node)$/.test(entry));
      const nonempty = code.map(entry => ({ path: entry, bytes: asar.statFile(archive, entry.replaceAll('/', path.sep)).size ?? 0 }))
        .filter(entry => entry.bytes > 0);
      nodePackages.push({ path: folder, codeFiles: code.length, nonemptyCodeFiles: nonempty.length, codeBytes: nonempty.reduce((sum, entry) => sum + entry.bytes, 0) });
    }
    const rendered = renderer.dependencies.find(dependency => dependency.name === name && dependency.version === version);
    const renderedModuleCount = rendered?.modules.filter(module => module.rendered).length ?? 0;
    const codeShipped = nodePackages.some(record => record.nonemptyCodeFiles > 0) || renderedModuleCount > 0;
    const notice = coverage.unresolved.find(entry => entry.name === name && entry.version === version);
    packages.push({ name, version, nodePackages, renderedModuleCount, codeShipped,
      noticeStatus: retiredBackendVersions.has(`${name}@${version}`) ? 'retired-not-installed' : notice?.noticeStatus ?? 'documents-retained',
      scopeStatus: codeShipped ? notice ? 'shipping-code-notice-gap' : 'shipping-code-notice-retained'
        : nodePackages.length ? 'package-metadata-or-empty-code-only' : 'not-in-node-or-renderer-code' });
  }
  const licenses = path.join(output, 'resources/licenses');
  const copiedVendors = await verifyVendorScope({ repo, entries, extract, licenses });
  const report = { schema: 1, version: packagedMetadata.version, appAsarSha256: hash(await fs.readFile(archive)),
    archive: 'resources/app.asar', verifiedRendererChunks: renderer.chunks.length, historicalNoticeItems: historical.entries.length,
    integrationOnlyExcludedPackages: [...excludedNames], copiedVendors, backendReplacements, packages,
    shippingCodeNoticeGaps: packages.filter(record => record.scopeStatus === 'shipping-code-notice-gap').map(({ name, version, noticeStatus }) => ({ name, version, noticeStatus })),
    scopeLimit: 'Checks Node package code, finalized renderer module provenance and all four copied browser vendor scripts with their full notices. Metadata is not counted as code. Fonts, Electron/Chromium and FFmpeg retain their separate notices.' };
  await fs.mkdir(licenses, { recursive: true });
  await fs.writeFile(path.join(licenses, 'shipping-scope.json'), JSON.stringify(report, null, 2) + '\n');
  const side = path.join(repo, '.integration-build/license-scope');
  await fs.mkdir(side, { recursive: true });
  await fs.writeFile(path.join(side, 'shipping-scope.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Verified ${renderer.chunks.length} packaged renderer chunks; ${report.shippingCodeNoticeGaps.length} tracked notice gaps contain shipped code.`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyShippingScope();
