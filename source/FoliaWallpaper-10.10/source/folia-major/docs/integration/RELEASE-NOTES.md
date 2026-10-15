# 本機交付紀錄與原始碼修正

整合版使用獨立名稱與資料目錄，未自動發布到 GitHub 或 Steam Workshop。功能與穩定性驗證以同版本的 `VALIDATION.md` 為準；本文件只記錄交付流程的修正。

2026-10-13 的交付審查發現，`0.7.17-integration.1` 及 `0.7.17-integration.2` 原始碼 ZIP 雖然整包 SHA-256 正確，兩個 `JetBrainsMono.ttf` entry 無法正確解壓，並且缺少 Vite 建置實際匯入的根 `assets/` 圖片。這兩份舊 ZIP 不能作為完整、可重建的原始碼交付。此項是原始碼封裝缺陷，不代表已安裝播放器的同名字體資源損壞。

後續 source archive 流程改採 ZIP store，不使用這次重現出問題的串流 deflate，保留必要素材、安全 npm 設定、Node 版本設定、文件及視覺模組；在落成正式檔名前逐 entry 比對大小及 SHA-256。請使用交付清單指定的新版原始碼包，勿混用不同版本的安裝包、原始碼和驗證紀錄。

後續安裝包附完整 `resources/docs/`。補上的授權文件包括 ONNX Runtime 1.30.0 的 MIT 和完整 ThirdPartyNotices、React Three Fiber 9.8.1 的 MIT，以及 GSAP 3.15.0 所引用的官方 Standard License 頁面。原始通知保持原文，來源、版本和校驗碼隨包保存。

2026-10-14 保留原 26 項通知問題歷史，核對最終 ASAR、renderer／worker provenance 與複製 vendor：20 項相應版本程式碼未交付、2 項只有 metadata 或空實作、2 項取得可對應程式碼的官方通知。實際交付仍有 `cache-content-type@1.0.1`、`koa-compose@3.2.1` 兩項原版本通知缺口；重建依賴聯集的 24 項缺口另外保留，見 `NOTICE-GAPS.md`。

同版本修正版修正網易雲收藏／歌單寫入在 API 拒絕時仍可能顯示成功，以及 likes、liked-list、playlist-tracks 命中過期快取；錯誤經原 Omni 邊界回報。原版動畫面板補上臺灣常用文字，保留字體與色盤專有名稱。未支援的 Sonic vendor 不再跟隨複製，上游更新器在載入前停用，OpenCC 字典資料的通知補齊。

2026-10-14 license.1 交付修訂：用官方 cache-content-type 2.1.0 加入口相容層、官方已附 MIT 的 koa-compose 固定提交替換兩個通知缺全文的實作。保留舊審查與測試，不把舊 ASAR 的一小時長測改稱新包長測。功能限制與視覺程式保持既有範圍；安裝包仍未簽章，沒有發布。
