# Folia Wallpaper wallpaper.10.10

Folia × Mineradio 的非官方繁體中文 Wallpaper Engine Web 桌布。保留原版歌詞與背景，加入 Mineradio 粒子、可操作的設定選單、來源選擇及 Folia Mineradio 共用資料介面。

## 下載與安裝

- FoliaWallpaper-Wallpaper-wallpaper.10.10.zip：完整解壓縮，把 index.html 匯入 Wallpaper Engine。
- FoliaWallpaper-Tools-windows-x64-wallpaper.10.10.zip：完整解壓縮並執行「啟動歌詞服務.cmd」；Chrome 另需手動載入 chrome 擴充功能並指定歌曲分頁。
- FoliaWallpaper-Source-wallpaper.10.10.zip：同版本完整修改來源、獨立建置 wrapper 與授權。
- SHA256SUMS.txt：三份 ZIP 的 SHA-256。ASSEMBLY-MANIFEST.json 是發布前建置快照，其中 published:false 指組裝時狀態。

只訂閱 [Steam 工坊項目](https://steamcommunity.com/sharedfiles/filedetails/?id=3818020625) 不會安裝配套服務、擴充功能或模型。桌布不播放音樂；音樂由外部播放器或另行安裝的 [Folia Mineradio 播放器](https://github.com/D1124423017/FoliaWallpaper/releases/tag/player.0.7.17-integration.4-license.1) 播放。

## 此版驗證

3507 個凍結來源檔逐一核對；含空格的新路徑執行乾淨 npm ci 和完整重建成功，renderer 與 service 與交付版完全一致。便攜 Node 24.21.0 的服務啟動、獨立配對、健康檢查及停止通過；公開 token 保持空白。三份 ZIP 會逐 entry 核對大小及 SHA-256。

修正舊發布腳本依賴 PowerShell 解壓縮模組的問題，獨立 wrapper 改以 Node 讀取 ZIP，官方執行環境與授權下載皆有固定校驗。沒有在這次封裝驗證重跑所有歌詞來源、長時間播放或全部多螢幕組合。

## 限制與可選功能

預設封面配色。本機音訊分析、Gemini 音訊上傳、AI 主題與桌布滾輪皆需自行啟用。只在本機分析時不傳音訊；另行同意 Gemini 校正後會上傳 10 秒系統輸出音訊，可能包含其他程式聲音。AI 費用依自己的 API 供應商與專案方案，工具不開通付費帳單，不保證付費專案零費用。

歌詞與同步取決於來源、錄音版本和時間軸，不保證首首成功。Mineradio 桌布模式保留粒子視覺，未包含完整播放器控制台、3D 歌單、Sonic 7／8、外部深度或手勢模型。其他限制及重建方式見 ZIP 內 PUBLICATION.md、PUBLICATION-VALIDATION.md 與使用說明。

## 致謝與授權

感謝 [Folia／chthollyphile](https://github.com/chthollyphile/folia-major) 與 [Mineradio／XxHuberrr](https://github.com/XxHuberrr/Mineradio-paused) 及所有貢獻者。保留 Folia AGPL-3.0、Mineradio GPL-3.0、各第三方原始通知與完整修改來源；GSAP 為 Standard No-Charge License，並非 MIT。通知聯集與服務實際範圍分開標示；兩份只含空程式／metadata 的歷史通知缺口保持揭露。這是非官方改作，不附歌曲或平台帳號。

[完整原始碼與建置說明](https://github.com/D1124423017/FoliaWallpaper/tree/wallpaper.10.10/source/FoliaWallpaper-10.10)
