請使用幫我建立一個短網址的解決方案，這個解決方案將會是一個幫助使用者提供短網址服務的網站。
一般使用者可以透過短網址快速來到目標網址，並且可以透過短網址來追蹤點擊次數與來源。
管理者可以透過後台管理短網址的使用情況，並且可以封存不需要的短網址。

網站的功能需求如下：
- 一般使用者可以透過短網址快速來到目標網址。
- 若找不到對應內容，則自動導向到預設網址。
  - 預設網址設定在後端 API 的設定檔中(例如 appsettings.json)。
- 一般使用者使用短網址時，系統會自動將短網址轉換為小寫來比對；讓一般使用者還是可以方便地使用看到有大小寫的短網址，但是系統只會比對轉換為小寫的短網址。

- 管理者可以透過後台管理短網址的使用情況，並且可以封存不需要的短網址。
  - 管理者可以新增、修改、封存短網址，每個短網址至少要有目標網址、短網址。
    - 有可選資訊: Title，用來顯示在社群網站分享時的標題。
    - 有可選資訊: Description，用來顯示在社群網站分享時的描述。
    - 有可選資訊: ImageUrl，用來顯示在社群網站分享時的圖片。
    - 有可選資訊: Expiration，用來設定短網址的有效期限。
    - 短網址必須是唯一的，管理者可輸入自訂的短網址，若已存在則提示錯誤。
    - 短網址可以自動產生，並且可以設定短網址的有效期限，預設是永久。
    - 短網址可以是英文大小寫、數字。

系統的網站架構與設計應該要有:
- 將網站分為前端與後端 API
  - 轉址服務使用 Azure Function 來實現，為一個獨立的 Azure Function。
  - 前端使用 Vue 3.x 的 SPA，並使用 Vue Router 來管理路由。
  - 後端使用 Azure Function，並使用 Azure Table Storage 來儲存與管理資料。

- Azure Function 使用 Flex Consumption Plan。
- 除了轉址服務，前端與後端都要實作使用者登入來保護。
  - 使用 Azure Entra ID 來實作使用者登入。
  - 前段與後端溝通透過 JWT 來驗證使用者身份。
- 機密資訊
  - 前端使用 .env 檔案來儲存機密資訊。
  - 後端使用 local.settings.json 來儲存機密資訊。
- 解決方案將會佈署在 Azure 上。
  - 前端使用 Azure Static Web Apps 來佈署。
    - 將會使用 GitHub Actions 來自動化部署。
    - 將會綁定自定義網域。
  - 後端使用 Azure Function App 來佈署。
    - 將會綁定自定義網域。
  - 轉址服務使用 Azure Function App 來佈署。
    - 將會綁定自定義網域。
- 產生 Azure Bicep 文件來部署 Azure 資源。
  - 包含 Azure Function App、Azure Static Web Apps、Azure Table Storage 等資源。
  - 考慮如何可以節省成本。
- 提供 README.md 檔案。
  - README.md 檔案應該包含如何啟動前端與後端的詳細步驟，以及如何配置 Azure Table Storage 的連接字串。
  - README.md 檔案應該包含常見 README.md 的內容。
- 程式碼必須包含適當的註解。
  - 所有的 Class 與 Method 一定要有註解
  - 所有的變數與參數一定要有註解
  - 適當地為所有程式碼加入註解
  - 所有的註解請使用英文
- 先不要撰寫任何測試，後面會再補充。
- 使用 Bootstrap 5 來設計網站。
  - 使用 fontawesome 來設計網站。
  - 網站可以盡可能的繽紛色彩
  - 適時的使用表情符號來增添網站的趣味性

其餘要求如下:
- 將 C# 後端 API 專案與前端完全分開，前端使用 Vue Cli 來建立
  - C# 後端 API 方案要分為至少兩個專案: AkaMoney.Functions, AkaMoney.Services
- API 使用 OpenAPI format
  - API 使用 Swagger UI 來顯示 API 文件
- 說明前後端將要使用的套件以及對應版本
- 方案的主要名稱為 AkaMoney。
