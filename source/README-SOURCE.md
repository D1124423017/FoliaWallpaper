# Folia Wallpaper 修改版原始碼

本快照對應 0.7.17-wallpaper.8，修改日期：2026-10-12（Asia/Taipei）。
原專案：https://github.com/chthollyphile/folia-major
基底提交：a3574a784cb20972ac85edfd71449b1eb848ea7f
原專案作者：chthollyphile；其他作者與權利聲明依原檔案及 CONTRIBUTORS.md。
本修改版依隨附 GNU AGPL-3.0 授權發佈。這是非官方的 Wallpaper Engine 改作。

修改包含：繁體中文介面、獨立 Wallpaper Engine Web 舞臺、原版動畫／背景的轉接、
封面配色、跨來源歌詞背景服務、Chrome YouTube 時間軸連接、本機音訊自動對齊，
以及歌詞時長轉接與部分動畫相容性修正。檔案內既有版權與授權聲明保留。

## 重建

先把 folia-major 放到任意工作區的 work 資料夾下。安裝 Node.js 24+，在 folia-major 目錄執行：

    npm ci
    npm run build:wallpaper
    npm run build:wallpaper-lyrics

公開便攜工具與桌布可用 npm run build:wallpaper-public 重建。此流程不讀取本機 .env
檔案，會下載並校驗固定版本的 Node.js／uv、安裝鎖定依賴，輸出可搬移的工具包。
公開工具中的 AI 連線由各使用者自行設定；原始碼和下載包沒有任何使用者金鑰。

打包腳本依此原始碼目錄的位置在 ../../outputs 產生桌布、背景服務及 Chrome 連接檔。
背景服務啟動檔由打包脚本針對新電腦產生，不能直接搬用原開發電腦的 .cmd。
完整說明見 folia-major/docs/wallpaper/使用說明.md；裡面的開發電腦絕對路徑須換成自己的輸出位置。

## 可選本機音訊校正

需要 Windows、Python 3.13 與預設喇叭的 WASAPI loopback。
FoliaWallpaper_Audio 資料夾提供目前使用的套件鎖定清單與模型下載腳本；
模型、虛擬環境和 GPU 二進位套件不隨這份原始碼快照發佈。
先把本快照 FoliaWallpaper_Audio 中的 requirements-lock.txt 和 prepare-model.py 複製到
工作區 outputs/FoliaWallpaper_Audio。在該輸出資料夾建立 .venv，安裝 requirements-lock.txt，
執行 prepare-model.py；GPU 不可用時 device.py 會回退 CPU。
確認使用者同意系統輸出音訊分析後，建立 enabled.json：

    {"enabled": true}

再啟動背景服務。關閉這項功能可將 enabled 改為 false 並重啟服務。
程序只擷取預設喇叭的系統混音，不使用麥克風，不保存錄音。
不需要付費 AI API；完整歌詞效果仍受歌詞資料庫和辨識品質限制。

## 快照內容

包含 Git 追蹤原始碼的目前版本與新加入的原始碼、測試、設定和建置腳本。
不包含 .env.local、憑證、Git 歷史、已打包程式、node_modules、模型、錄音或本機服務 token。
SHA256SUMS.json 記錄原始檔案摘要。

原專案 README 另有非營利用途說明；商業使用的表述與標準 AGPL-3.0 存在差異，
若有商業發行計畫，宜向原作者釐清。音樂、歌詞、專輯封面及其他外部內容的權利不因程式授權而轉移。
