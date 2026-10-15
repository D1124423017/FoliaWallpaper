import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { cleanUnsupportedMineradioOutput } from '../../integration/mineradio/unsupported-output.mjs';

// Extract verbatim upstream rendering statements, keeping the player and account code outside WE.
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
const upstream = path.join(directory, 'upstream');
const modules = path.join(upstream, 'public/js/modules');
export async function packageMineradio(output) {
  const target = path.resolve(output, 'mineradio');
  // This adapter copies only Three.js; clean stale excluded vendor/preset output from older builds.
  await cleanUnsupportedMineradioOutput(target, upstream,
    [path.resolve(root, '../../outputs'), path.join(root, 'dist-wallpaper'), path.join(root, '.integration-build')]);
  await fs.mkdir(path.join(target, 'assets'), { recursive: true });
  const chunks = ['// Mineradio GPL-3.0; upstream d43de565acabfdc1a9c9820a27e81a98ccbebcef.\n'];
  const select = async (file, predicate) => {
    const text = await fs.readFile(path.join(modules, file), 'utf8');
    const source = parse(text, { ecmaVersion: 'latest', sourceType: 'script' });
    source.text = text;
    chunks.push(`\n// Original: ${file}\n`);
    let previousEnd = 0;
    for (const statement of source.body) {
      if (predicate(statement, source)) chunks.push(text.slice(previousEnd, statement.end));
      previousEnd = statement.end;
    }
  };
  const named = names => statement => names.includes(statement.id?.name)
    || statement.type === 'VariableDeclaration' && statement.declarations.some(declaration => names.includes(declaration.id?.name));
  await select('00-state/04-fx-defaults.js', named(['fxDefaults']));
  chunks.push('\nvar fx = Object.assign({}, fxDefaults);\n');
  await select('02-visual/04-visual-settings-persistence.js', named(['clamp01', 'clampRange', 'normalizeCoverResolution', 'coverParticleGridForResolution']));
  await select('01-scene/01-orbit-free-camera.js', named(['orbit', 'SONIC_ORBIT_BASELINE', 'defaultOrbitStateForPreset', 'applyPresetOrbitBaseline']));
  await select('02-visual/00-pointer-cover-particles.js', (statement, source) =>
    statement.start >= source.text.indexOf('function makeDotTexture()')
      && !/^(installRenderPowerHooks|applyRendererPowerMode|console\.log)\(/.test(source.text.slice(statement.start, statement.end)));
  await select('02-visual/01-float-skull-backcover.js', () => true);
  // Bound the ripple block by its AST node, retaining original shader data and comments.
  const ripple = await fs.readFile(path.join(modules, '02-visual/15-ripples-cover-depth.js'), 'utf8');
  const rippleSource = parse(ripple, { ecmaVersion: 'latest', sourceType: 'script' });
  const update = rippleSource.body.find(statement => statement.id?.name === 'updateRipples');
  chunks.push(ripple.slice(0, update.end));
  await select('02-visual/15-ripples-cover-depth.js', named(['buildEdgeAndDepth']));
  await select('03-beat/05-cover-loading-crop.js', named(['makeSquareCoverCanvas']));
  await select('07-fx/04-preset-grid-uniforms.js', named(['syncFxUniforms', 'triggerPresetParticleTransition', 'tickPresetTransition']));
  const loop = await fs.readFile(path.join(modules, '11-main-loop.js'), 'utf8');
  const audioStart = loop.indexOf('  audioEnergy = Math.max(smoothEnergy, beatPulse * 0.30);');
  const audioEnd = loop.indexOf('  if (djMode.active)', audioStart);
  if (audioStart < 0 || audioEnd <= audioStart) throw new Error('Pinned audio response not found');
  chunks.push(`\n// Original preset audio response: 11-main-loop.js\nfunction updateWallpaperAudioResponse() {\n${loop.slice(audioStart, audioEnd)}\n}\n`);
  await fs.writeFile(path.join(target, 'upstream-renderer.js'), chunks.join('\n'));
  for (const file of ['index.html', 'bootstrap.js', 'cover.js', 'runtime.js', 'NOTICE.md', 'LICENSE-Three.js.txt']) await fs.copyFile(path.join(directory, file), path.join(target, file));
  await fs.copyFile(path.join(upstream, 'LICENSE'), path.join(target, 'LICENSE-GPL-3.0.txt'));
  await fs.copyFile(path.join(upstream, 'NOTICE.md'), path.join(target, 'UPSTREAM-NOTICE.md'));
  await fs.copyFile(path.join(upstream, 'public/vendor/three.r128.min.js'), path.join(target, 'three.r128.min.js'));
  await fs.copyFile(path.join(upstream, 'public/assets/skull-decimation-points.bin'), path.join(target, 'assets/skull-decimation-points.bin'));
  const skull = await fs.readFile(path.join(upstream, 'public/assets/skull-decimation-points.bin'));
  await fs.writeFile(path.join(target, 'assets/skull-points.js'), `// Original binary, encoded for offline file:// loading.\nwindow.__mineradioSkullPoints = ${JSON.stringify(skull.toString('base64'))};\n`);
}
