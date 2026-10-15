import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Bind copied browser vendor bytes and their retained notices to the actual application archive.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const catalog = {
  'three.r128.min.js': { name: 'Three.js', version: 'r128', notices: ['vendors/LICENSE-Three.js.txt'] },
  'gsap.min.js': { name: 'GSAP', version: '3.15.0', notices: ['dependencies/gsap@3.15.0/GSAP-Standard-License.html'] },
  'music-tempo.min.js': { name: 'music-tempo', version: 'upstream vendored copy', notices: ['vendors/music-tempo.LICENCE'] },
  'opencc-cn2t.js': { name: 'opencc-js', version: '1.4.2', notices: ['dependencies/opencc-js@1.4.2/LICENSE',
    'dependencies/opencc-js@1.4.2/THIRD_PARTY_LICENSES.md', 'dependencies/opencc-js@1.4.2/LICENSES/Apache-2.0.txt'] },
};

export async function verifyVendorScope({ repo, entries, extract, licenses }) {
  const prefix = 'dist/integration/mineradio/vendor/';
  const scripts = entries.filter(file => file.startsWith(prefix) && /\.(?:[cm]?js|wasm)$/i.test(file));
  if (scripts.length !== Object.keys(catalog).length) throw new Error('Copied vendor inventory changed; review notices before packaging.');
  const vendors = [];
  for (const file of scripts) {
    const relative = file.slice(prefix.length), known = catalog[relative];
    if (!known) throw new Error(`Unscoped browser vendor: ${relative}`);
    const bytes = extract(file), source = await fs.readFile(path.join(repo, 'public/integration/mineradio/vendor', relative));
    if (!bytes.equals(source)) throw new Error(`Packaged browser vendor differs from reviewed source: ${relative}`);
    const notices = [];
    for (const name of known.notices) {
      const text = await fs.readFile(path.join(licenses, name));
      if (!text.length) throw new Error(`Empty vendor notice: ${name}`);
      notices.push({ path: name, bytes: text.length, sha256: digest(text) });
    }
    vendors.push({ ...known, file, bytes: bytes.length, sha256: digest(bytes), notices });
  }
  return vendors;
}
