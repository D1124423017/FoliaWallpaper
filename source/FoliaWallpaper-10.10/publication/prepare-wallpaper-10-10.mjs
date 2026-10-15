import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

// prepare-wallpaper-10-10.mjs — isolated public assembly; never changes installed wallpapers or initializes a service.
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = name => args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const wrapper = path.basename(here) === 'publication';
const publication = path.resolve(option('--output-root') || (wrapper ? path.join(here, '../outputs/FoliaWallpaper_Publication') : path.join(here, '..')));
const workspace = path.resolve(publication, '../..');
const repo = path.resolve(option('--source-root') || (wrapper ? path.join(here, '../source/folia-major') : path.join(workspace, 'work/folia-major-zhTW')));
const require = createRequire(path.join(repo, 'package.json'));
const zipReader = require('unzipper');
const version = '0.7.17-wallpaper.10.10', tag = 'wallpaper.10.10';
const url = `https://github.com/D1124423017/FoliaWallpaper/releases/tag/${tag}`;
const stage = path.join(publication, 'stage-10.10');
const wallpaper = path.join(stage, 'FoliaWallpaper'), tools = path.join(stage, 'FoliaWallpaperTools');
const sourceStage = path.join(publication, 'stage-10.10-source/FoliaWallpaper');
const sourceSnapshot = path.join(sourceStage, 'source/folia-major');
const hash = value => createHash('sha256').update(value).digest('hex');
const hashFile = async file => hash(await fs.readFile(file));
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const json = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const copy = async (from, to) => { await fs.mkdir(path.dirname(to), { recursive: true }); await fs.cp(from, to, { recursive: true, force: true }); };
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_'))),
  FOLIA_PUBLIC_BUILD: '1', npm_config_cache: path.join(publication, 'npm-cache-10.10'), npm_config_audit: 'false', npm_config_fund: 'false' };
