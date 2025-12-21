# AkaMoney Setup Guide

English | [繁體中文](SETUP.zh-TW.md)

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
cd src/backend
wrangler d1 create akamoney-clicks
```

This will output a database ID. Copy it and create your local configuration:
```bash
cp src/backend/wrangler.local.toml.example src/backend/wrangler.local.toml
```

Edit `src/backend/wrangler.local.toml` and set your database_id:
```toml
[[d1_databases]]
binding = "DB"
database_name = "akamoney-clicks"
database_id = "YOUR_DATABASE_ID_HERE"
```

> **Note**: The `wrangler.local.toml` file is ignored by git to prevent credential leaks. The main `wrangler.toml` is kept as a template with an empty `database_id` for CD deployment where secrets are injected automatically.

#### Run Database Migrations
```bash
# For local development
wrangler d1 migrations apply akamoney-clicks --local

# For production
wrangler d1 migrations apply akamoney-clicks --remote
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

## Storage Configuration

AkaMoney supports two storage providers:
- **Cloudflare R2** (default) - Ideal for Cloudflare Workers deployment
- **Azure Blob Storage** - For Azure-centric deployments

### Using Cloudflare R2 (Default)

R2 is the default storage provider. Ensure you have created the R2 bucket as shown above.

Configuration in `wrangler.toml`:
```toml
[vars]
STORAGE_PROVIDER = "r2"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "akamoney-storage"
```

### Using Azure Blob Storage

To use Azure Blob Storage instead of R2:

1. Create an Azure Storage Account in the Azure Portal
2. Create a container for your files
3. Get your storage account name and access key from Azure Portal > Storage Account > Access keys
4. Configure the environment variables:

```bash
# Set the storage provider to Azure via configuration (not as a secret):
# In wrangler.toml, under [vars], set:
# STORAGE_PROVIDER = "azure"
#
# Alternatively, you can set it as an environment variable before running wrangler:
# export STORAGE_PROVIDER=azure

# Set Azure Storage credentials
wrangler secret put AZURE_STORAGE_ACCOUNT_NAME
# Enter your storage account name

wrangler secret put AZURE_STORAGE_ACCOUNT_KEY
# Enter your storage account access key

wrangler secret put AZURE_STORAGE_CONTAINER_NAME
# Enter your container name

# Optional: Custom endpoint URL (for Azure Government, China, etc.)
# wrangler secret put AZURE_STORAGE_ENDPOINT_URL
```

Update `wrangler.toml`:
```toml
[vars]
STORAGE_PROVIDER = "azure"
```

> **Note**: When using Azure Storage, the R2 bucket binding in `wrangler.toml` is ignored but can remain in the configuration file.

### 3. Configure Environment Variables

#### Backend Environment
Create `src/backend/.env`:
```bash
cp src/backend/.env.example src/backend/.env
```

Edit `src/backend/.env` and fill in your values.

#### Frontend Environment
Create `src/frontend/.env`:
```bash
cp src/frontend/.env.example src/frontend/.env
```

Edit `src/frontend/.env`:
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

> **Important**: For local development with D1 database, make sure you have created `wrangler.local.toml` with your database ID as described in the "Create D1 Database" section above.

#### Option 1: Run Both Frontend and Backend
```bash
npm run dev
```

This will start:
- Frontend at http://localhost:5173
- Backend at http://localhost:8787

#### Option 2: Run Separately
```bash
# Terminal 1 - Backend (using local config)
cd src/backend
wrangler dev --config wrangler.local.toml

# Terminal 2 - Frontend
cd src/frontend
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
4. Set build command: `cd src/frontend && npm install && npm run build`
5. Set build output directory: `src/frontend/dist`
6. Add environment variables from `src/frontend/.env.example`

### Update Frontend Configuration

After deploying the backend, update `src/frontend/.env` (or Cloudflare Pages environment variables):

```env
VITE_API_URL=https://akamoney-api.YOUR_SUBDOMAIN.workers.dev
VITE_SHORT_DOMAIN=https://akamoney-api.YOUR_SUBDOMAIN.workers.dev
```

Then redeploy the frontend.

## Entra ID Setup (Microsoft Entra ID / Azure AD Authentication)

To enable Microsoft authentication for the management dashboard, follow these detailed steps:

### Step 1: Access Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Sign in with your Microsoft account
3. Navigate to **Microsoft Entra ID** (formerly Azure Active Directory)

### Step 2: Register a New Application

1. In the left sidebar, click **App registrations**
2. Click **+ New registration** at the top
3. Fill in the registration form:
   - **Name**: `AkaMoney` (or your preferred name)
   - **Supported account types**: Choose based on your needs:
     - **Single tenant**: Only accounts in your organization
     - **Multitenant**: Accounts in any organizational directory
     - **Personal Microsoft accounts**: Include personal accounts (recommended for broader access)
   - **Redirect URI**: Select **Single-page application (SPA)** and enter:
     - For development: `http://localhost:5173`
     - Click **Add URI** to add production URL: `https://your-domain.pages.dev`
4. Click **Register**

### Step 3: Configure Authentication

1. After registration, go to **Authentication** in the left sidebar
2. Under **Platform configurations**, verify your redirect URIs are listed
3. Add additional redirect URIs if needed:
   - Click **Add URI** under Single-page application
   - Add your production domain(s)
4. Under **Implicit grant and hybrid flows**:
   - ✅ Check **ID tokens** (used for user sign-in)
5. Under **Allow public client flows**: Leave as **No**
6. Click **Save** at the top

### Step 4: Configure API Permissions

