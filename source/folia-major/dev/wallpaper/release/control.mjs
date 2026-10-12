import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { prepare, root, data, audio, node, port, health } from './lib/portableRuntime.mjs';
import { configureAudio } from './lib/configureAudio.mjs';

// dev/wallpaper/release/control.mjs — portable service lifecycle; verifies ownership before stopping a process.
const action = process.argv[2] ?? 'start';
const id = await prepare();
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function ownHealth() {
  const current = await health();
  if (current && current.runtimeId !== id) throw new Error('另一份 Folia 歌詞服務正在使用此連接埠。請先用原工具停止服務，再啟動本工具。');
  return current;
}
async function start() {
  if (await ownHealth()) { console.log('背景歌詞服務已在運作。'); return; }
  const out = await fs.open(path.join(data, 'service.log'), 'w'), err = await fs.open(path.join(data, 'service-error.log'), 'w');
  try {
    const child = spawn(node, [path.join(root, 'service', 'server.mjs')], { cwd: path.join(root, 'service'), windowsHide: true, detached: true,
      env: { ...process.env, FOLIA_SERVICE_PORT: String(port), FOLIA_RUNTIME_ID: id, FOLIA_LYRICS_RUNTIME: data, FOLIA_AUDIO_RUNTIME: audio },
      stdio: ['ignore', out.fd, err.fd] });
    child.on('error', error => console.error(error.message)); child.unref();
  } finally { await out.close(); await err.close(); }
  for (let attempt = 0; attempt < 40; attempt++) { await delay(250); if (await ownHealth()) { console.log('背景歌詞服務已啟動。YouTube 使用者請先載入 chrome 資料夾的擴充功能。'); return; } }
  throw new Error('服務未啟動，請查看 .data/service-error.log。');
}
async function stop() {
  const current = await ownHealth();
  if (!current) { console.log('背景服務沒有運作。'); return; }
  const pid = Number((await fs.readFile(path.join(data, 'service.pid'), 'utf8')).trim());
  if (!Number.isSafeInteger(pid) || pid !== current.pid) throw new Error('服務身分不一致，未停止其他程序。');
  process.kill(pid);
  for (let attempt = 0; attempt < 40; attempt++) { await delay(100); if (!(await health())) { console.log('背景服務已停止。'); return; } }
  throw new Error('等待服務停止逾時。');
}
try {
  if (action === 'prepare') console.log('本機連接設定已建立。音訊分析預設停用。');
  else if (action === 'status') console.log(JSON.stringify(await ownHealth(), null, 2));
  else if (action === 'stop') await stop();
  else if (action === 'restart') { await stop(); await start(); }
  else if (action === 'settings') {
    if (!(await ownHealth())) await start();
    const url = (await fs.readFile(path.join(data, 'ai-settings.url'), 'utf8')).trim(), parsed = new URL(url);
    if (parsed.origin !== `http://127.0.0.1:${port}` || parsed.pathname !== '/settings' || !/^[a-f0-9]{64}$/.test(parsed.searchParams.get('token') ?? '')) throw new Error('Invalid local settings URL');
    const child = spawn('explorer.exe', [url], { windowsHide: true, detached: true, stdio: 'ignore' }); child.unref();
  }
  else if (['audio-enable', 'audio-gpu', 'audio-disable'].includes(action)) {
    const running = await ownHealth();
    await configureAudio(action, process.argv.includes('--yes'));
    if (running) { await stop(); await start(); }
  } else if (action === 'start') await start();
  else throw new Error('未知命令。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