function run(command, parameters, cwd = repo) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, parameters, { cwd, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(`Build command failed (${code}): ${parameters[0]}`)));
  });
}
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
async function ownedFolder(folder) {
  const expected = path.relative(publication, folder);
  if (expected.startsWith('..') || path.isAbsolute(expected) || !expected) throw new Error('Publication destination escaped its parent.');
  if (await exists(folder)) throw new Error(`Refusing to overwrite existing publication stage: ${folder}. Choose a new --output-root for a rebuild.`);
  await fs.mkdir(folder, { recursive: true });
}
function safeName(root, name) {
  const target = path.resolve(root, name);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Archive path escaped: ${name}`);
  return target;
}
async function extractSource(archive) {
  const digest = await hashFile(archive);
  const expected = '663b9899158df1c7ce9308fd2425c8403b883cbcf6523763d37bf735c1ebc112';
  if (digest !== expected) throw new Error('Frozen integration source archive did not match the approved SHA-256.');
  await ownedFolder(path.join(publication, 'stage-10.10-source'));
  const entries = await zipReader.Open.file(archive);
  const manifestEntry = entries.files.find(entry => entry.path === 'FoliaMineradio/SOURCE-MANIFEST.json');
  const manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8'));
  if (manifest.files.length !== 3507) throw new Error('Unexpected frozen source count.');
  const selected = new Map(manifest.files.map(file => [file.path, file]));
  for (const entry of entries.files) {
    if (!entry.path.startsWith('FoliaMineradio/') || entry.type === 'Directory') continue;
    const name = entry.path.slice('FoliaMineradio/'.length);
    if (name === 'SOURCE-MANIFEST.json') continue;
    if (/(?:^|\/)(?:sonic-workshop|sonic-topography)(?:\/|$)/i.test(name)) throw new Error('Excluded Sonic vendor source in frozen archive.');
    const record = selected.get(name); if (!record) throw new Error(`Unmanifested frozen source: ${name}`);
    const bytes = await entry.buffer();
    if (hash(bytes) !== record.sha256 || bytes.length !== record.bytes) throw new Error(`Frozen source mismatch: ${name}`);
    const target = safeName(sourceSnapshot, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
  }
  await copy(archive.replace(/\.zip$/, '.zip.sha256'), path.join(sourceStage, 'publication/FROZEN-SOURCE.zip.sha256'));
  await json(path.join(sourceStage, 'publication/FROZEN-SOURCE-MANIFEST.json'), manifest);
  return { file: path.basename(archive), sha256: digest, sourceFiles: manifest.files.length };
}
/** Download pinned inputs directly; ZIP entries are extracted below without a PowerShell module dependency. */
async function prepareVendors() {
  const directory = path.join(publication, 'vendor-cache');
  await fs.mkdir(directory, { recursive: true });
  const inputs = [
    ['node-v24.21.0-win-x64.zip', 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip', '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'],
    ['uv-x86_64-pc-windows-msvc.zip', 'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-x86_64-pc-windows-msvc.zip', '088962f9e7b7bd9ea740c04c650b2a21c8928c345bd99ac24350dc924dba656c'],
    ['uv-LICENSE-APACHE', 'https://raw.githubusercontent.com/astral-sh/uv/0.13.0/LICENSE-APACHE', 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4'],
    ['uv-LICENSE-MIT', 'https://raw.githubusercontent.com/astral-sh/uv/0.13.0/LICENSE-MIT', '860e3d7a86b84e6a7012c7a635fc64df475cebc6cce34dfeb73a5982ec58176c'],
  ];
  for (const [name, url, expected] of inputs) {
    const destination = path.join(directory, name);
    if (!(await exists(destination))) {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Vendor download failed: ${name} (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== expected) throw new Error(`Vendor checksum mismatch: ${name}`);
      await fs.writeFile(destination, bytes, { flag: 'wx' });
    }
    if (await hashFile(destination) !== expected) throw new Error(`Vendor checksum mismatch: ${name}`);
    console.log(`Verified ${name}`);
  }
}
/** Preserve complete license bodies in READMEs and the verified same-version union, without counting publisher metadata as text. */
async function completeNotices() {
  const records = JSON.parse(await fs.readFile(path.join(tools, 'licenses/service-dependency-manifest.json'), 'utf8'));
  const unionRecords = JSON.parse(await fs.readFile(path.join(tools, 'licenses/dependency-manifest.json'), 'utf8'));
  const unionById = new Map(unionRecords.map(record => [`${record.name}@${record.version}`, record]));
  const fullLicense = text => /Permission is hereby granted[\s\S]+THE SOFTWARE IS PROVIDED/i.test(text)
    || /Permission to use, copy, modify,[\s\S]+THE SOFTWARE IS PROVIDED/i.test(text);
  const codeFiles = async directory => {
    const files = [];
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (item.name === 'node_modules') continue;
      const file = path.join(directory, item.name);
      if (item.isDirectory()) files.push(...await codeFiles(file));
      else if (/\.(?:[cm]?js|node|wasm)$/i.test(item.name) && (await fs.stat(file)).size > 0) files.push(file);
    }
    return files;
  };
  for (const record of records) {
    const directory = path.join(tools, 'service', record.packagePath);
    const id = `${record.name}@${record.version}`, targetName = id.replaceAll('/', '__');
    for (const name of await fs.readdir(directory)) {
      if (!/^readme(?:[.-]|$)/i.test(name) || !(await fs.stat(path.join(directory, name))).isFile()) continue;
      if (fullLicense(await fs.readFile(path.join(directory, name), 'utf8'))) {
        if (!record.licenseFiles.includes(name)) record.licenseFiles.push(name);
        for (const output of [wallpaper, tools]) await copy(path.join(directory, name), path.join(output, 'licenses/service-dependencies', targetName, name));
      }
    }
    const unionRecord = unionById.get(id);
    record.retainedUnionLicenseFiles = [];
    if (unionRecord?.noticeStatus === 'documents-retained') for (const name of unionRecord.licenseFiles || []) {
      const license = path.join(tools, 'licenses/dependencies', targetName, name);
      if (await exists(license)) record.retainedUnionLicenseFiles.push(`dependencies/${targetName}/${name}`);
    }
    const implementation = await codeFiles(directory);
    record.implementationFiles = implementation.map(file => path.relative(directory, file).split(path.sep).join('/'));
    record.noticeStatus = record.licenseFiles.length || record.retainedUnionLicenseFiles.length ? 'documents-retained'
      : implementation.length ? 'publisher-text-missing' : 'metadata-only-or-empty-implementation';
    if (record.noticeStatus !== 'documents-retained') record.noticeLimitation = unionRecord?.noticeLimitation || 'Published package has no retained full license text; publisher declaration is not a replacement license.';
  }
  const coverage = { serviceDependencyCopies: records.length,
    documentsRetained: records.filter(record => record.noticeStatus === 'documents-retained').length,
    metadataOnlyOrEmptyImplementation: records.filter(record => record.noticeStatus === 'metadata-only-or-empty-implementation').map(record => ({ name: record.name, version: record.version, limitation: record.noticeLimitation })),
    missingImplementationNotices: records.filter(record => record.noticeStatus === 'publisher-text-missing').map(record => ({ name: record.name, version: record.version, packagePath: record.packagePath })),
    statement: 'Service-specific scope, separate from the retained player/build dependency union. Metadata declarations are never counted as full license text.' };
  const sourcePublicRoot = wrapper ? path.resolve(here, '..') : sourceStage;
  const fontSource = path.join(repo, 'dev/integration/mineradio/fonts');
  for (const name of await fs.readdir(fontSource)) if (/-OFL\.txt$|^FONT-MANIFEST\.json$/i.test(name)) {
    for (const output of [wallpaper, tools]) await copy(path.join(fontSource, name), path.join(output, 'licenses/fonts', name));
    await copy(path.join(fontSource, name), path.join(sourcePublicRoot, 'publication/licenses-union/fonts', name));
  }
  for (const output of [wallpaper, tools]) {
    await json(path.join(output, 'licenses/service-dependency-manifest.json'), records);
    await json(path.join(output, 'licenses/service-notice-coverage.json'), coverage);
    await fs.writeFile(path.join(output, 'licenses/SERVICE-NOTICES.md'), `# Standalone lyric service notices\n\n${coverage.documentsRetained}/${coverage.serviceDependencyCopies} installed package copies have retained complete notice documents. The remaining ${coverage.metadataOnlyOrEmptyImplementation.length} copies (gzip@0.1.0 and https@1.0.0) contain metadata or zero-byte implementation only; their original-version text gaps remain documented and are not called complete licenses. Code-bearing copies without retained notice: ${coverage.missingImplementationNotices.length}.\n\nFull text in published README files is retained verbatim; same-version officially collected documents in the union are referenced explicitly. No other version's MIT/ISC document is substituted for a missing notice.\n`);
  }
  if (await exists(path.join(stage, 'PUBLICATION-MANIFEST.json'))) {
    const metadata = JSON.parse(await fs.readFile(path.join(stage, 'PUBLICATION-MANIFEST.json'), 'utf8')); metadata.serviceLicenseCoverage = coverage;
    await json(path.join(stage, 'PUBLICATION-MANIFEST.json'), metadata);
  }
  if (await exists(path.join(sourcePublicRoot, 'publication/WALLPAPER-SOURCE-MANIFEST.json'))) {
    const metadata = JSON.parse(await fs.readFile(path.join(sourcePublicRoot, 'publication/WALLPAPER-SOURCE-MANIFEST.json'), 'utf8')); metadata.serviceLicenseCoverage = coverage;
    await json(path.join(sourcePublicRoot, 'publication/WALLPAPER-SOURCE-MANIFEST.json'), metadata);
  }
  return coverage;
}
if (args.includes('--complete-notices')) {
  const coverage = await completeNotices();
  if (!wrapper) await copy(fileURLToPath(import.meta.url), path.join(sourceStage, 'publication/prepare-wallpaper-10-10.mjs'));
  console.log(JSON.stringify(coverage, null, 2)); process.exit(0);
}
const rawReadme = `# Folia Wallpaper ${tag}\n\n基於 Folia 與 Mineradio 的非官方 Wallpaper Engine Web 桌布。桌布不播放音訊，也不需要啟動 Folia.exe；音樂仍由原播放器播放。\n\n## 安裝\n\n1. 解壓縮整個 FoliaWallpaper 資料夾，將 index.html 匯入 Wallpaper Engine。不能只複製 index.html。\n2. 另解壓縮同版本 FoliaWallpaperTools，執行「啟動歌詞服務.cmd」。僅訂閱 Steam 桌布不會安裝配套服務、Chrome 擴充功能或模型。\n3. Chrome YouTube／YouTube Music 請在 chrome://extensions 載入工具中的 chrome 資料夾，再重新整理音樂分頁。在想用的分頁點擴充功能「指定此分頁為 Folia 播放來源」，或在桌布的播放來源選單選擇。\n4. 其他提供 Windows 媒體資訊的播放器，可在播放來源選單選取。未提供歌名或時間軸的程式只能偵測聲音，無法保證辨識歌曲或同步歌詞。\n5. 預設封面配色，AI、本機音訊分析、Gemini 音訊上傳與滾輪轉接都不會自動啟用。\n\n## 視覺與時間\n\n14 種 Folia 原版歌詞樣式、5 種原版背景；也可選 Mineradio × Folia 歌詞，使用10種粒子動畫及虛空安靜背景。鏡頭為桌布相容層的預設構圖，未包含完整 Mineradio 播放器控制面板或3D歌單。設定可匯出／匯入；不同螢幕的選單分別處理。\n\n找到歌詞但時間未驗證時先顯示歌詞預覽，驗證成功才切為同步動畫。字幕、歌詞、錄音版本與時間軸的品質均影響結果，不能保證每首歌或真正逐字時間。\n\n若選用 Folia Mineradio 整合播放器，可在播放來源選「Folia Mineradio（共用歌詞／時間軸）」。此模式使用播放器提供的同一份歌曲、歌詞及時間；外部播放器模式仍依原服務校正。這是兩種資料來源，不代表桌布本身取得平台播放權限。\n\n## 音訊、AI 與費用\n\n本機 Whisper 校正須使用者同意並首次下載獨立 Python／模型。只在本機分析系統喇叭或耳機輸出，不使用麥克風、不保存錄音；可能包含同時播放的其他程式聲音。首次片段12秒，仍另需辨識時間。\n\nAI 主題另須自己的 Gemini／OpenAI 相容金鑰，最多傳送2000字元歌詞文字。可選的「Gemini 音訊校正」是獨立音訊上傳同意項目；啟用後會將10秒系統音訊送至 Google Gemini 3.5 Flash-Lite。每首每天最多2次、每日最多20次（UTC），每次最多等待15秒；與已有歌詞比對確認後才使用結果。API 免費額度與收費依自己的供應商及專案，工具不替使用者啟用付費帳單，也不保證付費專案零費用。金鑰由使用者自行設定，公開包沒有任何使用者金鑰或配對token。\n\n## 原作與下載\n\nFolia：chthollyphile 及貢獻者，GNU AGPL-3.0，基底0.7.17／a3574a784cb20972ac85edfd71449b1eb848ea7f。\nhttps://github.com/chthollyphile/folia-major\n\nMineradio：XxHuberrr 及貢獻者，GNU GPL-3.0，d43de565acabfdc1a9c9820a27e81a98ccbebcef。Emily 粒子原創與各貢獻者依原通知致謝。Three.js 保留MIT通知。\nhttps://github.com/XxHuberrr/Mineradio-paused\n\n本版沿用適用的 AGPLv3／GPLv3 條文，保留原署名、完整授權與修改版對應原始碼。Sonic Topography（預設7）與 Sonic Workshop（預設8）第三方動畫未收錄。軟體按現狀提供，不是原專案官方版本；音樂、歌詞、封面與外部內容權利仍屬各自權利人。本作品不附歌曲音訊。\n\n同版本桌布、配套工具、完整修改原始碼與校驗碼：${url}\n公開原始碼：https://github.com/D1124423017/FoliaWallpaper\n既有Steam作品：https://steamcommunity.com/sharedfiles/filedetails/?id=3818020625\n\n授權資料包含播放器與桌布依賴的聯集，並不代表所有列出的套件都由桌布載入；詳細範圍、已保留原文與尚未取得的歷史版本通知見 licenses。\n`;

