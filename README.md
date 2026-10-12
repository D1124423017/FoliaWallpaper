# FoliaWallpaper

基於 [Folia](https://github.com/chthollyphile/folia-major) 的非官方 Wallpaper Engine Web 桌布，保留原版歌詞動畫與視覺邏輯，改接外部播放器的歌曲資訊、播放時間、封面與系統音訊。

**繁體中文測試版：0.7.17-wallpaper.8**

## 下載

[完整下載頁：桌布、Windows 配套工具、修改版原始碼及 SHA-256 校驗碼](https://github.com/D1124423017/FoliaWallpaper/releases/tag/wallpaper.8)

- `FoliaWallpaper-Wallpaper-wallpaper.8.zip`：將其中 `index.html` 匯入 Wallpaper Engine。
- `FoliaWallpaper-Tools-windows-x64-wallpaper.8.zip`：Windows 10/11 x64 的獨立背景歌詞服務、Chrome 時間軸連接與本機音訊校正安裝工具。
- `FoliaWallpaper-Source-wallpaper.8.zip`：此版本完整修改原始碼與建置設定。
- `SHA256SUMS.txt`：下載檔案校驗碼。

完整歌詞功能需要另外安裝配套工具；只訂閱或匯入桌布不會自動安裝工具、瀏覽器擴充功能或模型。音樂仍由原本的播放器播放，不需要另外啟動 Folia 本體。

## 功能

- 14 種原版歌詞樣式：心象、群唱、迴環、流光、鏡臺、浮名、繪光、莫奈、雲階、時計、商籟、靜止、凝彩、傾訴。
- 5 種原版背景：通用、隱現、莫奈、漫遊、空。
- 封面配色、音訊反應、歌曲資訊與歌詞大小設定。
- 跨來源歌詞搜尋、Chrome YouTube／YouTube Music 真實時間軸。
- 可選本機 Whisper small 音訊校正，處理錄音版本的時間差。
- 可選 Gemini／OpenAI 相容 AI 主題，需自行設定 API 金鑰；預設封面配色。

歌詞與辨識品質依來源、錄音版本、播放資訊及其他聲音而異，不保證所有歌曲都有可用歌詞或真正逐字時間。

## 安装

請參閱下載包內的 `使用說明.md`。工具已附 Node.js，先解壓缩整個資料夾、執行啟動檔。Chrome 使用者另需手動載入工具中的 `chrome` 擴充功能並重新整理音樂分頁。

本機音訊分析預設停用；啟用需同意分析預設喇叭的系統混音，並下載獨立 Python、套件與模型。工具不使用麥克風、不儲存錄音、不把音訊送往 API。重新開機後需再啟動背景服務，這版不自動建立開機啟動項目。

AI 主題是獨立的可選功能，會把最多 2,000 字元歌詞文字送往所選供應商。金鑰以 Windows 使用者 DPAPI 加密保存在自己的 AppData，不包含在公開包中。API 是否收費取決於自己的供應商與專案方案；本工具不設定或啟用付費帳單。

## 原始碼與重建

原始碼在 `source/folia-major/`；完整快照同時提供於 Release。保留原檔案內的版權、授權和貢獻者聲明。

安裝 Node.js 24+，在 `source/folia-major/` 執行：

```sh
npm ci
npm run build:wallpaper-public
```

輸出在此專案的 `outputs/FoliaWallpaper_Publication/stage/`。固定執行環境版本與校驗碼、套件鎖定清單及打包脚本在 `dev/wallpaper/release/`。

## 原作、改作與授權

原專案作者：**chthollyphile 與 Folia 貢獻者**。原專案：[chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)。

基底：Folia 0.7.17，提交 `a3574a784cb20972ac85edfd71449b1eb848ea7f`。修改日期：2026-10-12。

修改包含 Wallpaper Engine 舞臺轉接、繁體中文介面、獨立歌詞背景服務、Chrome 時間軸連接、本機音訊對齊、便攜工具打包與相容性修正。這是免費分享的非官方改作，不是 Folia 官方發行或官方背書。

本修改版依隨附 **GNU AGPL-3.0** 發佈。第三方套件與模型各依自身授權使用；授權資料隨下載包保留。軟體按現狀提供，不作保證。音樂、歌詞、專輯封面及其他外部內容的權利屬於各自權利人；本作品不附歌曲音訊。

原專案 README 另有非營利用途聲明，與標準 AGPL-3.0 的商業使用條款存在表述差異；如有商業發行計畫，請先向原作者釐清。
