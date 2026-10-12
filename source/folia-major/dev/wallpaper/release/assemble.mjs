import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// dev/wallpaper/release/assemble.mjs — public payloads contain relative paths; runtime data and models are never copied.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workspace = path.resolve(repo, '../..');
const publication = path.join(workspace, 'outputs', 'FoliaWallpaper_Publication');
const stage = path.join(publication, 'stage');
const tools = path.join(stage, 'FoliaWallpaperTools'), wallpaper = path.join(stage, 'FoliaWallpaper');
const source = path.join(repo, 'dev', 'wallpaper', 'release');
await fs.mkdir(path.join(tools, 'runtime'), { recursive: true });
const vendor = path.join(publication, 'vendor-cache');
const nodeVendor = path.join(vendor, 'node-v24.21.0-win-x64', 'node-v24.21.0-win-x64');
const uvVendor = path.join(vendor, 'uv-x86_64-pc-windows-msvc');
for (const [from, to] of [[path.join(nodeVendor, 'node.exe'), 'runtime/node.exe'], [path.join(nodeVendor, 'LICENSE'), 'runtime/Node-LICENSE'],
  [path.join(uvVendor, 'uv.exe'), 'runtime/uv.exe'], [path.join(repo, 'dist-wallpaper-lyrics/server.mjs'), 'service/server.mjs'],
  [path.join(source, 'service-package.json'), 'service/package.json'], [path.join(source, 'control.mjs'), 'control.mjs'],
  [path.join(source, 'README-Tools.md'), '使用說明.md'], [path.join(repo, 'LICENSE'), 'LICENSE']]) {
  await fs.mkdir(path.dirname(path.join(tools, to)), { recursive: true }); await fs.copyFile(from, path.join(tools, to));
}
for (const name of ['electron/aiTextClient.cjs', 'shared/lyricSegmentationPrompt.cjs']) {
  await fs.mkdir(path.dirname(path.join(tools, 'service', name)), { recursive: true });
  await fs.copyFile(path.join(repo, name), path.join(tools, 'service', name));
}
for (const name of ['uv-LICENSE-APACHE', 'uv-LICENSE-MIT']) await fs.copyFile(path.join(vendor, name), path.join(tools, 'runtime', name));
await fs.copyFile(path.join(source, 'service-package-lock.json'), path.join(tools, 'service/package-lock.json'));
await fs.cp(path.join(source, 'lib'), path.join(tools, 'lib'), { recursive: true });
await fs.cp(path.join(repo, 'dev/wallpaper/chrome'), path.join(tools, 'chrome'), { recursive: true });
await fs.writeFile(path.join(tools, 'chrome/connection.js'), '// Generated separately on each computer by the launcher.\nexport const token = "";\n');
await fs.copyFile(path.join(repo, 'LICENSE'), path.join(tools, 'chrome/LICENSE'));
await fs.mkdir(path.join(tools, 'audio'), { recursive: true });
for (const name of ['worker.py', 'device.py']) await fs.copyFile(path.join(repo, 'dev/wallpaper/audio', name), path.join(tools, 'audio', name));
for (const name of ['prepare-model.py', 'requirements-cpu.txt', 'requirements-gpu.txt'])
  await fs.copyFile(path.join(source, 'audio', name), path.join(tools, 'audio', name));
for (const [name, action] of [['啟動歌詞服務', 'start'], ['停止歌詞服務', 'stop'], ['查看服務狀態', 'status'],
  ['設定AI連線', 'settings'], ['啟用本機音訊校正', 'audio-enable'], ['啟用NVIDIA加速', 'audio-gpu'], ['停用本機音訊校正', 'audio-disable']]) {
  await fs.writeFile(path.join(tools, `${name}.cmd`), `@echo off\r\nchcp 65001 >nul\r\n"%~dp0runtime\\node.exe" "%~dp0control.mjs" ${action}\r\nif errorlevel 1 pause\r\n`, 'utf8');
}
await fs.writeFile(path.join(tools, 'BUILD.json'), JSON.stringify({ version: '0.7.17-wallpaper.8', modified: '2026-10-12', platform: 'Windows x64',
  node: '24.21.0', uv: '0.13.0', python: '3.13.14', source: 'https://github.com/D1124423017/FoliaWallpaper', audioDefault: 'disabled' }, null, 2));
await fs.cp(path.join(workspace, 'outputs/FoliaWallpaper'), wallpaper, { recursive: true });
await fs.copyFile(path.join(source, 'README-Wallpaper.md'), path.join(wallpaper, '使用說明.md'));
const information = JSON.parse(await fs.readFile(path.join(wallpaper, 'SOURCE.json'), 'utf8'));
information.adapterSource = 'source/folia-major/src/wallpaper'; information.sourceUrl = 'https://github.com/D1124423017/FoliaWallpaper/releases/tag/wallpaper.8';
await fs.writeFile(path.join(wallpaper, 'SOURCE.json'), JSON.stringify(information, null, 2));
const project = JSON.parse(await fs.readFile(path.join(wallpaper, 'project.json'), 'utf8'));
project.general.properties.themesource.value = 'cover';
project.general.properties.themesource.options = [{ label: '封面配色', value: 'cover' }, { label: 'AI 主題（自備 API 金鑰）', value: 'ai' }];
project.description = '基於 Folia 的非官方繁體中文歌詞動畫桌布。完整同步歌詞需搭配本機背景服務；原始碼及配套下載見使用說明。';
await fs.writeFile(path.join(wallpaper, 'project.json'), JSON.stringify(project, null, 2));
console.log(JSON.stringify({ tools, wallpaper, runtimeDataIncluded: false, developerPairingIncluded: false }));
