import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron } from 'playwright';

// Verify the packaged original cover renderer against Folia's real, isolated local-cover protocol.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.resolve(process.argv[2] || path.join(root, '../../outputs/FoliaMineradio_QA/local-cover'));
const runtime = process.env.FOLIA_INTEGRATION_ELECTRON_DIST || path.join(root, '.integration-build/runtime/electron-43.7.5');
await fs.mkdir(output, { recursive: true });
const main = path.join(output, 'main.cjs'), harness = path.join(output, 'harness.html');
const sourceUrl = pathToFileURL(path.join(root, 'public/integration/mineradio/index.html')).href;
await fs.writeFile(harness, '<!doctype html><html><head><title>Folia local cover protocol QA</title></head><body style="margin:0">'
  + '<iframe src="' + sourceUrl + '" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>');
await fs.writeFile(main, `const {app,BrowserWindow,protocol,net}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createLocalCoverAssetStore}=require(${JSON.stringify(path.join(root, 'electron/localCoverAssets.cjs'))});
app.setName('Folia local cover QA');app.setPath('userData',${JSON.stringify(path.join(output, 'user-data'))});
protocol.registerSchemesAsPrivileged([{scheme:'folia-cover',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
app.whenReady().then(async()=>{
 const store=createLocalCoverAssetStore({getDirectory:()=>${JSON.stringify(path.join(output, 'cover-assets'))}});
 const bytes=await fs.readFile(${JSON.stringify(path.join(root, 'assets/placeholder_cover.jpg'))});
 const id='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 await store.write(id,bytes,'image/jpeg');store.registerProtocolHandler(protocol,net);
 global.coverUrl='folia-cover://asset/'+encodeURIComponent(id);
 const window=new BrowserWindow({width:1440,height:900,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 await window.loadFile(${JSON.stringify(harness)});
});app.on('window-all-closed',()=>app.quit());`);
let app; const errors = [], consoleErrors = [];
try {
  app = await _electron.launch({ executablePath: path.join(runtime, 'electron.exe'), args: [main], timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)); });
  await page.waitForLoadState();
  assert.equal(await page.title(), 'Folia local cover protocol QA');
  const frame = page.frames().find(item => item.url().includes('/integration/mineradio/index.html'));
  assert(frame, 'original Mineradio iframe mounts');
  await frame.waitForFunction(() => !!window.__foliaMineradioBridge, null, { timeout: 30000 });
  const cover = await app.evaluate(() => global.coverUrl);
  await page.evaluate(snapshot => document.querySelector('iframe').contentWindow.postMessage({ type: 'folia-mineradio-core-v1', snapshot }, '*'), {
    song: { key: 'local:cover-qa', id: 'cover-qa', name: '本機封面協定驗證', artist: 'QA', source: 'local', picurl: cover, duration: 120 },
    queue: [], position: 10, lyricPosition: 10, duration: 120, playing: true, volume: .4,
    lyrics: [{ time: 8, endTime: 15, text: '原版封面與粒子', words: [{ time: 8, endTime: 15, text: '原版封面與粒子' }] }],
    audio: { power: .2, bass: .1, mid: .2, treble: .1 },
    presentation: { showLyrics: true, showControls: true, showBackground: true, showShelf: false },
  });
  await frame.waitForFunction(() => uniforms.uHasCover.value === 1 && uniforms.uAlpha.value > .99, null, { timeout: 30000 });
  const result = await frame.evaluate(() => ({ cover: uniforms.uHasCover.value, alpha: uniforms.uAlpha.value,
    controlCover: document.getElementById('thumb-cover').src, canvasReadable: !!coverTex?.image?.getContext('2d').getImageData(0, 0, 1, 1),
    diagnostics: __foliaMineradioBridge.diagnostics() }));
  assert.equal(result.cover, 1); assert(result.alpha > .99); assert.equal(result.controlCover, cover);
  assert.equal(result.canvasReadable, true, 'CORS-enabled local cover remains readable for original cover palette and particles');
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(result.diagnostics.errors, []);
  await page.screenshot({ path: path.join(output, 'local-cover-original-renderer.png') });
  const present = snapshot => page.evaluate(snapshot => document.querySelector('iframe').contentWindow.postMessage({ type: 'folia-mineradio-core-v1', snapshot }, '*'), snapshot);
  await present({ presentation: { showLyrics: true, showControls: true, showBackground: false, showShelf: false } });
  await page.waitForTimeout(200);
  const beforeHidden = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  await page.waitForTimeout(250);
  const afterHidden = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  assert.equal(afterHidden.backgroundSteps, beforeHidden.backgroundSteps, 'Electron skips hidden native background updates');
  assert(afterHidden.lyricSteps > beforeHidden.lyricSteps, 'Electron retains original visible lyric updates');
  await present({ presentation: { showLyrics: false, showControls: true, showBackground: false, showShelf: false } });
  await page.waitForTimeout(200);
  const beforeControls = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  await page.waitForTimeout(250);
  const afterControls = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  assert.equal(afterControls.frames, beforeControls.frames, 'Electron stops the unused 3D loop for controls only');
  const lifecycle = { beforeHidden, afterHidden, beforeControls, afterControls };
  await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ type: 'folia-mineradio-core-v1', action: 'dispose' }, '*'));
  await page.waitForTimeout(150);
  const disposed = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().scheduling);
  for (const key of ['frames', 'timers', 'listeners', 'observers', 'idleCallbacks']) assert.equal(disposed[key], 0);
  const evidence = { passed: true, result, lifecycle, disposed, errors, consoleErrors };
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { await app?.close(); }