1. Click **API permissions** in the left sidebar
2. Default permissions should include:
   - **Microsoft Graph** > **User.Read** (Read user profile)
3. If not present, add it:
   - Click **+ Add a permission**
   - Select **Microsoft Graph**
   - Select **Delegated permissions**
   - Find and check **User.Read**
   - Click **Add permissions**
4. Optional: Click **Grant admin consent** if you have admin rights (this pre-approves permissions for all users)

### Step 5: Get Application IDs

1. Go to **Overview** in the left sidebar
2. Copy the following values (you'll need them for configuration):
   - **Application (client) ID**: This is your `VITE_ENTRA_ID_CLIENT_ID`
   - **Directory (tenant) ID**: This is your `VITE_ENTRA_ID_TENANT_ID`

### Step 6: Generate Client Secret (For Backend API - Optional)

> **Note**: Client secrets are only needed if you plan to use server-side authentication flow. For the current SPA implementation using MSAL, this is optional.

1. Click **Certificates & secrets** in the left sidebar
2. Click **+ New client secret**
3. Enter a description: `AkaMoney Backend Secret`
4. Choose an expiration period:
   - **180 days (6 months)** - More secure, requires regular rotation
   - **730 days (24 months)** - Less maintenance
   - **Custom** - Set your own expiration
5. Click **Add**
6. **Important**: Copy the **Value** immediately (it won't be shown again)
7. Store it securely - you'll need it for `ENTRA_ID_CLIENT_SECRET`

### Step 7: Configure Application Settings (Optional)

1. Go to **Branding & properties** in the left sidebar
2. Customize your application:
   - **Logo**: Upload your application logo (256x256 px PNG)
   - **Home page URL**: `https://your-domain.pages.dev`
   - **Terms of service URL**: Your terms of service page
   - **Privacy statement URL**: Your privacy policy page
3. Click **Save**

### Step 8: Update Environment Variables

#### Frontend Configuration (`src/frontend/.env`):
```env
VITE_ENTRA_ID_CLIENT_ID=<Your-Application-Client-ID>
VITE_ENTRA_ID_TENANT_ID=<Your-Directory-Tenant-ID>
VITE_ENTRA_ID_REDIRECT_URI=http://localhost:5173
```

#### Backend Configuration (Wrangler Secrets):
```bash
# If using client secret for backend authentication
wrangler secret put ENTRA_ID_CLIENT_SECRET
# When prompted, paste the secret value you copied earlier
```

#### Backend Configuration (`src/backend/.env`):
```env
ENTRA_ID_TENANT_ID=<Your-Directory-Tenant-ID>
ENTRA_ID_CLIENT_ID=<Your-Application-Client-ID>
```

### Step 9: Production Configuration

For production deployment:

1. Add your production domain to Redirect URIs:
   - Go to **Authentication** > **Platform configurations**
   - Under **Single-page application**, click **Add URI**
   - Add: `https://your-actual-domain.pages.dev` or `https://aka.money`
   - Click **Save**

2. Update Cloudflare Pages environment variables:
   - Go to Cloudflare Dashboard > Pages > Your Project > Settings > Environment variables
   - Add:
     - `VITE_ENTRA_ID_CLIENT_ID`: Your client ID
     - `VITE_ENTRA_ID_TENANT_ID`: Your tenant ID
     - `VITE_ENTRA_ID_REDIRECT_URI`: `https://your-actual-domain.pages.dev`

### Step 10: Test Authentication

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:5173/login`

3. Click "Sign in with Microsoft"

4. You should be redirected to Microsoft login page

5. After successful login, you should be redirected back to your dashboard

### Troubleshooting Entra ID

#### Error: "AADSTS50011: The reply URL specified in the request does not match"
- **Solution**: Verify redirect URI in Azure Portal matches exactly (including http/https and trailing slashes)

#### Error: "AADSTS700016: Application not found"
- **Solution**: Check that the client ID in your `.env` file matches the Application ID in Azure Portal

#### Error: "AADSTS65001: The user or administrator has not consented"
- **Solution**: Grant admin consent in Azure Portal under API permissions, or have users consent on first login

#### Error: "User canceled authentication"
- **Solution**: This is expected when users close the popup. Handle gracefully in your error handling

#### Popup Blocked
- **Solution**: Use redirect flow instead by calling `loginRedirect()` in `auth.service.ts`

### Multi-Tenant Considerations

If you selected multi-tenant during registration:

1. Users from any Azure AD organization can sign in
2. Personal Microsoft accounts can also sign in (if you selected that option)
3. Consider additional validation in your backend to restrict access to specific domains
4. Implement proper authorization checks based on user email domain or other attributes

### Security Best Practices

1. **Rotate secrets regularly**: Set up a reminder to rotate client secrets before expiration
2. **Use separate apps for dev/prod**: Create separate app registrations for development and production
3. **Monitor sign-ins**: Review sign-in logs in Azure Portal regularly
4. **Implement proper logout**: Ensure users can properly sign out and clear tokens
5. **Handle token expiration**: Implement token refresh logic for long-lived sessions

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
wrangler d1 info akamoney-clicks

# List existing migrations
wrangler d1 migrations list akamoney-clicks --local

# Execute SQL directly
wrangler d1 execute akamoney-clicks --local --command "SELECT * FROM urls LIMIT 10"
```

### CORS Issues

If you get CORS errors:
1. Check that `src/backend/src/middleware/cors.ts` includes your frontend URL
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
- Check the main [README.md](../README.md)
- Review Cloudflare Workers documentation
- Check Vue 3 and Vite documentation
