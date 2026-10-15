import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import asar from '@electron/asar';
import pickle from 'chromium-pickle-js';

// Reuse the installed release's dependencies and exact unpack flags, replacing only compiled UI and changed native files.
const original = process.argv[2], destination = process.argv[3];
if (!original || !destination) throw new Error('Usage: node package-local.mjs original.asar output.asar');
const root = process.cwd();
const changed = new Set(['electron/main.cjs', 'electron/preload.cjs', 'electron/modSystem/modSystem.cjs', 'electron/streamingEmbeds.cjs', 'electron/streaming/oauth.cjs', 'electron/streaming/library.cjs', 'electron/streaming/accounts.cjs']);
const streams = [], unpacked = [];
const addLocalFile = relative => {
    const source = path.join(root, relative);
    streams.push({ path: relative, type: 'file', stat: fs.statSync(source), unpacked: false, streamGenerator: () => fs.createReadStream(source) });
};
const walk = (entries, parent = '') => {
    for (const [name, entry] of Object.entries(entries)) {
        const relative = parent ? `${parent}/${name}` : name;
        if (relative === 'dist' || relative.startsWith('dist/')) continue;
        if (entry.files) {
            streams.push({ path: relative, type: 'directory', unpacked: !!entry.unpacked });
            walk(entry.files, relative);
        } else if (entry.link) {
            streams.push({ path: relative, type: 'link', symlink: entry.link, unpacked: !!entry.unpacked });
        } else if (changed.has(relative)) {
            addLocalFile(relative); changed.delete(relative);
        } else {
            if (entry.unpacked) { unpacked.push({ relative, entry }); continue; }
            streams.push({ path: relative, type: 'file', stat: { size: entry.size, mode: entry.executable ? 0o755 : 0o644 }, unpacked: !!entry.unpacked, streamGenerator: () => Readable.from(asar.extractFile(original, path.normalize(relative))) });
        }
    }
};
walk(asar.getRawHeader(original).header.files);
for (const relative of changed) addLocalFile(relative);
const walkDist = (directory, relative) => {
    streams.push({ path: relative, type: 'directory', unpacked: false });
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child = relative + '/' + entry.name;
        if (entry.isDirectory()) walkDist(path.join(directory, entry.name), child);
        else if (entry.isFile()) addLocalFile(child);
        else throw new Error('Unexpected dist link');
    }
};
walkDist(path.join(root, 'dist'), 'dist');
const intermediate = destination + '.packed';
const output = await asar.createPackageFromStreams(intermediate, streams);
await finished(output);
// The official Windows archive references absent macOS/Linux binaries. Preserve those header entries verbatim.
const packedHeader = asar.getRawHeader(intermediate);
for (const { relative, entry } of unpacked) {
    const parts = relative.split('/');
    let parent = packedHeader.header;
    for (const part of parts.slice(0, -1)) parent = parent.files[part];
    parent.files[parts.at(-1)] = entry;
    const source = path.join(original + '.unpacked', relative);
    if (fs.existsSync(source)) {
        const target = path.join(destination + '.unpacked', relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
    }
}
const headerPickle = pickle.createEmpty();
headerPickle.writeString(JSON.stringify(packedHeader.header));
const headerBuffer = headerPickle.toBuffer();
const sizePickle = pickle.createEmpty();
sizePickle.writeUInt32(headerBuffer.length);
const destinationStream = fs.createWriteStream(destination);
destinationStream.write(sizePickle.toBuffer());
destinationStream.write(headerBuffer);
await pipeline(fs.createReadStream(intermediate, { start: 8 + packedHeader.headerSize }), destinationStream);
fs.unlinkSync(intermediate);
asar.uncache(destination);
for (const { relative, entry } of unpacked) {
    if (JSON.stringify(asar.statFile(destination, path.normalize(relative))) !== JSON.stringify(entry)) throw new Error('Native metadata changed: ' + relative);
    if (fs.existsSync(path.join(original + '.unpacked', relative)) && !asar.extractFile(original, path.normalize(relative)).equals(asar.extractFile(destination, path.normalize(relative)))) throw new Error('Native dependency changed: ' + relative);
}
for (const relative of ['electron/main.cjs', 'electron/preload.cjs', 'electron/modSystem/modSystem.cjs', 'electron/streamingEmbeds.cjs', 'electron/streaming/oauth.cjs', 'electron/streaming/library.cjs', 'electron/streaming/accounts.cjs', 'dist/index.html']) {
    if (!asar.extractFile(destination, path.normalize(relative)).equals(fs.readFileSync(path.join(root, relative)))) throw new Error('Incorrect packaged file: ' + relative);
}
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const result = { original, destination, originalSha256: sha256(original), customSha256: sha256(destination), archiveBytes: fs.statSync(destination).size, preservedUnpackedFiles: unpacked.length };
fs.writeFileSync(destination + '.verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
