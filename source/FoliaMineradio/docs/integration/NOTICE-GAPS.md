# 第三方通知保留範圍與歷史缺口

版本 0.7.17-integration.4，交付修訂 license.1，2026-10-14。原 26 項問題完整保留於 third-party-notices/NOTICE-HISTORY.json；metadata 不計為授權全文。

本修訂將兩項實際交付缺口的舊實作移除，採用附完整 MIT 的官方來源：

| 替代套件 | 來源與相容方式 |
| --- | --- |
| cache-content-type 2.1.0 | 官方 npm 精確發行，保留其完整 LICENSE 及原碼；electron/integration/backend-compat.cjs 在整合版入口將原 getType 函式提供給未修改的 Koa 2。沒有改寫套件程式或沿用缺全文的 1.0.1。 |
| koa-compose 4.2.0 固定提交 | koajs/compose 的 903480c36957776f8561a33a840cdd0a06ad611f，原 index.js、package.json、LICENSE 逐 byte 保存。這是固定 Git 提交，不能稱為 npm 4.2.0 的原發布包。 |

固定 URL、發行 archive／程式／全文 SHA-256 與變更紀錄在 dev/integration/vendor/REPLACEMENTS.json 及各 PROVENANCE.json。npm lock 鎖定官方 archive integrity。打包前後核對實際 consumer resolve、程式與完整授權的 bytes；套件 metadata 只允許 electron-builder 移除 scripts／keywords 與 JSON 排版，其餘欄位逐項相同，前後 SHA 另記。ASAR guard 拒絕舊 1.0.1／3.2.1／4.1.0，並正向檢查替代套件。

| 原 26 項在本修訂的分類 | 數量 |
| --- | ---: |
| 相應版本程式碼未交付（包括已替換的三個舊版本） | 23 |
| 只有 metadata 或空實作 | 2 |
| 保留可對應交付程式碼的官方完整通知（koa-static 5.0.0） | 1 |
| 實際交付程式碼仍缺完整通知 | 0 |

koa-static 5.0.0 的原發布包漏附全文，保留的官方同版本 LICENSE 對應 index.js 逐 byte 相同。先前 koa-compose 4.1.0 的 corresponding-work 比較及兩個缺口歷史繼續保留，但不代表它們仍在本修訂執行。退役版本的 metadata／較後專案通知移至 resources/licenses/historical-replaced-dependencies，不算目前 coverage。

建置、測試、型別與執行相依聯集仍有其他未取得原發布版本全文的歷史項目，統計以當次 resources/licenses/notice-coverage.json 為準。它們不能冒充播放器功能；本次程式交付範圍以 shipping-scope.json 的 ASAR、最終 renderer／worker provenance 和四份複製 vendor 為準。

Three.js r128 的 MIT、GSAP 3.15.0 的官方 Standard No-Charge License、music-tempo 原 LICENCE、OpenCC-js 1.4.2 的 MIT／THIRD_PARTY_LICENSES／字典資料 Apache 2.0 全文均保留。Sonic Topography／Sonic Workshop vendor 與 preset 不交付。字體 OFL、Electron／Chromium、FFmpeg 通知另隨資源保存。

此修訂完成目前本機版本的兩項已知實際交付通知缺口；仍為未簽章本機預覽版，未發布到 GitHub 或 Steam Workshop。公開發布時需提供同修訂完整原始碼及實際公開網址；本機檢查不等於對所有授權義務的法律保證。
