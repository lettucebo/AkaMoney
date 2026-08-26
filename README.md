English | [繁體中文](README.zh-TW.md)

# AkaMoney - URL Shortening Service

A modern URL shortening service built with Vue 3, TypeScript, and Cloudflare Workers.

## Features

- 🔗 URL Shortening with custom short codes
- 📊 Analytics and click tracking
- 🧹 Automatic cleanup of old click records (365-day retention)
- 🔐 Microsoft Entra ID authentication for management dashboard
- 👤 Entra ID integration with automatic user provisioning
- 💾 D1 Database for data storage
- 📦 R2 Storage for file management
- 🎨 Tailwind CSS v4 responsive design with dark/light theme
- ⚡ Fast redirects with Cloudflare Workers

## Architecture

AkaMoney uses a **separated services architecture** for better security and scalability:

| Service | Purpose | Authentication | Domain Example |
|---------|---------|----------------|----------------|
| **Redirect Service** (`akamoney-redirect`) | Public URL redirection | ❌ None required | `go.aka.money` |
| **Admin API** (`akamoney-admin-api`) | URL management, analytics | ✅ Microsoft Entra access token required | `api.aka.money` |
| **Frontend** | Management dashboard | ✅ Entra ID | `admin.aka.money` |

### Service Separation Benefits

- **Security**: Admin API verifies Microsoft Entra access tokens; redirect service is public
- **Scalability**: Services can be scaled independently
- **Reliability**: Issues in admin API don't affect redirects
- **Performance**: Redirect service is optimized for speed

## Tech Stack

### Frontend
- Vue 3
- Vite
- TypeScript
- Tailwind CSS v4
- Chart.js

### Backend
- Cloudflare Workers
- D1 Database
- R2 Storage
- Microsoft Entra ID authentication

### Requirements
- Node.js 24.x (LTS)
- Cloudflare account with Workers and Pages enabled

## Project Structure

```
.
├── src/
│   ├── frontend/          # Vue 3 application (management dashboard)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── views/
│   │   │   ├── router/
│   │   │   ├── stores/
│   │   │   └── services/
│   │   └── package.json
│   ├── backend/           # Admin API (Cloudflare Workers) - Entra protected
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── types/
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── redirect/          # Redirect Service (Cloudflare Workers) - public access
│   │   ├── src/
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── shared/            # Unwired type declarations (not imported by services)
│       └── types/
└── docs/                  # Complete bilingual documentation; see docs/README.md
```

## Getting Started

### Prerequisites

1. Install Node.js 24.x
2. Create a Cloudflare account
3. Install Wrangler CLI: `npm install -g wrangler`
4. Login to Cloudflare: `wrangler login`

### Installation

1. Clone the repository:
```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
```

2. Install dependencies:
```bash
npm run setup
```

3. Configure environment variables:
```bash
cp src/frontend/.env.example src/frontend/.env
```

4. Update configuration files with your Cloudflare credentials

### Development

Run the three services in separate terminals. This is the reliable workflow on Windows and also avoids port collisions:
```bash
# Frontend (http://localhost:5173)
npm run dev:frontend

# Admin API (http://localhost:8787)
cd src/backend
npx wrangler dev --config wrangler.local.toml --port 8787

# Redirect Service (http://localhost:8788)
cd src/redirect
npx wrangler dev --config wrangler.local.toml --port 8788
```

See the [setup guide](docs/SETUP.md) for the complete local configuration and health checks.

### Building

Build all services:
```bash
npm run build
```

### Deployment

Deploy all services to Cloudflare:
```bash
npm run deploy
```

## Configuration

### Frontend Configuration

Edit `src/frontend/.env`:
```env
VITE_API_URL=https://your-admin-api.workers.dev
VITE_ENTRA_ID_CLIENT_ID=your-client-id
VITE_ENTRA_ID_TENANT_ID=your-tenant-id
```

### Admin API Configuration

For local development, copy the template and fill in your values:
```bash
cp src/backend/wrangler.local.toml.example src/backend/wrangler.local.toml
```

Edit `src/backend/wrangler.local.toml` with your D1 database ID:
```toml
name = "akamoney-api"
main = "src/index.ts"
compatibility_date = "2024-12-17"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "your-database-id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "akamoney-storage"
```

Run the admin API in local development with:
```bash
cd src/backend && wrangler dev --config wrangler.local.toml
```

### Redirect Service Configuration

For local development:
```bash
cp src/redirect/wrangler.local.toml.example src/redirect/wrangler.local.toml
```

Edit `src/redirect/wrangler.local.toml` with your D1 database ID:
```toml
name = "akamoney-redirect"
main = "src/index.ts"
compatibility_date = "2024-12-17"
node_compat = true

[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "your-database-id"
```

> **Note**: Both `wrangler.local.toml` files are ignored by git to prevent credential leaks. For CI/CD deployment, sensitive values like `database_id` are injected from GitHub Secrets.

## API Endpoints

### Redirect Service (Public - No Authentication)

