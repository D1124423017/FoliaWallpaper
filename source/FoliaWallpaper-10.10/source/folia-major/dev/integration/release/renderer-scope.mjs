import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Integration-only build evidence: package origins and final emitted JS hashes, without user paths or source bodies.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function captureScope(repo, bundle) {
      const root = repo.replaceAll('\\', '/');
      const packages = new Map();
      const chunks = [];
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        chunks.push({ path: chunk.fileName, bytes: Buffer.byteLength(chunk.code), sha256: hash(chunk.code) });
        for (const [id, module] of Object.entries(chunk.modules)) {
          const normalized = id.replaceAll('\\', '/').replace(/^\0/, '');
          const nodeIndex = normalized.lastIndexOf('/node_modules/');
          if (nodeIndex < 0) continue;
          const suffix = normalized.slice(nodeIndex + 14).split('/');
          const packageName = suffix[0].startsWith('@') ? suffix.slice(0, 2).join('/') : suffix[0];
          const packageRoot = normalized.slice(0, nodeIndex + 14) + packageName;
          let metadata;
          try { metadata = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')); }
          catch { throw new Error(`Unable to identify bundled package: ${packageName}`); }
          const key = `${metadata.name}@${metadata.version}`;
          const record = packages.get(key) ?? { name: metadata.name, version: metadata.version, modules: [] };
          // Unknown rendered lengths are included conservatively; only explicit zero means fully removed.
          const rendered = module.renderedLength !== 0;
          if (!normalized.startsWith(`${root}/`)) throw new Error(`Bundled dependency is outside the reproducible source tree: ${metadata.name}`);
          record.modules.push({ path: normalized.slice(root.length + 1), chunk: chunk.fileName,
            rendered, ...(typeof module.renderedLength === 'number' ? { renderedBytes: module.renderedLength } : {}) });
          packages.set(key, record);
        }
      }
      const metadata = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'));
      const scope = { schema: 1, version: `${metadata.version}-integration.4`,
        evidence: 'Final writeBundle module provenance and emitted JavaScript SHA-256; copied vendors and generated service workers are checked separately.',
        chunks: chunks.sort((a, b) => a.path.localeCompare(b.path)),
        dependencies: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)) };
      scope.assets = Object.values(bundle).filter(item => item.type === 'asset' && /\.(?:[cm]?js|wasm|node)$/.test(item.fileName))
        .map(item => ({ path: item.fileName, bytes: Buffer.byteLength(item.source), sha256: hash(item.source) }));
      return scope;
}

export function workerScopePlugin(repo) {
  return { name: 'folia-integration-worker-license-scope', async generateBundle(_options, bundle) {
    const scope = await captureScope(repo, bundle);
    const output = path.join(repo, '.integration-build/license-scope/workers');
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, `${hash(JSON.stringify(scope.dependencies)).slice(0, 20)}.json`), JSON.stringify(scope, null, 2) + '\n');
  } };
}

export function rendererScopePlugin(repo) {
  return { name: 'folia-integration-renderer-license-scope', async buildStart() {
    const root = path.resolve(repo, '.integration-build/license-scope');
    const workers = path.resolve(root, 'workers');
    if (!workers.startsWith(`${root}${path.sep}`)) throw new Error('Worker scope cleanup escaped the explicit build output.');
    let metadata; try { metadata = await fs.lstat(workers); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (metadata?.isSymbolicLink()) throw new Error('Worker scope output must not be a symlink.');
    await fs.rm(workers, { recursive: true, force: true });
  }, async writeBundle(_options, bundle) {
    const scope = await captureScope(repo, bundle);
    const output = path.join(repo, '.integration-build/license-scope');
    let workerFiles = []; try { workerFiles = await fs.readdir(path.join(output, 'workers')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const dependencies = new Map(scope.dependencies.map(dependency => [`${dependency.name}@${dependency.version}`, dependency]));
    for (const file of workerFiles.filter(file => file.endsWith('.json'))) {
      const worker = JSON.parse(await fs.readFile(path.join(output, 'workers', file), 'utf8'));
      if (worker.version !== scope.version) throw new Error('Worker scope build version mismatch.');
      for (const dependency of worker.dependencies) {
        const key = `${dependency.name}@${dependency.version}`;
        const record = dependencies.get(key) ?? { name: dependency.name, version: dependency.version, modules: [] };
        record.modules.push(...dependency.modules.map(module => ({ ...module, worker: true })));
        dependencies.set(key, record);
      }
    }
    scope.workerGraphs = workerFiles.length;
    scope.dependencies = [...dependencies.values()].sort((a, b) => a.name.localeCompare(b.name));
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, 'renderer-modules.json'), JSON.stringify(scope, null, 2) + '\n');
  } };
}

export async function readVerifiedRendererScope(repo) {
  const scope = JSON.parse(await fs.readFile(path.join(repo, '.integration-build/license-scope/renderer-modules.json'), 'utf8'));
  const metadata = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'));
  if (scope.schema !== 1 || scope.version !== `${metadata.version}-integration.4`) throw new Error('Renderer scope version mismatch.');
  for (const chunk of [...scope.chunks, ...(scope.assets ?? [])]) {
    const target = path.resolve(repo, '.integration-build/dist', chunk.path);
    if (!target.startsWith(`${path.resolve(repo, '.integration-build/dist')}${path.sep}`)) throw new Error('Invalid renderer scope chunk path.');
    const bytes = await fs.readFile(target);
    if (bytes.length !== chunk.bytes || hash(bytes) !== chunk.sha256) throw new Error(`Stale renderer scope: ${chunk.path}`);
  }
  return scope;
}
