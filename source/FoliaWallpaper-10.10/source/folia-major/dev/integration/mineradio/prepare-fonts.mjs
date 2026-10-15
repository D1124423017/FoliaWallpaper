import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Vendor the original font families and their OFL notices from one pinned official Google Fonts revision.
const commit = '66928797f271fed5ee428544e7229685e2d90127';
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
const inputs = [
  ['inter', 'Inter[opsz,wght].ttf', 'Inter.ttf'],
  ['jetbrainsmono', 'JetBrainsMono[wght].ttf', 'JetBrainsMono.ttf'],
  ['cinzeldecorative', 'CinzelDecorative-Bold.ttf', 'CinzelDecorative-Bold.ttf'],
  ['cinzeldecorative', 'CinzelDecorative-Black.ttf', 'CinzelDecorative-Black.ttf'],
  ['unifrakturcook', 'UnifrakturCook-Bold.ttf', 'UnifrakturCook-Bold.ttf'],
  ['notosanssc', 'NotoSansSC[wght].ttf', 'NotoSansSC.ttf'],
];
for (const family of new Set(inputs.map(item => item[0]))) inputs.push([family, 'OFL.txt', `${family}-OFL.txt`]);
await fs.mkdir(directory, { recursive: true });
const records = [];
for (const [family, file, name] of inputs) {
  const url = `https://raw.githubusercontent.com/google/fonts/${commit}/ofl/${family}/${encodeURIComponent(file)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Font source unavailable: ${name} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 40_000_000 || bytes.length < 100) throw new Error(`Invalid font source length: ${name}`);
  if (name.endsWith('.ttf') && bytes.readUInt32BE(0) !== 0x00010000) throw new Error(`Invalid TrueType font: ${name}`);
  if (name.endsWith('.txt') && !bytes.toString('utf8').includes('SIL OPEN FONT LICENSE')) throw new Error(`Missing OFL: ${name}`);
  await fs.writeFile(path.join(directory, name), bytes);
  records.push({ name, source: url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await fs.writeFile(path.join(directory, 'FONT-MANIFEST.json'), JSON.stringify({ commit, license: 'SIL OFL 1.1', files: records }, null, 2));
console.log(JSON.stringify({ files: records.length, bytes: records.reduce((sum, record) => sum + record.bytes, 0), commit }));
