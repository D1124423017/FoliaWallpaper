import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// dev/wallpaper/release/collect-licenses.mjs — preserve third-party notices from the build and runtime dependencies.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const stage = path.resolve(repo, '../../outputs/FoliaWallpaper_Publication/stage');
const notices = path.join(stage, 'FoliaWallpaper/licenses');
await fs.mkdir(notices, { recursive: true });
const records = new Map();
for (const modules of [path.join(repo, 'node_modules'), path.join(stage, 'FoliaWallpaperTools/service/node_modules')]) {
  const directories = [];
  for (const item of await fs.readdir(modules, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name.startsWith('.')) continue;
    if (item.name.startsWith('@')) for (const child of await fs.readdir(path.join(modules, item.name), { withFileTypes: true })) {
      if (child.isDirectory()) directories.push(path.join(modules, item.name, child.name));
    } else directories.push(path.join(modules, item.name));
  }
  for (const folder of directories) {
    let metadata; try { metadata = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8')); } catch { continue; }
    const key = `${metadata.name}@${metadata.version}`, target = path.join(notices, key.replaceAll('/', '__'));
    const files = (await fs.readdir(folder)).filter(name => /^(licen[cs]e|copying|notice|authors)([.-]|$)/i.test(name));
    if (!files.length) continue;
    await fs.mkdir(target, { recursive: true });
    for (const file of files) if ((await fs.stat(path.join(folder, file))).isFile()) await fs.copyFile(path.join(folder, file), path.join(target, file));
    records.set(key, { name: metadata.name, version: metadata.version, license: metadata.license ?? null, repository: metadata.repository ?? null });
  }
}
await fs.writeFile(path.join(notices, 'packages.json'), JSON.stringify([...records.values()], null, 2));
const text = '# Third-party notices\n\nOriginal license documents are retained in licenses/. This collection includes build dependencies; some entries are not part of the delivered runtime. Individual packages keep their own licenses.\n\nNode.js and uv licenses are additionally included in the tools runtime/ directory. Python and Whisper are downloaded only when local alignment is enabled.\n';
for (const folder of ['FoliaWallpaper', 'FoliaWallpaperTools']) await fs.writeFile(path.join(stage, folder, 'THIRD-PARTY-NOTICES.md'), text);
await fs.cp(notices, path.join(stage, 'FoliaWallpaperTools/licenses'), { recursive: true });
console.log(`Preserved license files for ${records.size} dependency versions`);