await ownedFolder(stage);
let frozen;
if (!wrapper) frozen = await extractSource(option('--source-archive') || path.join(workspace, 'outputs/FoliaMineradio/Folia-Mineradio-Source-0.7.17-integration.4-license.1.zip'));
if (args.includes('--rebuild')) {
  await prepareVendors();
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.wallpaper.config.ts']);
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.wallpaper-lyrics.config.ts']);
  await run(process.execPath, ['dev/wallpaper/input/build.mjs']);
  await copy(path.join(repo, 'dist-wallpaper'), wallpaper);
  await fs.rename(path.join(wallpaper, 'wallpaper.html'), path.join(wallpaper, 'index.html'));
  const htmlFile = path.join(wallpaper, 'index.html');
  await fs.writeFile(htmlFile, (await fs.readFile(htmlFile, 'utf8')).replace('type="module" crossorigin', 'defer'));
  const metadataBase = wrapper ? path.join(here, 'wallpaper-metadata') : path.join(workspace, 'outputs/FoliaWallpaper');
  for (const name of ['project.json', 'SOURCE.json', 'preview.png', 'wallpaper-host.js', 'LICENSE']) await copy(path.join(metadataBase, name), path.join(wallpaper, name));
  const { packageMineradio } = await import(pathToFileURL(path.join(repo, 'dev/wallpaper/mineradio/package.mjs')));
  await packageMineradio(wallpaper);
} else await copy(path.join(workspace, 'outputs/FoliaWallpaper'), wallpaper);

