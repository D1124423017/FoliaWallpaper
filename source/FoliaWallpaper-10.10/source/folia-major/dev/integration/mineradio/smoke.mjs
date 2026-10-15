import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Exercise the real upstream runtime and shared-core message contract without playing audio.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const target = path.join(root, 'public');
const errors = [], browserErrors = [];
const server = http.createServer(async (request, response) => {
  if (request.url === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
  if (request.url === '/harness') {
    response.setHeader('content-type', 'text/html');
    response.end('<iframe id="stage" src="/integration/mineradio/index.html" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>'
      + '<script>window.actions=[];addEventListener("message",event=>{if(event.source!==document.querySelector("iframe").contentWindow)return;'
      + 'if(event.data.type==="folia-mineradio-action-v1"){actions.push(event.data);let result=[{key:"local:test",id:"test",name:"測試音樂",artist:"測試歌手",source:"local",duration:120}];event.source.postMessage({type:"folia-mineradio-result-v1",id:event.data.id,result},"*")}})</script>');
    return;
  }
  try {
    const url = new URL(request.url, 'http://localhost'), file = path.resolve(target, '.' + url.pathname);
    if (!file.startsWith(target + path.sep)) throw new Error('outside fixture');
    const body = await fs.readFile(file);
    response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html'
      : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    response.end(body);
  } catch { response.statusCode = 404; response.end('missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/harness');
  await page.waitForTimeout(1200);
  const frame = page.frames().find(frame => frame.url().includes('/integration/mineradio/index.html'));
  console.log(JSON.stringify({ errors, browserErrors, ready: await frame.evaluate(() => !!window.__foliaMineradioBridge) }));
  assert(await frame.evaluate(() => !!window.__foliaMineradioBridge), 'bridge starts');
  const send = snapshot => page.evaluate(snapshot => document.querySelector('iframe').contentWindow.postMessage({ type: 'folia-mineradio-core-v1', snapshot }, '*'), snapshot);
  await send({
    song: { key: 'local:test', id: 'test', name: '測試音樂', artist: '測試歌手', source: 'local', duration: 120 },
    queue: [{ key: 'local:test', id: 'test', name: '測試音樂', artist: '測試歌手', source: 'local', duration: 120 }],
    position: 10, lyricPosition: 9, duration: 120, volume: .4, playing: true,
    lyrics: [{ time: 8, text: '原版歌詞舞臺', words: [{ time: 8, endTime: 10, text: '原版' }, { time: 10, endTime: 12, text: '歌詞舞臺' }] }],
    audio: { power: .5, bass: .4, mid: .2, treble: .1 }, collections: [{ key: 'local:collection', name: '測試歌單', count: 1 }], accounts: [],
    presentation: { showLyrics: true, showControls: true, showShelf: true },
  });
  await page.waitForTimeout(900);
  const mounted = await frame.evaluate(() => window.__foliaMineradioBridge.diagnostics());
  console.log(JSON.stringify({ errors, browserErrors, mounted }));
  assert.equal(mounted.songKey, 'local:test'); assert.equal(mounted.lyrics, 1);
  assert(await frame.evaluate(() => firstPlayDone && uniforms.uAlpha.value > .99), 'original first-play particle fade completes');
  assert.deepEqual(mounted.queue, ['local:test']);
  await send({ presentation: { showLyrics: true, showControls: false, showShelf: false, showBackground: true } });
  await page.waitForTimeout(100);
  assert.equal(await frame.evaluate(() => getComputedStyle(document.getElementById('top-right')).display), 'none', 'custom Folia controls hide native account controls');
  await send({ presentation: { showLyrics: true, showControls: true, showShelf: true, showBackground: true } });
  await page.waitForTimeout(100);
  await frame.evaluate(() => { setShelfMode('off'); flushLyricLayoutSave(); });
  await send({ volume: .41 }); await page.waitForTimeout(100);
  assert.equal(await frame.evaluate(() => shelfManager.getMode()), 'off', 'core snapshots preserve the native shelf-off choice');
  await frame.evaluate(() => { setShelfMode('side'); setShelfPinnedOpen(true, true); fx.shelfPresence = 'always'; saveLyricLayout({ user: true }); flushLyricLayoutSave(); });
  const shelfPreference = await frame.evaluate(() => localStorage.getItem(LYRIC_LAYOUT_STORE_KEY));
  await send({ presentation: { showLyrics: true, showControls: false, showShelf: false, showBackground: true } });
  await page.waitForTimeout(100);
  assert.equal(await frame.evaluate(() => shelfManager.getMode()), 'off', 'host can mask the native shelf');
  assert.equal(await frame.evaluate(() => localStorage.getItem(LYRIC_LAYOUT_STORE_KEY)), shelfPreference, 'host masks never overwrite the native shelf preference');
  await send({ presentation: { showLyrics: true, showControls: true, showShelf: true, showBackground: true } });
  await page.waitForTimeout(100);
  assert.deepEqual(await frame.evaluate(() => [shelfManager.getMode(), fx.shelfPinnedOpen, fx.shelfPresence]), ['side', true, 'always'], 'native shelf presentation restores its mode, pin and presence');
  await frame.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
    source: window, data: { type: 'folia-mineradio-core-v1', snapshot: { song: { key: 'untrusted:override' } } },
  })));
  assert.equal(await frame.evaluate(() => window.__foliaMineradioBridge.diagnostics().songKey), 'local:test');
  await frame.evaluate(() => togglePlay());
  assert.equal((await page.evaluate(() => actions))[0].action, 'toggle');
  await frame.evaluate(() => doSearch('測試'));
  assert.equal(await frame.evaluate(() => playlist[0].__foliaKey), 'local:test');
  assert.equal((await page.evaluate(() => actions))[1].action, 'search');
  await frame.evaluate(() => { setShelfPinnedOpen(true, true); shelfManager.openContent(0); });
  await page.waitForTimeout(180);
  assert(await frame.evaluate(() => shelfManager.getContentList().isOpen()), 'original 3D shelf detail opens');
  assert((await page.evaluate(() => actions)).some(action => action.action === 'collectionTracks' && action.args[0] === 'local:collection'));
  for (const preset of [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12]) {
    await frame.evaluate(preset => setPreset(preset), preset);
    await page.waitForTimeout(60);
    assert.equal(await frame.evaluate(() => fx.preset), preset);
  }
  await frame.evaluate(() => setPreset(0));
  await send({ presentation: { showLyrics: true, showControls: true, showShelf: false, showBackground: false } });
  await page.waitForTimeout(160);
  const hiddenBackgroundBefore = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  await page.waitForTimeout(200);
  const hiddenBackgroundAfter = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  assert.equal(hiddenBackgroundAfter.backgroundSteps, hiddenBackgroundBefore.backgroundSteps, 'hidden native background performs no background update steps');
  assert(hiddenBackgroundAfter.skippedBackgroundSteps > hiddenBackgroundBefore.skippedBackgroundSteps, 'unused background update calls are gated');
  assert(hiddenBackgroundAfter.lyricSteps > hiddenBackgroundBefore.lyricSteps, 'original lyric and camera timing continue in lyric-only mixes');
  await send({ presentation: { showLyrics: false, showControls: true, showShelf: false, showBackground: false } });
  await page.waitForTimeout(160);
  const controlsOnlyBefore = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  await page.waitForTimeout(200);
  const controlsOnlyAfter = await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals);
  assert.equal(controlsOnlyAfter.frames, controlsOnlyBefore.frames, 'control-only native presentation stops the unused 3D frame loop');
  assert(await frame.evaluate(() => stageLyrics.current === null), 'hidden lyric meshes and prewarm work are cleared');
  await send({ presentation: { showLyrics: true, showControls: true, showShelf: true, showBackground: true } });
  await page.waitForTimeout(200);
  assert((await frame.evaluate(() => __foliaMineradioBridge.diagnostics().visuals.frames)) > controlsOnlyAfter.frames, 'native 3D frames resume after a mix becomes visible');
  const unsupportedConsole = await frame.evaluate(() => fxConsoleRegistry.filter(entry =>
    (entry.tab === 'lyrics' && entry.group === 'desktop') || (entry.tab === 'shelf' && entry.group === 'camera')
    || (entry.tab === 'system' && ['memory', 'output', 'cache', 'experimental', 'startup'].includes(entry.group))));
  assert.equal(unsupportedConsole.length, 0, 'standalone-only entries are omitted from the original console and its search');
  assert.equal(await frame.evaluate(() => getComputedStyle(document.getElementById('cuefield-automix-btn')).display), 'none', 'independent automix entry is hidden');
  await frame.evaluate(() => { toggleFx('desktopLyrics'); toggleCuefieldAutoMix(); });
  assert(await frame.evaluate(() => !fx.desktopLyrics && !fx.cuefieldAutoMix), 'unsupported actions cannot report a toggled-on state');
  await frame.evaluate(() => { document.getElementById('quality-btn').click(); document.querySelector('#folia-shared-settings button:last-child').click(); document.getElementById('hotkey-settings-btn').click(); });
  await page.waitForTimeout(100);
  assert((await page.evaluate(() => actions)).some(action => action.action === 'openSettings' && action.args[0] === 'playback'), 'native quality control opens actual shared playback settings');
  assert((await page.evaluate(() => actions)).some(action => action.action === 'openSettings' && action.args[0] === 'storage'), 'native console opens actual shared cache settings');
  assert((await page.evaluate(() => actions)).some(action => action.action === 'openSettings' && action.args[0] === 'interaction'), 'native hotkey entry opens actual shared shortcut settings');
  if (process.argv[2]) await page.screenshot({ path: path.resolve(process.argv[2]) });
  await send({ position: 20, lyricPosition: 19, audio: { power: .2, bass: .2, mid: .1, treble: .2 }, playing: false, suspended: true });
  await page.waitForTimeout(120);
  const suspended = await frame.evaluate(() => window.__foliaMineradioBridge.diagnostics());
  assert.equal(suspended.songKey, 'local:test'); assert.equal(suspended.lyrics, 1);
  assert.equal(suspended.position, 20); assert.equal(suspended.lyricPosition, 19);
  assert.equal(suspended.scheduling.frames, 0); assert.equal(suspended.suspended, true);
  await send({ suspended: false, playing: true }); await page.waitForTimeout(120);
  const resumed = await frame.evaluate(() => window.__foliaMineradioBridge.diagnostics());
  assert.equal(resumed.suspended, false); assert(resumed.scheduling.frames > 0);
  await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ type: 'folia-mineradio-core-v1', action: 'dispose' }, '*'));
  await page.waitForTimeout(120);
  const disposed = await frame.evaluate(() => window.__foliaMineradioBridge.diagnostics());
  assert.equal(disposed.disposed, true); assert.equal(disposed.scheduling.frames, 0);
  assert.equal(disposed.scheduling.timers, 0); assert.equal(disposed.scheduling.listeners, 0);
  assert.deepEqual(errors, []); assert.deepEqual(mounted.errors, []);
  console.log(JSON.stringify({ passed: true, suspended, resumed, disposed }));
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
