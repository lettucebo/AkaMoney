# Entify Framework Core 準則
## 1. 通用規範
- 使用對應 .NET SDK 版本的最新 Package
  - 例如: .NET 8 使用 EF Core 8.x.x
- 使用 Code First 開發模式
    - 使用 Fluent API 進行配置
    - 不要將驗證邏輯放在 Model 上，而是放在 Service 上
- 使用 Migration 進行資料庫遷移
- 使用 Dependency Injection 進行依賴注入
- 使用 Repository Pattern 進行資料存取
