# AkaMoney - URL Shortening Service

A modern URL shortening service built with Vue 3, TypeScript, and Cloudflare Workers.

English | [繁體中文](README.zh-TW.md)

## Features

- 🔗 URL Shortening with custom short codes
- 📊 Analytics and click tracking
- 🔐 JWT Authentication for API
- 👤 Entra ID integration for management dashboard
- 💾 D1 Database for data storage
- 📦 R2 Storage for file management
- 🎨 Bootstrap 5 responsive design
- ⚡ Fast redirects with Cloudflare Workers

## Tech Stack

### Frontend
- Vue 3
- Vite
- TypeScript
- Bootstrap 5

### Backend
- Cloudflare Workers
- D1 Database
- R2 Storage
- JWT Authentication

### Requirements
- Node.js 24.x (LTS)
- Cloudflare account with Workers and Pages enabled

## Project Structure

```
.
├── src/
│   ├── frontend/          # Vue 3 application
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── views/
│   │   │   ├── router/
│   │   │   ├── stores/
│   │   │   └── services/
│   │   └── package.json
│   ├── backend/           # Cloudflare Workers
│   │   ├── src/
│   │   │   ├── handlers/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── types/
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── shared/            # Shared types and utilities
│       └── types/
└── docs/              # Documentation
    ├── API.md
    ├── SETUP.md
    └── SCREENSHOTS.md
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
cp src/backend/.env.example src/backend/.env
```

4. Update configuration files with your Cloudflare credentials

### Development

Start both frontend and backend in development mode:
```bash
npm run dev
```

Or start them separately:
```bash
# Frontend (http://localhost:5173)
npm run dev:frontend

# Backend (http://localhost:8787)
npm run dev:backend
```

### Building

Build both frontend and backend:
```bash
npm run build
```

### Deployment

Deploy to Cloudflare:
```bash
npm run deploy
```

## Configuration

### Frontend Configuration

Edit `src/frontend/.env`:
```env
VITE_API_URL=https://your-worker.workers.dev
VITE_ENTRA_ID_CLIENT_ID=your-client-id
VITE_ENTRA_ID_TENANT_ID=your-tenant-id
```

### Backend Configuration

Edit `src/backend/wrangler.toml`:
```toml
name = "akamoney-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "akamoney"
database_id = "your-database-id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "akamoney-storage"
```

## API Endpoints

### Public Endpoints
- `GET /:shortCode` - Redirect to original URL
- `POST /api/shorten` - Create short URL (with JWT)

### Protected Endpoints (JWT Required)
- `GET /api/urls` - List all URLs
- `GET /api/urls/:id` - Get URL details
- `PUT /api/urls/:id` - Update URL
- `DELETE /api/urls/:id` - Delete URL
- `GET /api/analytics/:shortCode` - Get analytics

### Authentication
- `POST /api/auth/login` - Get JWT token

## Database Schema

### URLs Table
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

### Click Records Table
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

## Features Roadmap

- [x] Basic URL shortening
- [x] JWT Authentication
- [x] Management Dashboard
- [x] Click Analytics
- [ ] Custom domains
- [ ] QR Code generation
- [ ] Link expiration
- [ ] Password protected links
- [ ] Bulk URL import
- [ ] API rate limiting

## Screenshots

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

Complete documentation is available in both English and Traditional Chinese:

- [Setup Guide (English)](docs/SETUP.md) | [設定指南（繁體中文）](docs/SETUP.zh-TW.md)
- [API Documentation (English)](docs/API.md) | [API 文件（繁體中文）](docs/API.zh-TW.md)
- [Contributing Guide (English)](CONTRIBUTING.md) | [貢獻指南（繁體中文）](CONTRIBUTING.zh-TW.md)
- [Changelog (English)](CHANGELOG.md) | [更新日誌（繁體中文）](CHANGELOG.zh-TW.md)
- [Screenshots & UI Guide (English)](docs/SCREENSHOTS.md) | [截圖與介面指南（繁體中文）](docs/SCREENSHOTS.zh-TW.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

For detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md) or [CONTRIBUTING.zh-TW.md](CONTRIBUTING.zh-TW.md).

## License

This project is licensed under the MIT License - see the LICENSE file for details.
