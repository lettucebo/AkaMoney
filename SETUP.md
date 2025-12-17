# AkaMoney Setup Guide

This guide will help you set up and run the AkaMoney URL shortening service locally and deploy it to Cloudflare.

## Prerequisites

- Node.js 24.x (LTS)
- npm or yarn
- Cloudflare account (free tier is sufficient)
- Wrangler CLI (`npm install -g wrangler`)

## Initial Setup

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney

# Install dependencies for all projects
npm run setup
```

### 2. Configure Cloudflare

#### Login to Cloudflare
```bash
wrangler login
```

#### Create D1 Database
```bash
cd backend
wrangler d1 create akamoney
```

This will output a database ID. Copy it and update `backend/wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "akamoney"
database_id = "YOUR_DATABASE_ID_HERE"
```

#### Run Database Migrations
```bash
# For local development
wrangler d1 migrations apply akamoney --local

# For production
wrangler d1 migrations apply akamoney --remote
```

#### Create R2 Bucket
```bash
wrangler r2 bucket create akamoney-storage
wrangler r2 bucket create akamoney-storage-preview
```

#### Set Secrets
```bash
# Set JWT secret
wrangler secret put JWT_SECRET
# Enter a strong random string when prompted

# If using Entra ID, set these secrets:
wrangler secret put ENTRA_ID_CLIENT_SECRET
```

### 3. Configure Environment Variables

#### Backend Environment
Create `backend/.env`:
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in your values.

#### Frontend Environment
Create `frontend/.env`:
```bash
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:8787
VITE_ENTRA_ID_CLIENT_ID=your_client_id
VITE_ENTRA_ID_TENANT_ID=your_tenant_id
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
VITE_APP_NAME=AkaMoney
VITE_SHORT_DOMAIN=http://localhost:8787
```

## Development

### Running Locally

#### Option 1: Run Both Frontend and Backend
```bash
npm run dev
```

This will start:
- Frontend at http://localhost:5173
- Backend at http://localhost:8787

#### Option 2: Run Separately
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Testing the API

You can test the backend API using curl:

```bash
# Health check
curl http://localhost:8787/health

# Create a short URL (no auth required)
curl -X POST http://localhost:8787/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"original_url": "https://example.com"}'

# Test redirect
curl -L http://localhost:8787/YOUR_SHORT_CODE
```

## Deployment

### Deploy Backend to Cloudflare Workers

```bash
cd backend
npm run deploy
```

This will deploy your worker to Cloudflare. Note the URL (e.g., `https://akamoney-api.YOUR_SUBDOMAIN.workers.dev`).

### Deploy Frontend to Cloudflare Pages

```bash
cd frontend

# Build the frontend
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy dist
```

Or use the Cloudflare Dashboard:
1. Go to Pages in your Cloudflare dashboard
2. Create a new project
3. Connect your GitHub repository
4. Set build command: `cd frontend && npm install && npm run build`
5. Set build output directory: `frontend/dist`
6. Add environment variables from `frontend/.env.example`

### Update Frontend Configuration

After deploying the backend, update `frontend/.env` (or Cloudflare Pages environment variables):

```env
VITE_API_URL=https://akamoney-api.YOUR_SUBDOMAIN.workers.dev
VITE_SHORT_DOMAIN=https://akamoney-api.YOUR_SUBDOMAIN.workers.dev
```

Then redeploy the frontend.

## Entra ID Setup (Optional)

To enable Microsoft authentication:

1. Go to Azure Portal > App Registrations
2. Create a new registration
3. Add redirect URIs:
   - `http://localhost:5173` (development)
   - `https://your-domain.pages.dev` (production)
4. Generate a client secret
5. Note the Application (client) ID and Directory (tenant) ID
6. Update environment variables with these values

## Custom Domain Setup

### Backend (Workers)

1. In Cloudflare Dashboard, go to Workers & Pages
2. Select your worker
3. Go to Settings > Triggers
4. Add a custom domain (e.g., `api.aka.money`)

### Frontend (Pages)

1. In Cloudflare Dashboard, go to Pages
2. Select your project
3. Go to Custom domains
4. Add your domain (e.g., `aka.money`)

### DNS Configuration

Add the following DNS records in Cloudflare:
- `aka.money` → CNAME to your Pages deployment
- `api.aka.money` → CNAME to your Workers deployment

## Monitoring and Logs

### View Worker Logs
```bash
cd backend
wrangler tail
```

### View Analytics
- Go to Cloudflare Dashboard > Workers & Pages > Your Worker > Analytics
- View request metrics, errors, and performance data

## Troubleshooting

### Database Issues

If migrations fail:
```bash
# Check database status
wrangler d1 info akamoney

# List existing migrations
wrangler d1 migrations list akamoney --local

# Execute SQL directly
wrangler d1 execute akamoney --local --command "SELECT * FROM urls LIMIT 10"
```

### CORS Issues

If you get CORS errors:
1. Check that `backend/src/middleware/cors.ts` includes your frontend URL
2. Verify environment variables are set correctly
3. Clear browser cache

### JWT Issues

If authentication fails:
1. Verify JWT_SECRET is set: `wrangler secret list`
2. Check token expiration
3. Ensure Authorization header format: `Bearer <token>`

## Development Tips

1. **Use DevContainer**: Open in VS Code with DevContainer for consistent environment
2. **Hot Reload**: Both frontend and backend support hot reload during development
3. **Database Console**: Use `wrangler d1 execute` for quick database queries
4. **Logs**: Keep `wrangler tail` running in a separate terminal for backend logs

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use strong JWT secrets** (at least 32 characters)
3. **Enable HTTPS** in production
4. **Regularly update dependencies**
5. **Monitor error logs** for security issues
6. **Implement rate limiting** (add to middleware)

## Next Steps

- [ ] Add custom branding
- [ ] Implement QR code generation
- [ ] Add link expiration notifications
- [ ] Set up monitoring alerts
- [ ] Implement API rate limiting
- [ ] Add more analytics features

## Support

For issues or questions:
- Check the main [README.md](README.md)
- Review Cloudflare Workers documentation
- Check Vue 3 and Vite documentation