const project = JSON.parse(await fs.readFile(path.join(wallpaper, 'project.json'), 'utf8'));
delete project.workshopid; delete project.workshopurl; delete project.visibility;
project.title = 'Folia Wallpaper'; project.description = `Folia × Mineradio 原版視覺、繁體中文同步歌詞桌布。${version}。完整功能需配套工具；下載與完整原始碼：${url}`;
project.general.properties.themesource.value = 'cover'; project.general.properties.demo.value = false;
project.general.properties.showsettings.value = false;
await json(path.join(wallpaper, 'project.json'), project);
const information = JSON.parse(await fs.readFile(path.join(wallpaper, 'SOURCE.json'), 'utf8'));
Object.assign(information, { version, adapterSource: 'source/folia-major/src/wallpaper', sourceUrl: url,
  buildCommand: 'node publication/prepare-wallpaper-10-10.mjs --rebuild --install-service' });
await json(path.join(wallpaper, 'SOURCE.json'), information);
const rendererFiles = (await fs.readdir(path.join(wallpaper, 'assets'))).filter(name => /^wallpaper-.*\.js$/.test(name));
if (rendererFiles.length !== 1) throw new Error('Wallpaper renderer must be a single classic bundle.');
const renderer = path.join(wallpaper, 'assets', rendererFiles[0]);
if ((await fs.readFile(path.join(wallpaper, 'index.html'), 'utf8')).includes('type="module"')) throw new Error('CEF wallpaper entry was not converted to a classic deferred script.');
if (!args.includes('--rebuild') && await hashFile(renderer) !== 'ea1fd64ce8ffe815781502e4de5aa5288e70601e41ca039096b0759bc21627a0') throw new Error('Wallpaper renderer differs from the verified wallpaper.10.10.');

