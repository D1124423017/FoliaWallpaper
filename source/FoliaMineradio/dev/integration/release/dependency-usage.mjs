import fs from 'node:fs/promises';
import path from 'node:path';

// dev/integration/release/dependency-usage.mjs — classify installed dependency provenance without executing package code.
export async function dependencyUsage(repo, packageFolders) {
  const root = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'));
  const rendererImports = new Set();
  const usage = new Map();

  async function sourceImports(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await sourceImports(file);
      else if (/\.(?:tsx?|[cm]?js)$/.test(entry.name)) {
        const source = await fs.readFile(file, 'utf8');
        for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'".][^'"]*)['"]/g)) {
          const specifier = match[1];
          if (/^(?:node:|@\/|https?:|virtual:)/.test(specifier)) continue;
          rendererImports.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
        }
      }
    }
  }
  await sourceImports(path.join(repo, 'src'));

  function resolvePackage(name, from) {
    for (let folder = from; folder.startsWith(repo); folder = path.dirname(folder)) {
      const candidate = path.join(folder, 'node_modules', name).toLowerCase();
      const record = packageFolders.get(candidate);
      if (record) return record;
      if (folder === repo) break;
    }
    return null;
  }
  const visited = new Set();
  function visit(name, from, reason) {
    const record = resolvePackage(name, from);
    if (!record) return;
    const marker = `${record.folder.toLowerCase()}:${reason}`;
    if (visited.has(marker)) return;
    visited.add(marker);
    const key = `${record.metadata.name}@${record.metadata.version}`;
    const reasons = usage.get(key) ?? new Set(); reasons.add(reason); usage.set(key, reasons);
    for (const dependency of Object.keys({ ...record.metadata.dependencies, ...record.metadata.optionalDependencies,
      ...record.metadata.peerDependencies })) visit(dependency, record.folder, reason);
  }
  for (const name of Object.keys(root.dependencies ?? {})) visit(name, repo, 'electron-runtime-dependency');
  for (const name of rendererImports) visit(name, repo, 'renderer-source-dependency');
  for (const name of Object.keys(root.devDependencies ?? {})) {
    if (name.startsWith('@types/')) visit(name, repo, 'type-definition');
    else if (!rendererImports.has(name)) visit(name, repo, 'build-or-test-dependency');
  }
  // These packages contribute generated or copied assets even when there is no literal src/ import.
  for (const { metadata } of packageFolders.values()) {
    if (metadata.name.startsWith('workbox-')) visit(metadata.name, repo, 'generated-renderer-asset');
  }
  visit('opencc-js', repo, 'copied-visual-runtime');
  return usage;
}
