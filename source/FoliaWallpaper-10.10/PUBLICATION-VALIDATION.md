# wallpaper.10.10 發布驗證

驗證日期：2026-10-15（Asia/Taipei）。

- 保留 3507 個凍結來源檔，逐檔大小與 SHA-256 全部一致；桌布專屬 publication wrapper 另列於本資料夾。
- 在新的含空格路徑中執行乾淨 npm ci，再依 PUBLICATION.md 重建，成功產生桌布、Windows 滾輪工具及 290 份相依套件的便攜服務。
- 重新建置的 renderer SHA-256 為 ea1fd64ce8ffe815781502e4de5aa5288e70601e41ca039096b0759bc21627a0，service 為 771b5598aca59d4823e8eb7d4743ead00a17efd94bb76b4f7ad8cba0b21e7f49，與公開交付程式完全相同。其他產物未宣稱可逐 bit 重現。
- 使用工具隨附 Node v24.21.0 在隔離的本機連接埠實際啟動服務；身分、每台電腦獨立配對、健康檢查及停止成功。公開包的 Chrome token 仍為空白，本機音訊分析、Gemini 音訊上傳及滾輪轉接皆停用。
- 掃描未發現私人執行資料或使用者 API 金鑰。第三方程式註解中的公用 YouTube key 與未修改來源文件中的歷史本機路徑範例保留，不是使用者憑證。
- 服務相依的 288/290 份保留完整通知；gzip 與 https 兩份只有空程式或 metadata，其歷史缺口明列。含實作程式的通知缺口為 0；授權資料保留實際範圍與限制。

第一次乾淨重建發現舊腳本依賴無法載入的 PowerShell Archive 模組，已在 publication wrapper 改用 Node ZIP 讀取與固定雜湊下載後重測通過；原 3507 個凍結來源檔未修改。

此輪驗證重點是來源重建與配套工具交付，不是重新執行完整長時間播放、所有歌詞來源或所有多螢幕測試；未呼叫付費 AI、未擷取音訊。歷史原始碼文件中的「未發布」是當時建置快照，公開狀態以 GitHub Release 與 Steam 工坊頁為準。下載 ZIP 另提供逐 entry 檔案校驗及 SHA256SUMS.txt。