const release = path.join(repo, 'dev/wallpaper/release');
for (const [from, to] of [
  [path.join(repo, 'dist-wallpaper-lyrics/server.mjs'), 'service/server.mjs'],
  [path.join(repo, 'dist-wallpaper-lyrics/FoliaDesktopWheel.exe'), 'service/FoliaDesktopWheel.exe'],
  [path.join(repo, 'dev/wallpaper/media'), 'service/media'],
  [path.join(release, 'lib'), 'lib'], [path.join(release, 'control.mjs'), 'control.mjs'],
  [path.join(repo, 'dev/wallpaper/chrome'), 'chrome'],
  [path.join(repo, 'electron/aiTextClient.cjs'), 'service/electron/aiTextClient.cjs'],
  [path.join(repo, 'shared/lyricSegmentationPrompt.cjs'), 'service/shared/lyricSegmentationPrompt.cjs'],
  [path.join(repo, 'LICENSE'), 'LICENSE'], [path.join(repo, 'LICENSE'), 'chrome/LICENSE'],
]) await copy(from, path.join(tools, to));
for (const name of ['worker.py', 'device.py']) await copy(path.join(repo, 'dev/wallpaper/audio', name), path.join(tools, 'audio', name));
for (const name of ['prepare-model.py', 'requirements-cpu.txt', 'requirements-gpu.txt']) await copy(path.join(release, 'audio', name), path.join(tools, 'audio', name));
await fs.writeFile(path.join(tools, 'chrome/connection.js'), '// Generated separately on each computer by the portable launcher.\nexport const token = "";\n');
for (const [name, action] of [['啟動歌詞服務', 'start'], ['停止歌詞服務', 'stop'], ['查看服務狀態', 'status'], ['設定AI連線', 'settings'],
  ['啟用本機音訊校正', 'audio-enable'], ['啟用NVIDIA加速', 'audio-gpu'], ['停用本機音訊校正', 'audio-disable'], ['啟用桌布滾輪', 'wheel-enable'], ['停用桌布滾輪', 'wheel-disable']])
  await fs.writeFile(path.join(tools, `${name}.cmd`), `@echo off\r\nchcp 65001 >nul\r\n"%~dp0runtime\\node.exe" "%~dp0control.mjs" ${action}\r\nif errorlevel 1 pause\r\n`, 'utf8');
