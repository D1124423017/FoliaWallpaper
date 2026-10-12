import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { audio, uv, run, audioEnv } from './portableRuntime.mjs';

// dev/wallpaper/release/lib/configureAudio.mjs — explicit opt-in and isolated Python/model setup; never records during setup.
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function consent(assumeYes, gpu) {
  if (assumeYes) return;
  console.log('啟用後，遇到版本不一致的歌曲會在本機分析預設喇叭的系統混音。');
  console.log('不使用麥克風、不保存錄音、不傳送音訊至 API；其他同時播放的聲音也可能被分析。');
  console.log(gpu ? '將下載 NVIDIA GPU 執行套件，可能需要數 GB 空間。' : '首次將下載獨立 Python、辨識套件及 Whisper small 模型，可能需要數 GB 空間。');
  const prompt = createInterface({ input: stdin, output: stdout });
  try { if (!/^(y|yes)$/i.test((await prompt.question('同意並繼續？輸入 Y：')).trim())) throw new Error('已取消，未啟用音訊分析。'); }
  finally { prompt.close(); }
}
export async function configureAudio(action, assumeYes) {
  const config = path.join(audio, 'enabled.json');
  if (action === 'audio-disable') { await fs.writeFile(config, JSON.stringify({ enabled: false })); console.log('本機音訊分析已停用。'); return; }
  await consent(assumeYes, action === 'audio-gpu');
  const python = path.join(audio, '.venv', 'Scripts', 'python.exe');
  if (!(await exists(python))) await run(uv, ['venv', '--python', '3.13.14', '--managed-python', path.join(audio, '.venv')], { env: audioEnv() });
  if (action === 'audio-gpu') {
    if (!(await exists(path.join(audio, 'ready.json')))) throw new Error('請先執行「啟用本機音訊校正.cmd」，再安裝 GPU 加速。');
    await run(uv, ['pip', 'install', '--python', python, '-r', path.join(audio, 'requirements-gpu.txt')], { env: audioEnv() });
  } else {
    await run(uv, ['pip', 'install', '--python', python, '-r', path.join(audio, 'requirements-cpu.txt')], { env: audioEnv() });
    await run(python, [path.join(audio, 'prepare-model.py')], { env: audioEnv() });
  }
  await run(python, ['-c', 'from faster_whisper import WhisperModel; import soundcard; import av; print("Local audio dependencies ready")'], { env: audioEnv() });
  await fs.writeFile(config, JSON.stringify({ enabled: true, consentAt: new Date().toISOString(), model: 'small', recordingsSaved: false, paidApi: false }));
  console.log('本機音訊校正已啟用。正在運作的本工具服務會自動重新啟動。');
}
