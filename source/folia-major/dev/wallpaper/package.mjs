import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_VISUALIZER_MODES, BUILTIN_VISUALIZER_BACKGROUND_MODES } from '../../src/types/visualizerModes.ts';

// dev/wallpaper/package.mjs — assemble a self-contained folder that WE can import as index.html.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(repo, '../../outputs/FoliaWallpaper');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.join(repo, 'dist-wallpaper'), output, { recursive: true });
await fs.rename(path.join(output, 'wallpaper.html'), path.join(output, 'index.html'));
for (const [from, to] of [['wallpaper-host.js', 'wallpaper-host.js'], ['LICENSE', 'LICENSE'], ['img/preview-fume.png', 'preview.png'], ['docs/wallpaper/使用說明.md', '使用說明.md']]) {
  await fs.copyFile(path.join(repo, from), path.join(output, to));
}
const localeSource = await fs.readFile(path.join(repo, 'src/i18n/locales/zh-TW.ts'), 'utf8');
const translatedStrings = new Map([...localeSource.matchAll(/"([^"\\]+)"\s*:\s*("(?:\\.|[^"\\])*")/g)]
  .map(match => [match[1], JSON.parse(match[2])]));
// Read the original entry's translation key; do not maintain another list of Chinese mode names.
async function foliaLabel(mode, background = false) {
  const entry = await fs.readFile(path.join(repo, 'src/components/visualizer', background ? 'backgrounds' : '', mode, 'entry.tsx'), 'utf8');
  const key = entry.match(/\blabelKey:\s*['"]([^'"]+)['"]/)?.[1];
  const label = key && translatedStrings.get(key.split('.').at(-1));
  if (!label) throw new Error(`Missing Folia Traditional Chinese label: ${mode}`);
  return label;
}
const modes = await Promise.all(BUILTIN_VISUALIZER_MODES.map(async value => ({ label: await foliaLabel(value), value })));
const backgrounds = await Promise.all(BUILTIN_VISUALIZER_BACKGROUND_MODES.filter(value => value !== 'url')
  .map(async value => ({ label: await foliaLabel(value, true), value })));
const properties = {
  visualizer: { text: '歌詞樣式', type: 'combo', value: 'fume', options: modes, order: 0 },
  background: { text: '背景型別', type: 'combo', value: 'latent', options: backgrounds, order: 1 },
  lyricsscale: { text: '歌詞大小（%）', type: 'slider', value: 100, min: 60, max: 160, step: 5, order: 2 },
  lyricsoffset: { text: '歌詞時間校正（毫秒，正值提早）', type: 'slider', value: 0, min: -5000, max: 5000, step: 50, order: 3 },
  audiogain: { text: '音樂反應強度（%）', type: 'slider', value: 100, min: 0, max: 300, step: 5, order: 4 },
  showmetadata: { text: '顯示歌曲與封面', type: 'bool', value: true, order: 5 },
  diagnostics: { text: '顯示連線診斷', type: 'bool', value: false, order: 6 },
  demo: { text: '示範模式（原創文字／模擬頻譜，不播放音訊）', type: 'bool', value: false, order: 7 },
  themesource: { text: '主題來源', type: 'combo', value: 'cover', order: 8, options: [{ label: '封面取色（不使用 AI）', value: 'cover' }, { label: 'AI 歌詞主題（需設定 AI 連線）', value: 'ai' }] },
  themevariant: { text: '主題明暗', type: 'combo', value: 'dark', order: 9, options: [{ label: '暗色', value: 'dark' }, { label: '亮色', value: 'light' }] },
};
await fs.writeFile(path.join(output, 'project.json'), JSON.stringify({
  title: 'Folia Wallpaper', type: 'web', file: 'index.html', preview: 'preview.png',
  description: '原版 Folia 視覺舞臺。由 Wallpaper Engine 取得歌曲、封面、時間軸與系統頻譜；自動尋找同步歌詞。',
  general: { properties, supportsaudioprocessing: true },
}, null, 2));
await fs.writeFile(path.join(output, 'SOURCE.json'), JSON.stringify({
  upstream: 'https://github.com/chthollyphile/folia-major', commit: 'a3574a784cb20972ac85edfd71449b1eb848ea7f',
  version: '0.7.17-wallpaper.8.1', license: 'AGPL-3.0', renderer: 'src/components/visualizer/VisualizerRenderer.tsx',
  adapterSource: path.join(repo, 'src/wallpaper'), buildCommand: 'npm run build:wallpaper',
  note: 'Local adaptation. Original visualizer source is reused; this is not an upstream release.',
}, null, 2));
console.log(output);