for (const [file, name] of [['service-package.json', 'package.json'], ['service-package-lock.json', 'package-lock.json']]) {
  const metadata = JSON.parse(await fs.readFile(path.join(release, file), 'utf8'));
  metadata.version = version; if (metadata.packages?.['']) metadata.packages[''].version = version;
  await json(path.join(tools, 'service', name), metadata);
}
const vendor = path.join(publication, 'vendor-cache');
const vendorRecords = [];
for (const record of [
  { name: 'node-v24.21.0-win-x64.zip', sha256: '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541', mappings: [['node.exe', 'node.exe'], ['LICENSE', 'Node-LICENSE']] },
  { name: 'uv-x86_64-pc-windows-msvc.zip', sha256: '088962f9e7b7bd9ea740c04c650b2a21c8928c345bd99ac24350dc924dba656c', mappings: [['uv.exe', 'uv.exe']] },
]) {
  const archive = path.join(vendor, record.name);
  if (await hashFile(archive) !== record.sha256) throw new Error(`Vendor archive changed: ${record.name}`);
  const zip = await zipReader.Open.file(archive);
  for (const [basename, output] of record.mappings) {
    const prefix = record.name.startsWith('node-') ? record.name.replace(/\.zip$/, '') + '/' : '';
    const matches = zip.files.filter(entry => (prefix ? entry.path === prefix + basename : path.posix.basename(entry.path) === basename) && entry.type !== 'Directory');
    if (matches.length !== 1) throw new Error(`Ambiguous runtime vendor file: ${basename}`);
    const bytes = await matches[0].buffer(); const to = path.join(tools, 'runtime', output); await fs.mkdir(path.dirname(to), { recursive: true }); await fs.writeFile(to, bytes);
    vendorRecords.push({ archive: record.name, archiveSha256: record.sha256, path: `runtime/${output}`, sha256: hash(bytes), bytes: bytes.length });
  }
}
for (const name of ['uv-LICENSE-APACHE', 'uv-LICENSE-MIT']) await copy(path.join(vendor, name), path.join(tools, 'runtime', name));
const union = wrapper ? path.join(here, 'licenses-union') : path.join(workspace, 'outputs/FoliaMineradio/win-unpacked/resources/licenses');
await copy(union, path.join(wallpaper, 'licenses')); await copy(union, path.join(tools, 'licenses'));
const unionText = 'License records are a retained union from the combined player and wallpaper build. Presence does not imply this wallpaper loads each package. Historical missing-version notices and build-only gaps remain documented. Actual standalone service dependencies are separately recorded in service-dependency-manifest.json. GSAP uses its Standard No-Charge License, not MIT.\n';
for (const folder of [wallpaper, tools]) {
  await fs.writeFile(path.join(folder, 'THIRD-PARTY-NOTICES.md'), '# Third-party notices\n\n' + unionText + '\nFolia AGPLv3, Mineradio GPLv3 and Three.js MIT notices are retained. Excluded Sonic presets 7 and 8 are not distributed.\n');
  await fs.writeFile(path.join(folder, '使用說明.md'), rawReadme);
  await fs.writeFile(path.join(folder, 'licenses/WALLPAPER-SCOPE.txt'), unionText);
}
await fs.writeFile(path.join(tools, '使用說明.md'), rawReadme + '\n## 配套操作\n\n先執行「啟動歌詞服務.cmd」，成功後可關閉命令視窗。工具附Node.js，不必安裝Node或修改系統PATH。重新開機後需再啟動；不自動加入開機啟動。停止時用本工具的「停止歌詞服務.cmd」，不會關閉別份程式。服務只綁定127.0.0.1:3189。\n\n「啟用本機音訊校正.cmd」需輸入Y同意，會下載獨立Python與Whisper small。需要NVIDIA加速時再選對應啟用檔；API音訊校正的同意是本機設定頁中獨立選項。\n\n桌面滾輪需自行執行「啟用桌布滾輪.cmd」，並在WE一般設定將CEF DevTools連接埠設3192後重啟引擎。只在Folia選單開啟、滑鼠位於該螢幕選單且未被其他視窗遮住時轉接；不記錄鍵盤或游標歷史。\n\n.data、audio中下載的環境／模型、AI設定及chrome/connection.js配對由每台電腦建立；勿再分享執行後的整個工具資料夾。更新前先停止同一工具，保留自己的.data及已下載的audio環境。新版Chrome需按重新載入並重新整理音樂分頁。\n');
await json(path.join(tools, 'BUILD.json'), { version, modified: '2026-10-15', platform: 'Windows x64', node: '24.21.0', uv: '0.13.0', python: '3.13.14',
  source: url, audioDefault: 'disabled', geminiAudioDefault: 'disabled', desktopWheelDefault: 'disabled', chromeVersion: '1.2.1', vendorRecords });

