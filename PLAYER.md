# Folia Mineradio 播放器

這是結合 [Folia](https://github.com/chthollyphile/folia-major) 與 [Mineradio](https://github.com/XxHuberrr/Mineradio-paused) 的非官方 Windows 音樂播放器。播放、歌曲來源、歌詞、時間軸、佇列及帳號共用 Folia 核心，使用者可以選擇原版 Folia、Mineradio 或自訂混搭介面。

本頁對應應用程式 `0.7.17-integration.4`、交付修訂 `license.1`；Release 標籤為 `player.0.7.17-integration.4-license.1`。這個播放器與本倉庫的 Wallpaper Engine 桌布分開交付。

附帶的 `ARTIFACTS.json` 與驗證文件記錄為 **2026-10-14 本機驗證快照**；其中「未發布」描述是當時狀態，實際公開發布以此 Release 為準。

## 下載與安裝

[播放器下載頁](https://github.com/D1124423017/FoliaWallpaper/releases/tag/player.0.7.17-integration.4-license.1)

- `Folia-Mineradio-Setup-0.7.17-integration.4-license.1-x64.exe`：Windows x64 安裝包，**未簽章（NotSigned）**。
- `Folia-Mineradio-Source-0.7.17-integration.4-license.1.zip`：同修訂完整修改版原始碼及 `SOURCE-MANIFEST.json`。
- `ARTIFACTS.json` 與兩份 `.sha256`：檔案大小、SHA-256、授權範圍與測試證據摘要。

下載後先核對 SHA-256，再執行安裝包；開始功能表中的名稱是「Folia Mineradio」。例如：

```powershell
Get-FileHash .\Folia-Mineradio-Setup-0.7.17-integration.4-license.1-x64.exe -Algorithm SHA256
```

| 檔案 | SHA-256 |
| --- | --- |
| Windows x64 安裝包 | `aeba0392075f78b24201079fd3bb041f5ab31701e2b3c677903e7e0b7079db39` |
| 同修訂來源 ZIP | `663b9899158df1c7ce9308fd2425c8403b883cbcf6523763d37bf735c1ebc112` |

整合版使用獨立的 `%APPDATA%\Folia Mineradio` 資料夾，兩套介面共享這個版本的登入與設定。安裝包不會替使用者安裝或更新既有 Wallpaper Engine 桌布。

## 三種體驗

- **Folia**：原版歌詞舞臺、控制介面與主要操作流程。
- **Mineradio**：接入原版粒子舞臺、鏡頭、控制台及 3D 歌單架；右上角「DIY」可叫出視覺控制台，內容可用滑鼠滾輪捲動。
- **自訂**：分別選擇控制介面、歌詞及背景，例如 Folia 歌詞搭配 Mineradio 粒子背景。各模式的視覺偏好分開保存，切換時歌曲、進度、音量及佇列繼續由同一核心維持。

Mineradio 支援 11 種原版預設：Emily 封面粒子、滾筒、星球、虛空、唱片、星河、安魂、月蝕聖環、雨幕霓虹、折光蝶群、深海綻放。

音樂來源與帳號沿用 Folia 的支援範圍。Spotify／YouTube 的外部跟隨功能，不代表本播放器已提供這些平台的完整帳號串流。可播放內容仍受各來源、地區、會員及帳號權限影響；本專案不附歌曲音訊。

若搭配支援共用資料介面的新版桌布及背景服務，桌布可使用播放器提供的歌曲、歌詞、封面、配色、進度及頻譜。桌布本身不播放音樂，這與跟隨其他外部播放器是不同來源模式。

## 驗證範圍

本修訂通過官方後端快取／Koa HTTP **6 項**、middleware／真實 router **20 項**測試，以及 TypeScript、乾淨 `npm ci` 和來源重建。實際播放器搜尋並播放《Stronger》，顯示 15 行歌詞、封面及 33,489 個粒子；**15 次介面切換**保留同一音訊元素與音源，暫停、跳轉與安裝後帳號／設定保存亦已驗證。

新包內實際交付的 149 個 renderer chunks 與前一版相同；這不等於在不同 Git 環境下可逐 bit 重現安裝包。前一版的一小時連續播放、127 次切換及雙實體螢幕桌布測試，仍綁定舊 ASAR `015c2a360982c0d7950902e9d0db9c1f267e539365e6753613af89e6c2e03b1f`。**license.1 沒有重新執行完整一小時或雙螢幕長測**，新 ASAR 是 `c551906e0da6803d989a1b3f746832d79cb7bff84f1fb592d72fcd948c143ef4`。

完整紀錄見 Release 的 `FINAL-VALIDATION.md`、`ARTIFACTS.json`，以及來源中的 [階段驗證紀錄](source/FoliaMineradio/docs/integration/VALIDATION.md)。

## 目前限制

- Windows x64 未簽章預覽版；未提供其他平台整合安裝包。
- Sonic Topography／Sonic Workshop（7、8）、外部 AI 深度圖、手勢模型及獨立自動混音未接入。
- Mineradio 的平台／Podcast 分頁使用共用歌曲搜尋；音質、快取與快捷鍵入口導向 Folia 設定。自訂選 Folia 控制時，Mineradio 歌單架隨原控制台隱藏。
- 冷啟動恢復歌曲及佇列並保持暫停，不保存精確播放秒數；暫停沿用淡出，跳轉會恢復播放。
- 不保證所有歌曲均有正確逐字歌詞；平台、MV 版本及外部播放器的時間軸限制仍存在。
- 一小時觀測不是所有裝置或長時間使用的效能保證。AI API 是各使用者自行設定的可選功能；公開包沒有私人金鑰。

其餘來源、帳號、桌布與效能限制見 [KNOWN-LIMITATIONS.md](source/FoliaMineradio/docs/integration/KNOWN-LIMITATIONS.md)。

## 原始碼與重建

播放器的完整對應來源在 [source/FoliaMineradio](source/FoliaMineradio/)，包含 3,507 個原始檔及原始 `SOURCE-MANIFEST.json`；來源 ZIP 另外提供逐 entry 大小與 SHA-256 對應。與舊桌布來源 `source/folia-major` 分開保留。

在 Windows x64 安裝 Node.js 24+，依 [BUILD-WINDOWS.md](source/FoliaMineradio/docs/integration/BUILD-WINDOWS.md) 執行鎖定依賴安裝、執行環境校驗及建置。播放器建置入口為 `dev/integration/release/build.mjs`；不要用上游開發命令代替這個含後端相容層的入口。來源不包含 `node_modules`、使用者帳號、私人設定、模型權重或音樂。

## 原作、改作與授權

感謝 **chthollyphile 與 Folia 貢獻者**、**XxHuberrr 與 Mineradio 貢獻者**；原版視覺的 emily 共創與 YUI7W 等致謝依原 NOTICE 保留。這是非官方改作，沒有原作者的官方背書。

- Folia：[AGPL-3.0 全文](source/FoliaMineradio/LICENSE)。
- Mineradio：[GPL-3.0 全文](source/FoliaMineradio/dev/integration/mineradio/upstream/LICENSE) 與原版 NOTICE。
- 第三方程式及字體各依自身授權：例如 GSAP 使用其 **Standard No-Charge License，並非 MIT**；Three.js／OpenCC-js 保留各自通知，OpenCC 字典另保留 Apache 2.0，字體保留 SIL OFL 1.1。

license.1 改用附完整 MIT 的官方 `cache-content-type@2.1.0` 與固定提交的 `koa-compose` 來源，保留原文、官方 archives、來源 URL、lock integrity 及打包檢查。實際交付程式碼的 tracked notice gaps 為 0；這個檢查結果不代表對所有授權義務作法律保證，歷史或未交付依賴的通知缺口仍有紀錄。

完整作者與修改說明見 [ATTRIBUTION.md](source/FoliaMineradio/docs/integration/ATTRIBUTION.md)，通知範圍見 [NOTICE-GAPS.md](source/FoliaMineradio/docs/integration/NOTICE-GAPS.md)。Folia 原 README 的非營利用途文字保留；本整合不另作商業授權承諾。音樂、歌詞及封面的權利屬於各自權利人，程式碼授權不提供音樂平台帳號或內容權利。
