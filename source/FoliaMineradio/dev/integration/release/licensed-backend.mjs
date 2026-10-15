import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// Integration release guard: verify licensed replacement bytes, npm lock integrity and actual runtime resolution.
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest(algorithm === 'sha512' ? 'base64' : 'hex');
export const retiredBackendVersions = new Map([['cache-content-type@1.0.1', 'cache-content-type@2.1.0'],
  ['koa-compose@3.2.1', 'koa-compose@4.2.0 (official commit 903480c)'],
  ['koa-compose@4.1.0', 'koa-compose@4.2.0 (official commit 903480c)']]);

/** Verify both reproducible archives and the dependencies actually loaded by Koa and koa-router. */
export async function verifyLicensedBackend(repo) {
  const manifest = JSON.parse(await fs.readFile(path.join(repo, 'dev/integration/vendor/REPLACEMENTS.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(repo, 'package-lock.json'), 'utf8'));
  const require = createRequire(path.join(repo, 'package.json'));
  const records = [];
  for (const replacement of manifest.replacements) {
    const archive = await fs.readFile(path.join(repo, replacement.archive));
    if (digest(archive) !== replacement.archiveSha256) throw new Error(`Licensed archive changed: ${replacement.name}`);
    const parent = createRequire(require.resolve(`${replacement.consumer}/package.json`));
    const folder = path.dirname(parent.resolve(`${replacement.name}/package.json`));
    if (!folder.startsWith(`${path.join(repo, 'node_modules')}${path.sep}`) || await fs.realpath(folder) !== folder)
      throw new Error(`Replacement must be installed as a real local package: ${replacement.name}`);
    const metadata = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'));
    if (metadata.name !== replacement.name || metadata.version !== replacement.version || metadata.license !== 'MIT')
      throw new Error(`Incorrect licensed replacement version: ${replacement.name}`);
    const relative = path.relative(repo, folder).replaceAll('\\', '/');
    const locked = lock.packages[relative];
    if (locked?.version !== replacement.version || locked.resolved !== replacement.resolved
      || locked.integrity !== `sha512-${digest(archive, 'sha512')}`)
      throw new Error(`Replacement is not locked to its delivered archive: ${replacement.name}`);
    for (const entry of replacement.files) {
      for (const base of [path.join(repo, replacement.sourceDirectory), folder]) {
        const bytes = await fs.readFile(path.join(base, entry.path));
        if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256)
          throw new Error(`Licensed code/notice changed: ${replacement.name}/${entry.path}`);
      }
    }
    const provenance = await fs.readFile(path.join(repo, replacement.sourceDirectory, 'PROVENANCE.json'));
    if (digest(provenance) !== replacement.provenanceSha256) throw new Error(`Replacement provenance changed: ${replacement.name}`);
    const exported = parent(replacement.name);
    if (typeof (replacement.name === 'cache-content-type' ? exported.getType : exported) !== 'function')
      throw new Error(`Backend replacement export is missing: ${replacement.name}`);
    const consumerMetadata = JSON.parse(await fs.readFile(require.resolve(`${replacement.consumer}/package.json`), 'utf8'));
    records.push({ ...replacement, consumerVersion: consumerMetadata.version, nodePackagePath: relative,
      verified: 'archive integrity, source and installed code/license bytes, consumer require.resolve' });
  }
  for (const [key] of retiredBackendVersions) {
    const split = key.lastIndexOf('@'), name = key.slice(0, split), version = key.slice(split + 1);
    if (Object.entries(lock.packages).some(([folder, metadata]) => (folder.endsWith(`/node_modules/${name}`)
      || folder === `node_modules/${name}`) && metadata.version === version))
      throw new Error(`Retired backend is still in the lockfile: ${key}`);
  }
  return records;
}

/** Bind the same positive code/notice checks to the final ASAR, and reject retired package implementations. */
export async function verifyPackagedLicensedBackend({ repo, entries, extract }) {
  const records = await verifyLicensedBackend(repo);
  for (const file of ['electron/integration/main.cjs', 'electron/integration/backend-compat.cjs']) {
    if (!(extract(file)).equals(await fs.readFile(path.join(repo, file))))
      throw new Error(`Packaged integration compatibility entry differs: ${file}`);
  }
  const packageFiles = entries.filter(value => value.endsWith('/package.json') && value.startsWith('node_modules/'));
  for (const record of records) {
    const consumers = packageFiles.filter(file => {
      const metadata = JSON.parse(extract(file).toString('utf8'));
      return metadata.name === record.consumer && metadata.version === record.consumerVersion;
    });
    if (!consumers.length) throw new Error(`Replacement consumer not packaged: ${record.consumer}`);
    const packagedPaths = new Set(), packageMetadataNormalization = [];
    for (const consumer of consumers) {
      let folder = path.posix.dirname(consumer), resolved;
      // Resolve Node's ancestor node_modules search after electron-builder's possible dependency hoisting.
      for (;;) {
        if (path.posix.basename(folder) !== 'node_modules') {
          const candidate = path.posix.join(folder, 'node_modules', record.name, 'package.json');
          if (entries.includes(candidate)) { resolved = path.posix.dirname(candidate); break; }
        }
        if (folder === '.') break;
        folder = path.posix.dirname(folder);
      }
      if (!resolved) throw new Error(`Packaged consumer cannot resolve licensed backend: ${record.consumer}/${record.name}`);
      for (const entry of record.files) {
        const bytes = extract(`${resolved}/${entry.path}`);
        if (entry.path.endsWith('package.json')) {
          const original = JSON.parse(await fs.readFile(path.join(repo, record.sourceDirectory, entry.path), 'utf8'));
          const packed = JSON.parse(bytes.toString('utf8'));
          const removed = [];
          // electron-builder deliberately removes scripts/keywords and reformats dependency metadata; executable and notice bytes stay exact.
          for (const key of ['scripts', 'keywords']) if (!(key in packed) && key in original) { delete original[key]; removed.push(key); }
          if (!isDeepStrictEqual(packed, original)) throw new Error(`Unexpected packaged metadata change: ${record.name}/${entry.path}`);
          packageMetadataNormalization.push({ path: `${resolved}/${entry.path}`, originalSha256: entry.sha256,
            packagedSha256: digest(bytes), removedFields: removed, verification: 'Only known scripts/keywords omissions and JSON formatting allowed; all remaining fields equal.' });
          continue;
        }
        if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256)
          throw new Error(`Packaged licensed replacement differs: ${record.name}/${entry.path}`);
      }
      packagedPaths.add(resolved);
    }
    record.asarPackagePaths = [...packagedPaths];
    record.packageMetadataNormalization = packageMetadataNormalization;
  }
  for (const file of packageFiles) {
    const metadata = JSON.parse(extract(file).toString('utf8'));
    if (retiredBackendVersions.has(`${metadata.name}@${metadata.version}`))
      throw new Error(`Retired backend was packaged: ${metadata.name}@${metadata.version}`);
  }
  return records;
}
