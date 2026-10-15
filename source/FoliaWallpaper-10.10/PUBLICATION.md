# Folia Wallpaper wallpaper.10.10 完整對應原始碼

此快照保留3507個Folia Mineradio整合來源檔案，並增加本桌布專屬的便攜發布wrapper。原來源文件保留原文；其中 npm run build:wallpaper-public 為舊流程，不是本公開版的乾淨重建指令。

需Windows x64、Node.js24+及npm。先在 source/folia-major 執行 npm ci，再回到本資料夾執行：

```powershell
node publication/prepare-wallpaper-10-10.mjs --rebuild --install-service
```

新輸出位於 outputs/FoliaWallpaper_Publication/stage-10.10。腳本只建置到此解壓縮資料夾，下載固定SHA-256校驗的Node與uv，不初始化配對、不啟動服務、不修改既有桌布。原版Shader/字體/GSAP/Three/OpenCC原文授權及歷史通知缺口保留於publication/licenses-union，這是播放器與桌布的聯集，不表示桌布使用全部套件。

服務package-lock與配套lib保留於source/folia-major/dev/wallpaper/release；工具個別metadata由wrapper改為10.10。預設封面配色，音訊分析、Gemini上傳及滾輪預設停用。

# Folia Wallpaper wallpaper.10.10

基於 Folia 與 Mineradio 的非官方 Wallpaper Engine Web 桌布。桌布不播放音訊，也不需要啟動 Folia.exe；音樂仍由原播放器播放。

## 安裝

1. 解壓縮整個 FoliaWallpaper 資料夾，將 index.html 匯入 Wallpaper Engine。不能只複製 index.html。
2. 另解壓縮同版本 FoliaWallpaperTools，執行「啟動歌詞服務.cmd」。僅訂閱 Steam 桌布不會安裝配套服務、Chrome 擴充功能或模型。
3. Chrome YouTube／YouTube Music 請在 chrome://extensions 載入工具中的 chrome 資料夾，再重新整理音樂分頁。在想用的分頁點擴充功能「指定此分頁為 Folia 播放來源」，或在桌布的播放來源選單選擇。
4. 其他提供 Windows 媒體資訊的播放器，可在播放來源選單選取。未提供歌名或時間軸的程式只能偵測聲音，無法保證辨識歌曲或同步歌詞。
5. 預設封面配色，AI、本機音訊分析、Gemini 音訊上傳與滾輪轉接都不會自動啟用。

## 視覺與時間

14 種 Folia 原版歌詞樣式、5 種原版背景；也可選 Mineradio × Folia 歌詞，使用10種粒子動畫及虛空安靜背景。鏡頭為桌布相容層的預設構圖，未包含完整 Mineradio 播放器控制面板或3D歌單。設定可匯出／匯入；不同螢幕的選單分別處理。

找到歌詞但時間未驗證時先顯示歌詞預覽，驗證成功才切為同步動畫。字幕、歌詞、錄音版本與時間軸的品質均影響結果，不能保證每首歌或真正逐字時間。

若選用 Folia Mineradio 整合播放器，可在播放來源選「Folia Mineradio（共用歌詞／時間軸）」。此模式使用播放器提供的同一份歌曲、歌詞及時間；外部播放器模式仍依原服務校正。這是兩種資料來源，不代表桌布本身取得平台播放權限。

## 音訊、AI 與費用

本機 Whisper 校正須使用者同意並首次下載獨立 Python／模型。只在本機分析系統喇叭或耳機輸出，不使用麥克風、不保存錄音；可能包含同時播放的其他程式聲音。首次片段12秒，仍另需辨識時間。

AI 主題另須自己的 Gemini／OpenAI 相容金鑰，最多傳送2000字元歌詞文字。可選的「Gemini 音訊校正」是獨立音訊上傳同意項目；啟用後會將10秒系統音訊送至 Google Gemini 3.5 Flash-Lite。每首每天最多2次、每日最多20次（UTC），每次最多等待15秒；與已有歌詞比對確認後才使用結果。API 免費額度與收費依自己的供應商及專案，工具不替使用者啟用付費帳單，也不保證付費專案零費用。金鑰由使用者自行設定，公開包沒有任何使用者金鑰或配對token。

## 原作與下載

Folia：chthollyphile 及貢獻者，GNU AGPL-3.0，基底0.7.17／a3574a784cb20972ac85edfd71449b1eb848ea7f。
https://github.com/chthollyphile/folia-major

Mineradio：XxHuberrr 及貢獻者，GNU GPL-3.0，d43de565acabfdc1a9c9820a27e81a98ccbebcef。Emily 粒子原創與各貢獻者依原通知致謝。Three.js 保留MIT通知。
https://github.com/XxHuberrr/Mineradio-paused

本版沿用適用的 AGPLv3／GPLv3 條文，保留原署名、完整授權與修改版對應原始碼。Sonic Topography（預設7）與 Sonic Workshop（預設8）第三方動畫未收錄。軟體按現狀提供，不是原專案官方版本；音樂、歌詞、封面與外部內容權利仍屬各自權利人。本作品不附歌曲音訊。

同版本桌布、配套工具、完整修改原始碼與校驗碼：https://github.com/D1124423017/FoliaWallpaper/releases/tag/wallpaper.10.10
公開原始碼：https://github.com/D1124423017/FoliaWallpaper
既有Steam作品：https://steamcommunity.com/sharedfiles/filedetails/?id=3818020625

授權資料包含播放器與桌布依賴的聯集，並不代表所有列出的套件都由桌布載入；詳細範圍、已保留原文與尚未取得的歷史版本通知見 licenses。
