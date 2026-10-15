import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_VISUALIZER_MODES, BUILTIN_VISUALIZER_BACKGROUND_MODES } from '../../src/types/visualizerModes.ts';
import { MINERADIO_PRESETS } from '../../src/wallpaper/mineradio/presets.ts';
import { packageMineradio } from './mineradio/package.mjs';

// dev/wallpaper/package.mjs — assemble a self-contained folder that WE can import as index.html.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(repo, '../../outputs/FoliaWallpaper');
await fs.mkdir(output, { recursive: true });
const assets = path.resolve(output, 'assets');
if (path.dirname(assets) !== output || path.basename(output) !== 'FoliaWallpaper') throw new Error('Unexpected package asset path');
await fs.rm(assets, { recursive: true, force: true });
await fs.cp(path.join(repo, 'dist-wallpaper'), output, { recursive: true });
await fs.rename(path.join(output, 'wallpaper.html'), path.join(output, 'index.html'));
// Run after the body/native host are initialized, avoiding CEF's ES-module file loader.
const htmlPath = path.join(output, 'index.html');
const html = await fs.readFile(htmlPath, 'utf8');
await fs.writeFile(htmlPath, html.replace('type="module" crossorigin', 'defer'));
await packageMineradio(output);
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
  animationintensity: { text: '動畫強度（原版 Folia）', type: 'combo', value: 'auto', order: 10, options: [
    { label: '依主題設定', value: 'auto' }, { label: '平靜', value: 'calm' }, { label: '標準', value: 'normal' }, { label: '混亂', value: 'chaotic' },
  ] },
  settingsbutton: { text: '顯示右下角動畫設定按鈕', type: 'bool', value: true, order: 11 },
  showsettings: { text: '開啟桌面動畫選單（亦可點右下角按鈕）', type: 'bool', value: false, order: 12 },
  covercolorbg: { text: '通用背景使用封面顏色', type: 'bool', value: true, order: 13 },
  visualsystem: { text: '視覺系統', type: 'combo', value: 'folia', order: 14, options: [{ label: 'Folia 原版', value: 'folia' }, { label: 'Mineradio × Folia 歌詞', value: 'mineradio' }] },
  mineradiopreset: { text: 'Mineradio 動畫', type: 'combo', value: '0', options: MINERADIO_PRESETS, order: 15 },
  mineradiointensity: { text: 'Mineradio 粒子反應幅度（%）', type: 'slider', value: 85, min: 0, max: 200, step: 5, order: 16 },
  mineradiospeed: { text: 'Mineradio 粒子速度（%）', type: 'slider', value: 100, min: 0, max: 200, step: 5, order: 17 },
  mineradiopoint: { text: 'Mineradio 粒子大小（%）', type: 'slider', value: 100, min: 50, max: 200, step: 5, order: 18 },
  mineradiobloom: { text: 'Mineradio 粒子光暈（%）', type: 'slider', value: 62, min: 0, max: 120, step: 5, order: 19 },
  mineradioopacity: { text: 'Mineradio 粒子透明度（%）', type: 'slider', value: 80, min: 0, max: 100, step: 5, order: 20 },
  showsources: { text: '開啟播放來源選擇（桌面選單頂端）', type: 'bool', value: false, order: 21 },
};
await fs.writeFile(path.join(output, 'project.json'), JSON.stringify({
  title: 'Folia Wallpaper', type: 'web', file: 'index.html', preview: 'preview.png',
  description: '原版 Folia 視覺舞臺。由 Wallpaper Engine 取得歌曲、封面、時間軸與系統頻譜；自動尋找同步歌詞。',
  general: { properties, supportsaudioprocessing: true },
}, null, 2));
await fs.writeFile(path.join(output, 'SOURCE.json'), JSON.stringify({
  upstream: 'https://github.com/chthollyphile/folia-major', commit: 'a3574a784cb20972ac85edfd71449b1eb848ea7f',
  version: '0.7.17-wallpaper.10.10', license: 'AGPL-3.0', renderer: 'src/components/visualizer/VisualizerRenderer.tsx',
  mineradio: { upstream: 'https://github.com/XxHuberrr/Mineradio-paused', commit: 'd43de565acabfdc1a9c9820a27e81a98ccbebcef', license: 'GPL-3.0', presets: MINERADIO_PRESETS.map(preset => preset.value), excluded: ['7: Sonic Topography', '8: Sonic Workshop'], source: 'dev/wallpaper/mineradio' },
  adapterSource: path.join(repo, 'src/wallpaper'), buildCommand: 'npm run build:wallpaper',
  note: 'Local adaptation. Original visualizer source is reused; this is not an upstream release.',
}, null, 2));
console.log(output);
