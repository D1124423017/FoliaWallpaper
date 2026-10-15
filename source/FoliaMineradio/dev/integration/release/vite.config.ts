import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ConfigEnv, UserConfig } from 'vite';
import foliaConfig from '../../../vite.config';
import { rendererScopePlugin, workerScopePlugin } from './renderer-scope.mjs';

// dev/integration/release/vite.config.ts — build the same player with isolated output and no developer .env files.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const metadata = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')) as { version: string };
export default async function integrationConfig(environment: ConfigEnv): Promise<UserConfig> {
  const original = await foliaConfig(environment);
  return {
    ...original,
    plugins: [...(original.plugins ?? []), rendererScopePlugin(repo)],
    worker: { ...original.worker, plugins: () => [...(original.worker?.plugins?.() ?? []), workerScopePlugin(repo)] },
    envDir: path.join(repo, '.integration-build/public-env'),
    build: { ...original.build, outDir: path.join(repo, '.integration-build/dist'), emptyOutDir: true },
    define: {
      ...original.define,
      __APP_VERSION__: JSON.stringify(`${metadata.version}-integration.4`),
      'import.meta.env.VITE_FOLIA_INTEGRATION_BUILD': JSON.stringify('true'),
      'import.meta.env.VITE_LOCAL_TRADITIONAL_EDITION': JSON.stringify('true'),
    },
  };
}
