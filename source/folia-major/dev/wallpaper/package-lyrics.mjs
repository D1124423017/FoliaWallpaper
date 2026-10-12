import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

// dev/wallpaper/package-lyrics.mjs — local launchers for the independent Node matcher; no registry / startup changes.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(repo,'../../outputs/FoliaWallpaper_Lyrics');
const server=path.join(repo,'dist-wallpaper-lyrics/server.mjs');
const audioOutput=path.resolve(repo,'../../outputs/FoliaWallpaper_Audio');
await fs.mkdir(audioOutput,{recursive:true});
await fs.copyFile(path.join(repo,'dev/wallpaper/audio/worker.py'),path.join(audioOutput,'worker.py'));
await fs.copyFile(path.join(repo,'dev/wallpaper/audio/device.py'),path.join(audioOutput,'device.py'));
await fs.mkdir(output,{recursive:true});
const extensionOutput=path.resolve(repo,'../../outputs/FoliaWallpaper_Chrome');
await fs.mkdir(extensionOutput,{recursive:true});
let timelineToken;
try { timelineToken=(await fs.readFile(path.join(output,'timeline-token'),'utf8')).trim(); } catch { /* First package. */ }
if(!/^[a-f0-9]{64}$/.test(timelineToken||'')){timelineToken=randomBytes(32).toString('hex');await fs.writeFile(path.join(output,'timeline-token'),timelineToken);}
for(const file of ['manifest.json','background.js','content.js'])await fs.copyFile(path.join(repo,'dev/wallpaper/chrome',file),path.join(extensionOutput,file));
await fs.copyFile(path.join(repo,'LICENSE'),path.join(extensionOutput,'LICENSE'));
await fs.writeFile(path.join(extensionOutput,'connection.js'),`// Local timeline pairing only; contains no AI API key.\nexport const token = ${JSON.stringify(timelineToken)};\n`);
await fs.writeFile(path.join(extensionOutput,'使用說明.txt'),`YouTube 真實時間軸連接\n\n1. 雙擊 FoliaWallpaper_Lyrics 資料夾的「啟動歌詞服務.cmd」。\n2. Chrome 開啟 chrome://extensions，開啟右上角「開發人員模式」。\n3. 選「載入未封裝項目」，選擇此 FoliaWallpaper_Chrome 資料夾。\n4. 重新整理 YouTube／YouTube Music 分頁，繼續播放音樂。\n\n桌布會自動使用實際播放時間，不需 AI 或登入。已載入後再次更新此連接功能，請在擴充功能頁按重新載入並重新整理音樂分頁。\n只讀取 YouTube 的歌名、頻道／歌手、進度、時長與播放狀態，送至 127.0.0.1:3189；不控制播放、不讀取帳號。\n只有與桌布目前歌名完全相同的分頁能提供時間軸。沒有歌曲資訊時，仍需開啟 Wallpaper Engine 媒體整合。\n`);
const control=`import fs from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
const runtime=${JSON.stringify(output)}, entry=${JSON.stringify(server)}, node=${JSON.stringify(process.execPath)};
async function health(){try{const r=await fetch('http://127.0.0.1:3189/health',{signal:AbortSignal.timeout(1000)});const d=await r.json();return d.app==='FoliaWallpaperLyrics'&&d.schema===1?d:null;}catch{return null;}}
if(process.argv[2]==='settings'){
 if(!(await health()))execFileSync(node,[runtime+'/control.mjs','start'],{windowsHide:true});
 const url=fs.readFileSync(runtime+'/ai-settings.url','utf8').trim();
 const parsed=new URL(url);
 if(parsed.origin!=='http://127.0.0.1:3189'||parsed.pathname!=='/settings'||! /^[a-f0-9]{64}$/.test(parsed.searchParams.get('token')||''))throw new Error('Invalid local setup URL');
 const child=spawn('explorer.exe',[url],{detached:true,windowsHide:true,stdio:'ignore'});child.unref();
}else if(process.argv[2]==='stop'){
 const h=await health();if(!h){console.log('Lyric service is not running.');process.exit(0);}
 const pid=Number(fs.readFileSync(runtime+'/service.pid','utf8'));
 if(!Number.isSafeInteger(pid)||pid!==h.pid)throw new Error('Service identity changed; not stopping another process');
 process.kill(pid);console.log('Stopped Folia wallpaper lyrics.');
}else{
 if(await health()){console.log('Lyric service is already running.');process.exit(0);}
 fs.mkdirSync(runtime,{recursive:true});
 const out=fs.openSync(runtime+'/service.log','w'),err=fs.openSync(runtime+'/service-error.log','w');
 const child=spawn(node,[entry],{cwd:${JSON.stringify(repo)},detached:true,windowsHide:true,
   env:{...process.env,FOLIA_LYRICS_RUNTIME:runtime,FOLIA_AUDIO_RUNTIME:${JSON.stringify(audioOutput)},TEMP:${JSON.stringify(path.join(repo,'.task-temp'))},TMP:${JSON.stringify(path.join(repo,'.task-temp'))}},stdio:['ignore',out,err]});
 child.unref();fs.closeSync(out);fs.closeSync(err);
 for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,250));if(await health()){console.log('Folia wallpaper lyrics started in the background.');process.exit(0);}}
 throw new Error('Service did not start; see service-error.log');
}
`;
await fs.writeFile(path.join(output,'control.mjs'),control);
for(const [file,arg] of [['啟動歌詞服務.cmd','start'],['停止歌詞服務.cmd','stop'],['設定 AI 連線.cmd','settings']]){
 await fs.writeFile(path.join(output,file),`@echo off\r\n"${process.execPath}" "%~dp0control.mjs" ${arg}\r\nif errorlevel 1 pause\r\n`);
}
await fs.copyFile(path.join(repo,'LICENSE'),path.join(output,'LICENSE'));
await fs.writeFile(path.join(output,'使用說明.txt'),`Folia Wallpaper 本機背景服務\n\n雙擊「啟動歌詞服務.cmd」。它會在背景運作，不需要開 Folia.exe。\n雙擊「停止歌詞服務.cmd」可停止本服務。\n這一版不會自動新增開機啟動；重新開機後要再啟動一次。\n\nAI 主題：雙擊「設定 AI 連線.cmd」，在本機設定頁填入自己的 Gemini 或 OpenAI 相容服務金鑰。\n新金鑰使用 Windows 使用者 DPAPI 保護，存於 %APPDATA%\\FoliaWallpaper，不放進桌布檔案。\n若已有 Folia AI 設定，可先沿用。最多 2000 字元歌詞送往選定服務，API 收費依供應商與專案方案。\n未設定或失敗時使用封面取色；歌詞動畫不需要 AI。\n快取保留最近 64 組已生成主題；歌曲、歌詞與連線設定相同時不重複生成。\n\nYouTube 未提供時間軸時，請依 FoliaWallpaper_Chrome\\使用說明.txt 載入 Chrome 連接擴充功能。\n\n服務只綁定 127.0.0.1:3189。頻譜與畫面仍由 Wallpaper Engine 提供。\n必須保留現有 Node.js 和本地原始碼資料夾：\n${repo}\n\n服務重用 Folia 原版歌詞搜尋、AI 提示詞、AI 連線程式與主題解析器。\n來源需網路，個別來源可能拒絕請求或缺少特定錄音。\n授權：AGPL-3.0。\n`);
await fs.appendFile(path.join(output,'使用說明.txt'), `\n本機自動對齊（已依你的同意啟用）：\n目前主題使用封面配色，不需要設定付費 AI API。\n遇到無法確認錄音版本的歌詞，服務會使用本機 Whisper 模型辨識系統播放聲音，再校正歌詞時間。\n首次對齊需要約 20 秒可辨識的歌聲，再加上模型載入與處理時間；請保持桌布可見並繼續播放。\n只擷取目前預設喇叭的輸出，不使用麥克風；同時播放的其他聲音可能影響結果。\n音訊暫存在記憶體，不儲存錄音、不將音訊送至 API；只保留歌詞時間校正。\n已確認版本的歌曲直接使用播放時間，無須啟動辨識模型。未活動 90 秒後釋放模型。\n歌詞來源缺少歌曲、辨識不清或歌曲變速時，仍可能無法自動對齊；不保證每首歌都有逐字歌詞。\n停止本背景服務也會停止音訊分析。請保留 FoliaWallpaper_Audio 資料夾。\n`);
console.log(output);
