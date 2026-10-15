import fs from 'node:fs/promises';
import path from 'node:path';

// Remove stale excluded presets only from verified generated Mineradio output, keeping upstream sources intact.
export const unsupportedMineradioPresets = new Set(['sonic-topography-preset.js', 'sonic-workshop-preset.js']);
export const unsupportedMineradioVendors = new Set(['sonic-topography', 'sonic-workshop']);

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}

export async function cleanUnsupportedMineradioOutput(targetPath, sourcePath, generatedRoots, expectedParent) {
  const target = path.resolve(targetPath), source = path.resolve(sourcePath);
  const generatedRoot = generatedRoots.map(value => path.resolve(value)).find(value => inside(value, target));
  if (!generatedRoot || path.basename(target) !== 'mineradio'
    || expectedParent && path.basename(path.dirname(target)) !== expectedParent
    || target === source || inside(source, target) || inside(target, source)) {
    throw new Error('Mineradio cleanup requires a separate, explicitly generated output directory.');
  }
  await fs.mkdir(target, { recursive: true });
  const realRoot = await fs.realpath(generatedRoot), realTarget = await fs.realpath(target), realSource = await fs.realpath(source);
  if (!inside(realRoot, realTarget) || realTarget === realSource || inside(realSource, realTarget) || inside(realTarget, realSource)) {
    throw new Error('Mineradio generated output resolves outside its intended directory or overlaps source.');
  }
  const stale = [];
  async function inspect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const candidate = path.resolve(directory, entry.name), canonical = await fs.realpath(candidate);
      if (!inside(realTarget, candidate) || !inside(realTarget, canonical) || entry.isSymbolicLink()) {
        throw new Error('Mineradio generated output contains an unsafe link or path.');
      }
      const unsupportedVendor = entry.isDirectory() && path.basename(directory) === 'vendor' && unsupportedMineradioVendors.has(entry.name);
      if (unsupportedVendor || entry.isFile() && unsupportedMineradioPresets.has(entry.name)) stale.push(candidate);
      else if (entry.isDirectory()) await inspect(candidate);
    }
  }
  await inspect(realTarget);
  for (const candidate of stale) {
    // Both the absolute lexical target and its existing physical target stay inside this generated root.
    const canonical = await fs.realpath(candidate);
    if (!inside(realTarget, candidate) || !inside(realTarget, canonical)) throw new Error('Unsupported Mineradio cleanup escaped its output.');
    await fs.rm(candidate, { recursive: true, force: true });
  }
  return stale.map(value => path.relative(realTarget, value));
}
