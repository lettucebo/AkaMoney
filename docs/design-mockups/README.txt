AkaMoney 設計提案比較中心

官方啟動方式（從 docs/design-mockups 目錄執行）：

  node validation/server.mjs --port 41739

然後開啟：

  http://127.0.0.1:41739/

伺服器根路徑會載入 index.html，並保留 /validation/fixtures/ 測試路由。
直接以 file:// 開啟時，相對的 screenshots/ 與 proposals/ 檔案仍可解析；
但瀏覽器可能限制 fetch 載入 manifest，因此完整的揭露、能力與遷移證據請使用上述 HTTP 方式。
