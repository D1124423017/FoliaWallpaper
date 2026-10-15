import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as OpenCC from 'opencc-js';
import { cleanUnsupportedMineradioOutput, unsupportedMineradioPresets, unsupportedMineradioVendors } from './unsupported-output.mjs';

// Package the upstream DOM, shaders, camera and shelf as an isolated Folia presentation.
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const defaultUpstream = path.join(directory, 'upstream');
const translate = OpenCC.Converter({ from: 'cn', to: 'tw' });
const translatedUiNames = new Map([['Cover Picker', '封面取色器'], ['Color', '色彩'], ['Search mode', '搜尋模式']]);
const excluded = unsupportedMineradioPresets;
const excludedVendorDirectories = unsupportedMineradioVendors;
const suppressStartup = new Set(['initCuefieldAutoMix', 'initializeWallpaperEngineLibrary', 'bindSystemMemoryControls']);

// Localize static interface copy only; song metadata, original font names and annotations stay untouched.
function translateUiCopy(value) {
  const name = translatedUiNames.get(value.trim());
  if (name) return value.replace(value.trim(), name);
  return translate(value).replaceAll('搜索', '搜尋').replaceAll('默認', '預設')
    .replaceAll('緩存', '快取').replaceAll('高清', '高解析');
}

function withoutIndependentStartup(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const remove = ast.body.filter(node => node.type === 'ExpressionStatement'
    && node.expression.type === 'CallExpression' && suppressStartup.has(node.expression.callee.name));
  for (const node of remove.reverse()) source = source.slice(0, node.start)
    + '// Independent player startup is owned by the Folia bridge.\n' + source.slice(node.end);
  return source;
}

function translateUiLiterals(source) {
  const edits = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Literal' && typeof node.value === 'string'
      && (/[\u3400-\u9fff]/.test(node.value) || translatedUiNames.has(node.value.trim()))) {
      const converted = translateUiCopy(node.value);
      if (converted !== node.value) edits.push({ start: node.start, end: node.end, text: JSON.stringify(converted) });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'script' }));
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

async function copyTree(source, target) {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (excluded.has(entry.name) || excludedVendorDirectories.has(entry.name)) continue;
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await fs.copyFile(from, to);
  }
}

export async function packageMineradioPlayer(output = path.join(root, 'public/integration/mineradio'), upstream = defaultUpstream) {
  const target = path.resolve(output);
  const source = path.resolve(upstream);
  const loader = await fs.readFile(path.join(source, 'public/js/index-loader.js'), 'utf8');
  const modules = [...loader.matchAll(/'([^']+\.js)'/g)].map(match => match[1])
    .filter(name => !excluded.has(name) && name !== 'js/modules/10-shell/05-startup-bindings.js');
  if (!modules.includes('js/modules/11-main-loop.js')) throw new Error('Unsupported upstream loader');
  const removedUnsupported = await cleanUnsupportedMineradioOutput(target, source,
    [path.join(root, 'public'), path.join(root, '.integration-build'), path.resolve(root, '../../outputs')], 'integration');
  for (const folder of ['assets', 'css', 'vendor', 'js/modules']) {
    await copyTree(path.join(source, 'public', folder), path.join(target, folder));
  }
  await fs.copyFile(path.join(source, 'public/default-user-fx-archive.json'), path.join(target, 'default-user-fx-archive.json'));
  await copyTree(path.join(directory, 'fonts'), path.join(target, 'assets/fonts'));
  const chunks = ['// Mineradio GPL-3.0-only: original functions, DOM events, shaders and camera retained.'];
  for (const name of modules) chunks.push(`\n// Original upstream file: ${name}\n${translateUiLiterals(withoutIndependentStartup(await fs.readFile(path.join(source, 'public', name), 'utf8')))}`);
  chunks.push('\n' + await fs.readFile(path.join(directory, 'bridge.js'), 'utf8'));
  // The original final rAF starts asynchronously, after bridge globals and the virtual media are installed.
  await fs.writeFile(path.join(target, 'upstream-runtime.js'), chunks.join('\n'));
  for (const name of ['guard.js', 'bridge-actions.js', 'bridge-state.js', 'bridge-visuals.js', 'bridge-capabilities.js', 'integration.css', 'NOTICE.md', 'README.md']) {
    await fs.copyFile(path.join(directory, name), path.join(target, name));
  }
  await fs.copyFile(path.join(source, 'LICENSE'), path.join(target, 'LICENSE-GPL-3.0.txt'));
  await fs.copyFile(path.join(source, 'NOTICE.md'), path.join(target, 'UPSTREAM-NOTICE.md'));
  await fs.copyFile(path.join(root, 'node_modules/opencc-js/dist/umd/cn2t.js'), path.join(target, 'vendor/opencc-cn2t.js'));
  await fs.copyFile(path.join(root, 'node_modules/opencc-js/LICENSE'), path.join(target, 'LICENSE-OpenCC.txt'));
  let html = await fs.readFile(path.join(source, 'public/index.html'), 'utf8');
  html = html.replace(/<link\s+href="https:\/\/fonts\.googleapis\.com[\s\S]*?rel="stylesheet">/, '')
    .replace('<html lang="zh-CN">', '<html lang="zh-Hant">')
    .replace('<title>Mineradio</title>', '<title>Folia × Mineradio</title>')
    .replace('<script src="vendor/three.r128.min.js"></script>', '<script src="guard.js"></script>\n  <script src="vendor/three.r128.min.js"></script>')
    .replace('<script src="js/preload-mode.js"></script>', '<script src="vendor/opencc-cn2t.js"></script>\n  <script src="bridge-actions.js"></script>\n  <script src="bridge-state.js"></script>\n  <script src="bridge-visuals.js"></script>\n  <script src="bridge-capabilities.js"></script>')
    .replace('<script src="js/index-loader.js"></script>', '<script src="upstream-runtime.js"></script>')
    .replace('</head>', '<link rel="stylesheet" href="integration.css">\n</head>');
  html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; '
    + 'style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob: http: https: file: folia-cover:; font-src \'self\' data:; '
    + 'connect-src \'self\' blob: data:; media-src \'self\' blob: data: file:; worker-src \'none\'; object-src \'none\'; base-uri \'self\'">');
  // Convert static copy only. Upstream source comments and @note annotations remain verbatim.
  html = html.replace(/>([^<>]+)</g, (match, text) => '>' + translateUiCopy(text) + '<')
    .replace(/(title|aria-label|placeholder)="([^"]*)"/g, (match, name, text) => `${name}="${translateUiCopy(text)}"`);
  await fs.writeFile(path.join(target, 'index.html'), html);
  await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({
    schema: 'folia-mineradio-runtime-v1', upstream: 'XxHuberrr/Mineradio-paused',
    commit: 'd43de565acabfdc1a9c9820a27e81a98ccbebcef', modules, excluded: [...excluded],
    excludedVendorDirectories: [...excludedVendorDirectories],
    playbackOwner: 'Folia', bridge: 'folia-mineradio-core-v1',
  }, null, 2));
  return { target, modules: modules.length, removedUnsupported };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await packageMineradioPlayer(process.argv[2], process.argv[3]));
}