if (args.includes('--install-service')) {
  await fs.access(npm);
  await run(process.execPath, [npm, 'ci', '--prefix', path.join(tools, 'service'), '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']);
}
const dependencyRecords = [];
async function collectService(modules) {
  if (!(await exists(modules))) return;
  for (const item of await fs.readdir(modules, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name.startsWith('.')) continue;
    const folder = path.join(modules, item.name);
    if (item.name.startsWith('@')) { await collectService(folder); continue; }
    let metadata; try { metadata = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8')); } catch { continue; }
    const id = `${metadata.name}@${metadata.version}`;
    const documents = (await fs.readdir(folder)).filter(name => /^(?:licen[cs]e|copying|notice|authors)([.-]|$)/i.test(name));
    const targetName = id.replaceAll('/', '__');
    for (const name of documents) if ((await fs.stat(path.join(folder, name))).isFile()) for (const output of [wallpaper, tools]) await copy(path.join(folder, name), path.join(output, 'licenses/service-dependencies', targetName, name));
    dependencyRecords.push({ name: metadata.name, version: metadata.version, license: metadata.license ?? null, packagePath: path.relative(path.join(tools, 'service'), folder).split(path.sep).join('/'), licenseFiles: documents });
    await collectService(path.join(folder, 'node_modules'));
  }
}
await collectService(path.join(tools, 'service/node_modules'));
for (const output of [wallpaper, tools]) await json(path.join(output, 'licenses/service-dependency-manifest.json'), dependencyRecords);
const serviceLicenseCoverage = await completeNotices();
const payload = { schema: 1, version, releaseTag: tag, sourceUrl: url, published: false, sourceSnapshot: frozen || { rebuildFrom: 'bundled frozen source' },
  renderer: { path: `FoliaWallpaper/assets/${rendererFiles[0]}`, sha256: await hashFile(renderer) },
  service: { sha256: await hashFile(path.join(tools, 'service/server.mjs')), dependencies: dependencyRecords.length }, serviceLicenseCoverage,
  defaults: { theme: 'cover', demo: false, localAudio: false, geminiAudioUpload: false, wheel: false },
  excluded: ['personal API keys', 'pairing tokens', '.data', 'audio models/environments', 'recordings', 'Sonic presets 7 and 8'],
  verificationLimit: 'Assembly and file integrity only; no service or wallpaper was started by this script.' };
await json(path.join(stage, 'PUBLICATION-MANIFEST.json'), payload);
if (!wrapper) {
  await copy(fileURLToPath(import.meta.url), path.join(sourceStage, 'publication/prepare-wallpaper-10-10.mjs'));
  await copy(union, path.join(sourceStage, 'publication/licenses-union'));
  for (const name of ['project.json', 'SOURCE.json', 'preview.png', 'wallpaper-host.js', 'LICENSE']) await copy(path.join(wallpaper, name), path.join(sourceStage, 'publication/wallpaper-metadata', name));
  await fs.writeFile(path.join(sourceStage, 'PUBLICATION.md'), `# Folia Wallpaper ${tag} 完整對應原始碼\n\n此快照保留3507個Folia Mineradio整合來源檔案，並增加本桌布專屬的便攜發布wrapper。原來源文件保留原文；其中 npm run build:wallpaper-public 為舊流程，不是本公開版的乾淨重建指令。\n\n需Windows x64、Node.js24+及npm。先在 source/folia-major 執行 npm ci，再回到本資料夾執行：\n\n\`\`\`powershell\nnode publication/prepare-wallpaper-10-10.mjs --rebuild --install-service\n\`\`\`\n\n新輸出位於 outputs/FoliaWallpaper_Publication/stage-10.10。腳本只建置到此解壓縮資料夾，下載固定SHA-256校驗的Node與uv，不初始化配對、不啟動服務、不修改既有桌布。原版Shader/字體/GSAP/Three/OpenCC原文授權及歷史通知缺口保留於publication/licenses-union，這是播放器與桌布的聯集，不表示桌布使用全部套件。\n\n服務package-lock與配套lib保留於source/folia-major/dev/wallpaper/release；工具個別metadata由wrapper改為10.10。預設封面配色，音訊分析、Gemini上傳及滾輪預設停用。\n\n${rawReadme}`);
  await json(path.join(sourceStage, 'publication/WALLPAPER-SOURCE-MANIFEST.json'), { ...payload, bundleMetadata: 'publication/wallpaper-metadata', frozenManifest: 'publication/FROZEN-SOURCE-MANIFEST.json',
    rebuildCommand: 'node publication/prepare-wallpaper-10-10.mjs --rebuild --install-service' });
}
console.log(JSON.stringify({ stage, sourceStage: wrapper ? null : sourceStage, ...payload }, null, 2));
