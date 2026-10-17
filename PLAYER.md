# Folia Mineradio 播放器

結合 [Folia](https://github.com/chthollyphile/folia-major) 與 [Mineradio](https://github.com/XxHuberrr/Mineradio-paused) 的非官方 Windows 播放器，兩套介面共用 Folia 播放、歌詞、佇列、支援平台帳號及收藏核心。

目前版本：**0.7.17-integration.4／ui.2**；[下載安裝包及完整原始碼](https://github.com/D1124423017/FoliaWallpaper/releases/tag/player.0.7.17-integration.4-ui.2)。發布日期：2026-10-17。Wallpaper Engine 桌布維持 wallpaper.10.10，分開下載與安裝。

## ui.2 更新

- Folia／Mineradio／自訂切換移到視窗頂部標題列、鎖定按鈕左側。移動滑鼠到頂部即可顯示，選擇後進入播放畫面。
- 設定頁只保留自訂組合的控制介面、歌詞舞臺和視覺背景調整。
- 修正體驗選單與返回按鈕重疊；選單與視窗按鈕現在排在同一列。
- 移除所有 YouTube 帳號登入、OAuth、帳號歌單 API、Electron IPC 與憑證教學，並清除同一停用模組的 Spotify 帳號程式。其他支援平台帳號及桌布外部跟隨流程保留。
- 切換體驗保留歌曲、進度、音量和佇列；Mineradio 畫面發生錯誤時仍可從提示開啟設定。

![頂部體驗切換](docs/player-ui.2/titlebar-controls.png)

## 下載與安裝

- Windows x64：[Folia-Mineradio-Setup-0.7.17-integration.4-ui.2-x64.exe](https://github.com/D1124423017/FoliaWallpaper/releases/download/player.0.7.17-integration.4-ui.2/Folia-Mineradio-Setup-0.7.17-integration.4-ui.2-x64.exe)。未簽章預覽版。
- 完整修改來源：[Folia-Mineradio-Source-0.7.17-integration.4-ui.2.zip](https://github.com/D1124423017/FoliaWallpaper/releases/download/player.0.7.17-integration.4-ui.2/Folia-Mineradio-Source-0.7.17-integration.4-ui.2.zip)。
- Release 另附 SHA256SUMS、使用說明、作者致謝、授權與驗證摘要。

| 檔案 | SHA-256 |
| --- | --- |
| Windows x64 安裝包 | `2898589998594a8ae8252083361472f9bf1c3f48203fd07b7d649a362b3af2e2` |
| 完整來源 ZIP | `0b6308a181e5861490fa3b9ffde0c08ebeafff23ac2e4d291b224c39a6c19b39` |

使用 PowerShell 的 `Get-FileHash 檔案路徑 -Algorithm SHA256` 核對下載。關閉播放器後執行安裝包，既有資料位於 `%APPDATA%\Folia Mineradio`。安裝包不會安裝或更新 Wallpaper Engine 桌布。

## 使用與限制

Folia 保留原版歌詞舞臺與操作；Mineradio 保留原粒子舞臺、鏡頭、控制台和 3D 歌單架；自訂可混搭。自訂組合在「設定 → 介面設定 → 播放器體驗 · 自訂」調整，再從標題列切到自訂。各模式分別記住視覺偏好。

Mineradio 的 DIY 控制台可用滑鼠滾輪操作，支援 11 種原版預設；Sonic Topography／Sonic Workshop（7、8）、外部深度圖、手勢模型及獨立自動混音未接入。

播放器播放沿用 Folia 的支援來源；沒有 Spotify／YouTube 帳號串流或帳號歌單接入。平台地區、會員、歌曲權限及歌詞匹配限制仍存在。桌布跟隨 Chrome YouTube／YouTube Music 是另一條獨立的外部來源流程。

冷啟動恢復歌曲及佇列並保持暫停，不保存精確秒數；暫停有淡出，跳轉會恢復播放。AI API 是可選功能，公開成品沒有私人金鑰；封面配色與歌詞舞臺不需要付費 API。

## 驗證與來源

ui.2 通過 TypeScript、93 項相關測試、實際網易雲歌曲播放與歌詞、5 次頂部模式切換和 1 次鍵盤切換、1220 與 860 寬度版面、最大化／還原、全螢幕／退出、最小化／還原及點穿狀態。保持相同音訊元素、來源、佇列和音量，沒有 page errors；安裝後 37 份持久化檔案保持相同。此修訂未重跑先前一小時或實體雙螢幕測試。跨來源搜尋仍觀察到 QQ API 2001 與一筆 404，網易雲播放與本次介面驗證成功。

完整驗證與發布範圍見 [PUBLICATION.md](docs/player-ui.2/PUBLICATION.md)。3499 個來源檔逐一核對 SHA-256；[目前完整來源](source/FoliaMineradio/) 與 ZIP 逐檔一致。依 [Windows 建置說明](source/FoliaMineradio/docs/integration/BUILD-WINDOWS.md) 使用 Node.js 24+ 與自訂整合建置入口，不要改用上游打包命令。

來源與安裝包中的「本機／未發布」文字保留為 2026-10-16 驗證快照；公開發布狀態以此頁、Release 及 PUBLICATION.md 為準。先前 license.1 Release 與標籤保留。

## 作者與授權

感謝 chthollyphile、XxHuberrr、Folia／Mineradio 貢獻者及原 NOTICE 的 Emily、YUI7W 等作者。保留 Folia AGPL-3.0、Mineradio GPL-3.0 與第三方各自通知；GSAP 使用 Standard No-Charge License，並非 MIT。

[作者與修改說明](source/FoliaMineradio/docs/integration/ATTRIBUTION.md)、[Folia 授權](source/FoliaMineradio/LICENSE)、[Mineradio 授權](source/FoliaMineradio/dev/integration/mineradio/upstream/LICENSE)、[通知範圍](source/FoliaMineradio/docs/integration/NOTICE-GAPS.md)。繼承 license.1 官方後端替代與授權 guards，本次包內 148 個 renderer chunks 經檢查，tracked notice gaps 中沒有實際交付程式碼。這是非官方改作，不附歌曲音訊、帳號或原作者背書。
