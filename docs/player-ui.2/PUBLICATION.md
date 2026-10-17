# ui.2 GitHub 發布範圍

日期：2026-10-17；版本：0.7.17-integration.4；修訂：ui.2。

[公開 Release](https://github.com/D1124423017/FoliaWallpaper/releases/tag/player.0.7.17-integration.4-ui.2) · [標籤固定的完整來源](https://github.com/D1124423017/FoliaWallpaper/tree/player.0.7.17-integration.4-ui.2/source/FoliaMineradio)

本次更新播放器的標題列體驗切換、設定頁自訂組合與移除 YouTube 帳號接入。Wallpaper Engine／Steam 工坊未更新，原 wallpaper.10.10 保留。

## 對應成品

- 安裝包 SHA-256：`2898589998594a8ae8252083361472f9bf1c3f48203fd07b7d649a362b3af2e2`。
- 來源 ZIP SHA-256：`0b6308a181e5861490fa3b9ffde0c08ebeafff23ac2e4d291b224c39a6c19b39`。
- ASAR SHA-256：`36b052354524c17913f842abd2d3ed70fb440864574490eb4b41f2e7046c89ba`。
- 來源 manifest：3499 檔，ZIP 共3500 entries（含 manifest），逐檔大小與雜湊核對；git index 另核對原始 bytes。

來源 ZIP、安裝包及 source/FoliaMineradio 保持同一凍結快照，沒有為了改寫發布狀態而重新封裝。快照中的 DELIVERY.published=false、本機安裝位置、先前 license.1 驗證文件及「未發布」文字是 2026-10-16 狀態；本文件與 GitHub Release 才是當前公開發布紀錄。

## 驗證

TypeScript、93 項相關單元測試通過。Playwright 以獨立 Electron profile 操作真實封裝 ui.2，播放網易雲《Stronger》及歌詞；5 次選單切換與1次鍵盤切換保持音訊節點、URL、歌曲、佇列、音量和遞增進度。1220×880 與860×680無重疊，最大化／還原、全螢幕／退出、最小化／還原與點穿狀態通過，0個page errors。安裝時37份持久化檔案保持原雜湊。

使用者帳號、private backup、原始 QA profile、瀏覽器資料、Cookie、token、金鑰及 logs 不在公開資產中。Console 的跨來源 QQ API 2001 和一筆404另保留為測試限制，不宣稱所有網路來源正常。沒有重跑一小時或實體多螢幕長測。

授權原文與通知、固定來源archives、重建guards皆隨完整來源保留。安裝包未簽章，Windows x64預覽版；音源／歌詞／會員／地區限制沿用來源平台。
