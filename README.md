# FoliaWallpaper / Folia Mineradio

基於 [Folia](https://github.com/chthollyphile/folia-major) 與 [Mineradio](https://github.com/XxHuberrr/Mineradio-paused) 的非官方繁體中文改作，分別提供 Windows 播放器與 Wallpaper Engine 桌布。

## 下載

| 成品 | 下載與說明 |
| --- | --- |
| Windows x64 播放器 | [player.0.7.17-integration.4-license.1](https://github.com/D1124423017/FoliaWallpaper/releases/tag/player.0.7.17-integration.4-license.1) · [功能、安裝與限制](PLAYER.md) |
| Wallpaper Engine 桌布及配套工具 | [wallpaper.10.10](https://github.com/D1124423017/FoliaWallpaper/releases/tag/wallpaper.10.10) · [安裝與重建](source/FoliaWallpaper-10.10/PUBLICATION.md) |

播放器為未簽章預覽版，可選 Folia、Mineradio 或自訂混搭介面，共用播放、歌詞、帳號、佇列及設定。播放器直接播放與桌布跟隨外部播放器是不同的資料來源模式。

## Wallpaper Engine 桌布

保留 Folia 原版 14 種歌詞樣式及 5 種背景；可使用 Mineradio 原版粒子動畫、封面配色、音訊反應與繁體中文設定。桌布版本未搬入完整播放器控制台或 3D 歌單架。

下載同版本桌布與工具兩個 ZIP，完整解壓縮。將桌布資料夾的 index.html 匯入 Wallpaper Engine，再執行工具的「啟動歌詞服務.cmd」。[既有 Steam 工坊項目](https://steamcommunity.com/sharedfiles/filedetails/?id=3818020625) 的訂閱不會自動安裝背景服務、Chrome 擴充功能或模型。

工具附 Node.js，無須修改系統 PATH。Chrome YouTube／YouTube Music 請手動載入工具內 chrome 資料夾，重新整理歌曲分頁，再點「指定此分頁為 Folia 播放來源」。其他播放器需提供 Windows 媒體資訊；未提供歌名或時間軸的程式，無法保證辨識歌曲或同步。

找到歌詞而尚未確認錄音時間時，先提供預覽。同步品質依歌曲版本、來源、字幕及時間軸而異，不保證首首成功或真正逐字時間。多螢幕滾輪轉接需依工具說明另行啟用；預設停用。

## 可選音訊分析與 AI

預設封面配色，不需要 AI API。本機 Whisper 音訊校正、Gemini 音訊上傳及滾輪轉接都預設停用。

本機分析需要自行同意及下載 Python／模型；分析系統喇叭或耳機輸出，可能包含其他同時播放的程式，不使用麥克風、不保存錄音。AI 主題最多傳送 2000 字元歌詞文字；另外啟用並同意「Gemini 音訊校正」才會把 10 秒系統音訊傳給 Google。費用取決於自己的供應商、專案與方案，工具不替使用者啟用付費帳單，也不保證付費專案零費用。

公開包沒有私人金鑰或配對 token。每台電腦啟動工具時產生自己的配對資料；使用後請勿再分享整個工具資料夾。重新開機後需再啟動服務，此版不自動建立開機啟動項目。

## 完整原始碼與驗證

- 播放器：[source/FoliaMineradio](source/FoliaMineradio/)，同修訂完整 ZIP 與 SHA-256 隨播放器 Release 提供。
- 桌布：[source/FoliaWallpaper-10.10](source/FoliaWallpaper-10.10/)，包含完整凍結來源、獨立 publication wrapper、對應授權與重建說明。
- 舊版 source/folia-major 保留供 wallpaper.8.1 歷史對照；新版請使用上述對應來源。

桌布重建：先在 source/FoliaWallpaper-10.10/source/folia-major 執行 npm ci，再回到 source/FoliaWallpaper-10.10 執行 node publication/prepare-wallpaper-10-10.mjs --rebuild --install-service。請依 [PUBLICATION.md](source/FoliaWallpaper-10.10/PUBLICATION.md) 操作，避免使用歷史文件中的舊封裝命令。

wallpaper.10.10 已在含空格的新路徑以乾淨 npm ci 完整重建，renderer 與服務皆逐位元組吻合；便攜服務的啟動、獨立配對、健康檢查及停止通過。此輪沒有重跑完整長時間播放或所有多螢幕組合，詳見 [發布驗證](source/FoliaWallpaper-10.10/PUBLICATION-VALIDATION.md)。

## 原作、修改與授權

感謝 chthollyphile 與 Folia 貢獻者、XxHuberrr 與 Mineradio 貢獻者，以及原 NOTICE 中的 Emily、YUI7W 等作者。Folia 基底為 0.7.17／a3574a784cb20972ac85edfd71449b1eb848ea7f；Mineradio 為 d43de565acabfdc1a9c9820a27e81a98ccbebcef。修改包含繁體中文、共用播放核心、兩套介面、桌布相容層、背景歌詞、來源選擇與時間同步。

保留 Folia AGPL-3.0、Mineradio GPL-3.0 及第三方各自授權與作者聲明。GSAP 使用 Standard No-Charge License，並非 MIT；Three.js、OpenCC、字體及執行環境通知隨包保留。Sonic Topography／Sonic Workshop（預設 7、8）未收錄。通知資料包含播放器／建置／桌布依賴聯集，不代表每一套件皆由桌布載入；歷史缺口及實際範圍另列。

這是非官方改作，沒有原作者官方背書。Folia 原 README 的非營利用途文字保留，不另作商業授權承諾。軟體按現狀提供，不作保證。音樂、歌詞、封面及外部內容的權利屬於各自權利人；本作品不附歌曲音訊或平台帳號。
