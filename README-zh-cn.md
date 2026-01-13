# AkaMoney - 短链接服务

一个现代化的短链接服务，基于 Vue 3、TypeScript 和 Cloudflare Workers 构建。

English | [繁體中文](README.zh-TW.md) | 简体中文

## 功能特性

- 🔗 支持自定义短链接代码的 URL ��短
- 📊 点击统计与分析
- 🧹 自动清理旧点击记录（保留365天）
- 🔐 接口 JWT 身份认证
- 👤 Entra ID 集成管理后台
- 💾 D1 数据库存储
- 📦 R2 对象存储文件管理
- 🎨 Bootstrap 5 响应式设计
- ⚡ Cloudflare Workers 极速跳转

## 架构设计

AkaMoney 采用**服务分离架构**以提升安全性��可扩展性：

| 服务 | 作用 | 认证 | 域名示例 |
|------|------|------|----------|
| **跳转服务** (`akamoney-redirect`) | 公共短链接跳转 | ❌ 无需认证 | `go.aka.money` |
| **管理 API** (`akamoney-admin-api`) | 链接管理与统计 | ✅ 需要JWT | `api.aka.money` |
| **前端页面** | 管理后台 | ✅ Entra ID | `admin.aka.money` |

### 分离服务优势

- **安全**：管理API通过JWT保护，跳转服务开放
- **扩展**：可单独扩展各服务
- **可靠**：API或后台故障不影响跳转
- **性能**：跳转服务专为高性能优化

## 技术栈

### 前端
- Vue 3
- Vite
- TypeScript
- Bootstrap 5

### 后端
- Cloudflare Workers
- D1 数据库
- R2 对象存储
- JWT 身份认证

### 必备条件
- Node.js 24.x（LTS）
- 已开通 Cloudflare Workers 和 Pages 服务的账户

## 项目结构

```
.
├── src/
│   ├── frontend/      # Vue 3 管理后台
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── views/
│   │   │   ├── router/
│   │   │   ├── stores/
│   │   │   └── services/
│   │   └── package.json
│   ├── backend/       # 管理 API（Cloudflare Workers，JWT保护）
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── types/
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── redirect/      # 跳转服务（Cloudflare Workers，公开访问）
│   │   ├── src/
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── shared/        # 公用类型及工具
│       └── types/
└── docs/              # 文档
    ├── API.md
    ├── SETUP.md
    └── SCREENSHOTS.md
```

## 入门指南

### 环境准备

1. 安装 Node.js 24.x
2. 注册 Cloudflare 账户
3. 安装 Wrangler CLI：`npm install -g wrangler`
4. 登录 Cloudflare：`wrangler login`

### 安装步骤

1. 克隆仓库：
```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
```

2. 安装依赖：
```bash
npm run setup
```

3. 配置环境变量：
```bash
cp src/frontend/.env.example src/frontend/.env
cp src/backend/.env.example src/backend/.env
```

4. 用你的 Cloudflare 账号信息更新配置文件

### 开发模式

同时启动前端和后端开发环境：
```bash
npm run dev
```
或分别启动：
```bash
# 前端（http://localhost:5173）
npm run dev:frontend

# 管理 API（http://localhost:8787）
npm run dev:backend

# 跳转服务（http://localhost:8788）
npm run dev:redirect
```

### 构建项目

构建所有服务：
```bash
npm run build
```

### 部署项目

部署所有服务到 Cloudflare：
```bash
npm run deploy
```

## 配置说明

### 前端配置

编辑 `src/frontend/.env`：
```env
VITE_API_URL=https://your-admin-api.workers.dev
VITE_ENTRA_ID_CLIENT_ID=your-client-id
VITE_ENTRA_ID_TENANT_ID=your-tenant-id
```

### 管理API配置

本地开发请复制模板并填写信息：
```bash
cp src/backend/wrangler.local.toml.example src/backend/wrangler.local.toml
```

编辑 `src/backend/wrangler.local.toml` 并填入你的 D1 数据库ID：
```toml
name = "akamoney-admin-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "your-database-id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "akamoney-storage"
```

运行后台API本地开发：
```bash
cd src/backend && wrangler dev --config wrangler.local.toml
```

### 跳转服务配置

本地开发请复制模板文件：
```bash
cp src/redirect/wrangler.local.toml.example src/redirect/wrangler.local.toml
```

编辑 `src/redirect/wrangler.local.toml` 并填入你的 D1 数据库ID：
```toml
name = "akamoney-redirect"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "your-database-id"
```

> **注意**：`wrangler.local.toml` 文件被 git 忽略，以防止凭据泄漏。CI/CD部署时敏感信息会从 GitHub Secrets 注入。

## API 接口说明

### 跳转服务（公开接口，无需认证）

基础URL: `https://go.aka.money` （或你的短链 worker 地址）

| 接口路径 | 说明 |
|----------|------|
| `GET /health` | 健康检查 |
| `GET /:shortCode` | 短链跳转原网址 |

### 管理API（需JWT认证）

基础URL: `https://api.aka.money` （或你的后台API worker 地址）

| 接口路径 | 认证 | 说明 |
|----------|------|------|
| `GET /health` | ❌ | 健康检查 |
| `POST /api/shorten` | 可选 | 创建短链接 |
| `GET /api/urls` | ✅ JWT | 获取所有短链接 |
| `GET /api/urls/:id` | ✅ JWT | 获取指定短链接详情 |
| `PUT /api/urls/:id` | ✅ JWT | 更新短链接 |
| `DELETE /api/urls/:id` | ✅ JWT | 删除短链接 |
| `GET /api/analytics/:shortCode` | ✅ JWT | 获取分析数据 |
| `GET /api/public/analytics/:shortCode` | ❌ | 获取公开（有限）分析数据 |
| `POST /api/admin/cleanup` | ✅ JWT | 手动清理点击记录 |

### 认证
- `POST /api/auth/login` - 获取 JWT Token

### 自动清理数据

系统会自动清理历史点击记录，保障数据库高效运行：

- **时间表**：每天 UTC 02:00（台湾时间上午10:00）
- **保留时长**：365天（历史数据保留一年）
- **方式**：Cloudflare 计划任务（Cron）
- **数据库影响**：保证数据量保持在 D1 免费额度范围

如需手动测试清理:

```bash
curl -X POST "https://your-api.workers.dev/api/admin/cleanup" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
可指定自定义保留天数:

```bash
curl -X POST "https://your-api.workers.dev/api/admin/cleanup?days=180" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**本地测试:**
```bash
# 方法一：手动请求清理接口
cd src/backend && wrangler dev
# 另一终端运行:
curl -X POST "http://localhost:8787/api/admin/cleanup" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 方法二：测试计划任务
# 注意：Cloudflare Workers 的计划任务仅在远程生产环境运行
# 本地测试建议使用手动接口或在测试环境部署
```

## 数据库结构

### urls 表
```sql
CREATE TABLE urls (
  id TEXT PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  is_active INTEGER DEFAULT 1
);
```

### 点击记录表
```sql
CREATE TABLE click_records (
  id TEXT PRIMARY KEY,
  url_id TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  FOREIGN KEY (url_id) REFERENCES urls(id)
);
```

## 功能规划

- [x] 基础短链服务

