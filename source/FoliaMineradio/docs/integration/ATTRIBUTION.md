# Folia Mineradio 版權與致謝

本整合版保留 Folia 播放、歌詞、時間軸及音樂來源架構，接入 Mineradio 視覺與操作模組；修改的檔案與建置腳本包含在對應原始碼中。此為獨立修改版，並非原作者的官方產品。

| 專案 | 作者／來源 | 授權 |
| --- | --- | --- |
| Folia | chthollyphile 及貢獻者；https://github.com/chthollyphile/folia-major | AGPL-3.0；完整條文見 `Folia-AGPL-3.0.txt` |
| Mineradio | XxHuberrr 及貢獻者；https://github.com/XxHuberrr/Mineradio-paused | GPL-3.0；完整條文見 `Mineradio-GPL-3.0.txt` |
| GSAP 3.15.0 | GreenSock；https://github.com/greensock/GSAP | [Standard No-Charge License](https://gsap.com/standard-license/)；官方授權頁及原版版權頭註均保留，並非 MIT |
| ONNX Runtime 1.30.0 | Microsoft 及貢獻者；https://github.com/microsoft/onnxruntime/tree/v1.30.0 | MIT；精確版本的 LICENSE 及完整 ThirdPartyNotices 離線保留 |
| React Three Fiber 9.8.1 | Poimandres 及貢獻者；https://github.com/pmndrs/react-three-fiber | MIT；npm 發布版本對應 git commit 的 LICENSE 離線保留 |

Mineradio 的粒子視覺、電影鏡頭與原創產品表達歸原作者，emily 的共創及其他參與者依原 `Mineradio-NOTICE.md` 致謝。Three.js r128 與既有視覺相容層的通知保留在 `dev/wallpaper/mineradio/`。已取得的第三方套件原始授權另行保留於安裝包 `resources/licenses/dependencies/`；未取得完整原版通知的項目列於 `NOTICE-GAPS.md`，不可將發布者 metadata 當成授權全文。

六個字體檔使用 SIL OFL 1.1，五個字體家族的未修改 OFL 和來源／校驗清單隨視覺資源保留。第三方授權補件的官方 URL、版本與 SHA-256 位於 `third-party-notices/NOTICE-SOURCES.json`，安裝包另附 `resources/licenses/official-notice-sources.json`。其餘套件名稱、版本及實際找到的通知位於 `dependency-manifest.json`；這是建置和執行相依的聯集，不表示所有列出的套件均在播放器執行時啟用。

Mineradio 原始碼保留的是本整合版使用的視覺 `public/` 子系統、LICENSE 與 NOTICE，包括原粒子、鏡頭、控制台和歌單架；它不是 Mineradio 原獨立伺服器或帳號後端的完整發行版。這些功能由 Folia 共用核心接管，沒有交付另一個 Mineradio 音源或登入後端。

Folia README 另含非營利學習／測試用途說明，本文件保留此現況，不將其解讀成額外的商業授權。發布整合版本時應同時提供完整對應原始碼，保留所有上游授權、版權、修改說明與第三方通知。安裝包與原始碼的 SHA-256 應一起列於交付清單。

Sonic Topography、Sonic Workshop 的 preset 與 vendor 同時排除於播放器、桌布輸出和修改版原始碼，不列為已交付功能。原版獨立倉庫保留，不由本建置修改。複製 vendor 的完整通知及雜湊記於 `resources/licenses/shipping-scope.json`；OpenCC-js 字典資料的 Apache 2.0 全文與 THIRD_PARTY_LICENSES 一併保留。音樂平台的帳號、會員與內容權利不包含在程式碼授權中。

license.1 的官方後端替代與完整 MIT：cache-content-type（dead_horse／node-modules 貢獻者）2.1.0；koa-compose（koajs 貢獻者）固定提交 903480c。完整 LICENSE 保持原文，來源、SHA 與相容層說明另見 resources/licenses/backend-replacements.json 和 backend-vendor-provenance/。
