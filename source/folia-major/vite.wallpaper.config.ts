import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// vite.wallpaper.config.ts — build the visual stage only, with portable relative URLs and no PWA.
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  envDir: process.env.FOLIA_PUBLIC_BUILD === '1' ? false : root,
  base: './', publicDir: false, plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  define: { __APP_VERSION__: JSON.stringify('0.7.17-wallpaper.8'), __BUILD_REPO__: JSON.stringify('local/FoliaWallpaper'),
    __BUILD_COMMIT__: JSON.stringify('a3574a7'), __COMMIT_HASH__: JSON.stringify('a3574a7-wallpaper.8'),
    __GIT_BRANCH__: JSON.stringify('wallpaper-local'), __APP_VERSION_LABEL__: JSON.stringify('Wallpaper'),
    __APP_RELEASE_CHANNEL__: JSON.stringify('local'), __DOCKER_STACK_VERSION__: JSON.stringify('') },
  worker: { format: 'es' },
  build: { outDir: 'dist-wallpaper', target: 'chrome100', rollupOptions: { input: 'wallpaper.html' } },
  server: { host: '127.0.0.1', port: 3187, strictPort: true },
});