Base URL: `https://go.aka.money` (or your redirect worker URL)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /:shortCode` | Redirect to original URL |

### Admin API (Microsoft Entra Access Token Required)

Base URL: `https://api.aka.money` (or your admin API worker URL)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | ❌ | Health check |
| `POST /api/shorten` | Optional | Create short URL |
| `GET /api/urls` | ✅ Entra | List all URLs |
| `GET /api/urls/:id` | ✅ Entra | Get URL details |
| `PUT /api/urls/:id` | ✅ Entra | Update URL |
| `DELETE /api/urls/:id` | ✅ Entra | Delete URL |
| `GET /api/analytics/:shortCode` | ✅ Entra | Get analytics |
| `GET /api/public/analytics/:shortCode` | ❌ | Get public analytics (limited) |
| `GET /api/stats/overall` | ✅ Entra | Get overall dashboard statistics |
| `POST /api/storage/upload` | ✅ Entra | Upload an image |
| `GET /api/storage/config` | ✅ Entra | Get the active storage configuration |
| `GET /api/storage/files` | ✅ Entra | List uploaded files |
| `GET /api/storage/files/:key` | ✅ Entra | Get uploaded-file metadata |
| `DELETE /api/storage/files/:key` | ✅ Entra | Delete an uploaded file |
| `POST /api/admin/cleanup` | ✅ Entra | Manually trigger cleanup of old click records |

### Authentication

The frontend obtains a Microsoft Entra access token through MSAL and sends it as
a bearer token. See the [authentication guide](docs/AUTHENTICATION.md).

### Automatic Data Cleanup

The system automatically cleans up old click records to maintain database efficiency:

- **Schedule**: Daily at 02:00 UTC (10:00 Taiwan time)
- **Retention**: 365 days (1 year of historical data)
- **Method**: Cloudflare Cron Triggers
- **Database Impact**: Maintains stable database size within D1 free tier limits

To manually trigger cleanup for testing:

Replace `TOKEN_VALUE` in the examples with a Microsoft Entra access token.

```bash
curl -X POST "https://your-api.workers.dev/api/admin/cleanup" \
  -H "Authorization: Bearer TOKEN_VALUE"
```

You can specify a custom retention period (in days):

```bash
curl -X POST "https://your-api.workers.dev/api/admin/cleanup?days=180" \
  -H "Authorization: Bearer TOKEN_VALUE"
```

**Testing locally:**

```bash
cd src/backend && npx wrangler dev --config wrangler.local.toml --port 8787
# In another terminal:
curl -X POST "http://localhost:8787/api/admin/cleanup" \
  -H "Authorization: Bearer TOKEN_VALUE"
```

## Database Schema

The schema evolves through D1 migrations. See the [database guide](docs/DATABASE.md) for the current tables, columns, indexes, migration order, and local/remote commands.

## Features Roadmap

- [x] Basic URL shortening
- [x] Microsoft Entra ID authentication
- [x] Management Dashboard
- [x] Click Analytics
- [ ] Custom domains
- [ ] QR Code generation
- [x] Link expiration
- [ ] Password protected links
- [ ] Bulk URL import
- [ ] API rate limiting

## Historical Screenshots

The images below show the pre-Proposal-F interface and are retained as historical references, not as proof of the current runtime UI. See the [current UI walkthrough](docs/SCREENSHOTS.md) for the Monē design and an explanation of design-reference versus runtime captures.

### Home Page - URL Shortening Interface
![Home Page](https://github.com/user-attachments/assets/fb6c649e-b8f3-4cb4-9817-a49de28f8cd5)
*Clean and simple interface for creating short URLs with optional custom codes*

### Login Page - Microsoft Entra ID Integration
![Login Page](https://github.com/user-attachments/assets/b9768508-a03f-4cb6-b220-10376fe3e18d)
*Secure authentication using Microsoft Entra ID (Azure AD)*

### Home Page - Creating Short URL
![Creating URL](https://github.com/user-attachments/assets/4c28b480-dd1a-4812-9aab-b26091826840)
*Form validation and user-friendly input for URL shortening*

### Dashboard - URL Management
![Dashboard](https://github.com/user-attachments/assets/7904a993-13d8-4709-b099-3d245058b4a8)
*Manage all your shortened URLs with click statistics and quick actions*

### Analytics Dashboard - Comprehensive Statistics
![Analytics](https://github.com/user-attachments/assets/a314ccfd-8b6a-44dc-8eaa-014df795327c)
*Detailed analytics including geographic distribution, device types, browsers, and click history*

## Documentation

Full documentation is available in [English](docs/README.md) and [繁體中文](docs/README.zh-TW.md). Quick links:

- [Documentation Index (English)](docs/README.md) | [文件目錄（繁體中文）](docs/README.zh-TW.md)
- [Setup Guide (English)](docs/SETUP.md) | [設定指南（繁體中文）](docs/SETUP.zh-TW.md)
- [API Documentation (English)](docs/API.md) | [API 文件（繁體中文）](docs/API.zh-TW.md)
- [Configuration Reference (English)](docs/CONFIGURATION.md) | [配置參考（繁體中文）](docs/CONFIGURATION.zh-TW.md)
- [Contributing Guide](CONTRIBUTING.md) (English)
- [Changelog (English)](CHANGELOG.md) | [更新日誌（繁體中文）](CHANGELOG.zh-TW.md)
- [Screenshots & UI Guide (English)](docs/SCREENSHOTS.md) | [截圖與介面指南（繁體中文）](docs/SCREENSHOTS.zh-TW.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

For detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues or questions:
- Check the [Setup Guide](docs/SETUP.md)
- Read the [API Documentation](docs/API.md)
- Open an issue on GitHub
- Review the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)

## Acknowledgements

Thanks to the following projects and resources:

- [Vue 3](https://vuejs.org/) - Progressive JavaScript framework
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless platform
- [Hono](https://hono.dev/) - Lightweight web framework
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript

## Author

Built with ❤️ by [@lettucebo](https://github.com/lettucebo)
