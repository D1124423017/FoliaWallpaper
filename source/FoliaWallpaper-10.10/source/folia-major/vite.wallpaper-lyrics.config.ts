import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// vite.wallpaper-lyrics.config.ts — package the original matcher for Node, replacing only host adapters / worker dispatch.
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  envDir: process.env.FOLIA_PUBLIC_BUILD === '1' ? false : root,
  plugins: [{ name: 'standalone-lyric-host', enforce: 'pre', resolveId(source, importer) {
    if (source.endsWith('providerRegistry') && importer?.endsWith('/autoMatchBestLyric.ts')) return path.join(root, 'dev/wallpaper/lyrics/providerRegistry.ts');
    if (source.endsWith('workerClient') && importer?.endsWith('/neteaseProcessing.ts')) return path.join(root, 'dev/wallpaper/lyrics/parse.ts');
  } }],
  resolve: { alias: { '@': path.join(root, 'src') } },
  ssr: { noExternal: ['@applemusic-like-lyrics/ttml', '@xmldom/xmldom', 'wanakana', 'opencc-js', 'blueimp-md5'] },
  build: { ssr: 'dev/wallpaper/lyrics/server.ts', outDir: 'dist-wallpaper-lyrics', target: 'node24',
    rollupOptions: { output: { entryFileNames: 'server.mjs' } } },
});
