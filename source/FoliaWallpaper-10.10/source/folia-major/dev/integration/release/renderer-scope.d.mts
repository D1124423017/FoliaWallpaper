import type { Plugin } from 'vite';
export function rendererScopePlugin(repo: string): Plugin;
export function workerScopePlugin(repo: string): Plugin;
export function readVerifiedRendererScope(repo: string): Promise<{
  schema: number; version: string; evidence: string;
  chunks: Array<{ path: string; bytes: number; sha256: string }>;
  dependencies: Array<{ name: string; version: string; modules: Array<{ path: string; chunk: string; rendered: boolean; renderedBytes?: number }> }>;
}>;
