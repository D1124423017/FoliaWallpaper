# Windows 本機建置

這套流程為 Folia Mineradio 使用獨立名稱、應用程式 ID、設定資料夾與輸出路徑。既有 Folia 安裝及 Wallpaper Engine 專案不會被此建置流程更新。

需求：Windows x64、Node.js 24 以上、鎖定的 npm 相依套件，以及首次下載 Electron、NSIS、固定校驗的 Folia FFmpeg 建置所需網路。版本以 `package-lock.json`、`node_modules/electron/package.json` 與 `packaging/ffmpeg/fetch-ffmpeg.mjs` 為準；不會在打包時下載大型音訊模型。

在本專案根目錄執行：

```powershell
npm ci
node dev/integration/release/build.mjs --check
node dev/integration/release/prepare-runtime.mjs
$electronVersion = (Get-Content node_modules/electron/package.json -Raw | ConvertFrom-Json).version
$env:FOLIA_INTEGRATION_ELECTRON_DIST = (Resolve-Path ".integration-build/runtime/electron-$electronVersion").Path
node dev/integration/release/build.mjs --dir
node dev/integration/release/build.mjs --installer --skip-build
node dev/integration/release/source-archive.mjs
```

`--check` 只驗證設定與必要入口，不代表程式或安裝包測試通過。`--dir` 產生 `win-unpacked`；`--installer` 產生 NSIS 安裝包。`--skip-build` 使用上一個 `.integration-build/dist`，只適合已完成本次原始碼建置時使用。

前端輸出在 `.integration-build/dist`，套件內對應路徑仍為 `dist`；Electron 與 electron-builder 的下載快取在 `.integration-build/cache`。所有建置固定使用 `--publish never` 並停用套件發布來源。輸出在專案所在工作區的 `outputs/FoliaMineradio`。

整合包識別：`local.folia.mineradio`；主程式 `electron/integration/main.cjs`；設定資料夾 `%APPDATA%\Folia Mineradio`。預覽版沒有簽章憑證，不會啟用原 Folia 上游更新器。`signAndEditExecutable:false` 避免本機預覽建置需要簽章工具；可執行檔的 Windows 版本資源仍可能顯示 Electron 的資訊，以交付 manifest 和程式內版本為準。

`prepare-runtime.mjs` 只下載及驗證精確 Electron、FFmpeg 和 NSIS 1.2.1 工具集，不啟動任何應用程式。Electron 壓縮檔的 SHA-256 會與鎖定套件內的檢查碼比較；結果位於 `.integration-build/runtime-manifest.json`。上面的 `FOLIA_INTEGRATION_ELECTRON_DIST` 指向剛校驗完成的 runtime，避免 electron-builder 重新尋找或下載另一份 Electron；請勿將它指向未校驗或不同版本的目錄。

FFmpeg 在原 `beforePack` 中依固定版本及 SHA-256 驗證。模型由原 Folia 的模型設定功能按需取得。此整合包目前未建置 Folia 自有的 Rust 桌布輔助程式；Wallpaper Engine 桌布是獨立成品，維持原有安裝。

安裝包建置不會自動安裝或啟動。原始碼包不包含帳號、API 金鑰、`.env.local`、使用者音樂、播放紀錄、設定、模型權重或 node_modules；首次重建需重新安裝鎖定相依套件。

原始碼包含 `assets/` 的必要建置圖片、原版字體及 OFL、視覺模組、`.npmrc`、`.nvmrc`、lockfile、原始碼與測試。`.npmrc` 只允許公開 npm registry 和目前已核對的建置選項；帶有認證或未知選項會讓 source archive 停止產生。修改版仍保留上游 README 的原文，整合版的建置入口以本文件為準。

`source-archive.mjs --check` 只檢查檔案選擇、必要素材和金鑰格式，不產生 ZIP。正式產生時採 ZIP store，並在完成檔名前逐 entry 比對大小及 SHA-256；完整清單在 ZIP 內的 `SOURCE-MANIFEST.json`。壓縮包較大是刻意選擇，避免曾出現的字體 deflate 損壞。既有 `integration.1` 和 `integration.2` 原始碼 ZIP 在 JetBrains Mono 字體的兩個 entry 有損壞且缺必要素材，不能作為可重建的正式原始碼交付，詳見 `RELEASE-NOTES.md`。

完整使用說明、限制、驗證、致謝與建置文件會附於安裝目錄 `resources/docs/`。`collect-licenses.mjs` 保留套件內原始通知，並檢查 `docs/integration/third-party-notices/NOTICE-SOURCES.json` 所列的精確版本與檔案 SHA-256。ONNX Runtime 1.30.0 的 MIT 和完整 ThirdPartyNotices、React Three Fiber 9.8.1 的 MIT、GSAP 3.15.0 的官方 Standard License 頁面已離線保留；重建不必再次上網取這些通知。升級相依套件時需要同步核對通知來源，不能沿用舊版本的通知。

部分上游發布包或對應原始碼未提供授權全文。收集器將缺口與較後版本專案通知分成 `publisher-text-missing`、`project-notice-only`，不會把 publisher metadata 計為授權全文。具體項目及公開發行前尚需核對的範圍見 `NOTICE-GAPS.md`；每次建置產生的 `resources/licenses/notice-coverage.json` 是本次依賴圖的實際統計。這些檢查不阻止本機預覽建置，也不表示所有公開發行通知已完整。

正式建置先產生最終 renderer 與 worker provenance，再收集通知；afterPack 會比對 ASAR 內的 149 個 chunk 及原始 main process，確認停用的 updater／lazy-val、Sonic vendor／preset 沒有交付。四個複製 browser vendor 另核對實際 byte 與完整通知，包括 OpenCC 字典資料 Apache 2.0。結果保存於 `resources/licenses/shipping-scope.json`。依賴聯集缺口與實際交付缺口分開呈現，不能用 lockfile、import 搜尋或 package metadata 冒充 tree-shaking 證據。

本機交付修訂 license.1：cache-content-type 鎖定官方 2.1.0，koa-compose 根依賴鎖定有完整 LICENSE 的官方固定提交；overrides 沿用該根依賴。兩份官方 archive 與逐 byte 證據亦離線保留於 dev/integration/vendor/。請勿重新打包後覆寫鎖定 archive。重建 npm ci 後可跑 node dev/integration/release/test-license-cache.cjs、node dev/integration/release/test-license-compose.cjs --require-installed。整合版入口相容層提供 Koa 2 所需 callable export；直接用未加該入口的上游 Folia 開發命令不屬於本交付流程。

安裝包／来源 ZIP 檔名附 -license.1，應用程式版本仍是 integration.4，package metadata 另記 foliaDeliveryRevision。beforePack、afterPack 正向核對官方套件 bytes 与完整版 MIT，拒絕退役版本；完整原始碼包含相容層、guards、測試和精確鎖檔。

完整來源可乾淨重新安裝與建置；不同 Git／分支／倉庫及版本標籤環境可能改變內嵌建置資料和 chunk 雜湊，沒有宣稱逐 bit 重現安裝包。electron-builder 會移除相依套件 package.json 的 scripts／keywords 並重排 JSON；guard 只允許這兩項移除與排版，保留其他欄位及程式、完整授權原文。前後 package metadata SHA 隨 shipping-scope 保存。
