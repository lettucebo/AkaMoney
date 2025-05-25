# AkaMoney 🔗

AkaMoney is a high-performance short URL service, providing a user-friendly interface to create, manage and track short URLs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![AkaMoney Logo](docs/images/logo.png)

## ✨ Features

- 🚀 Quickly convert long URLs to short URLs
- 📊 Track click counts and sources
- 🔒 Secure management dashboard (requires Azure Entra ID login)
- 📅 Support for short URL expiration settings
- 🖼️ Support for social media sharing titles, descriptions, and images
- 🔍 Automatic management of short URL case sensitivity issues

## 🏗️ System Architecture

AkaMoney adopts a three-component architecture:

1. **Redirect Service** - An independent microservice based on Azure Functions, handling short URL redirect requests
2. **Management API** - A backend API based on Azure Functions, handling short URL management functions
3. **Management Frontend** - A Vue 3 single-page application serving as the management interface

![Architecture Diagram](docs/images/architecture.png)

## 🚀 Quick Start

### Environment Requirements

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js](https://nodejs.org/) (>= 16.x)
- [Vue CLI](https://cli.vuejs.org/)
- [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local)
- [Azure Subscription](https://azure.microsoft.com/free/)

### Local Development Setup

#### Method 1: Using the One-Click Startup Script (Recommended)

We provide a one-click startup script that can automatically start all necessary services:

1. Clone the repository
```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
```

2. Ensure the following necessary tools are installed:
   - Visual Studio Code and its Azurite extension
   - Node.js and NPM
   - Azure Functions Core Tools

3. Configure `local.settings.json` (in `src/AkaMoney.Functions` and `src/AkaMoney.Redirect`), as shown in Method 2 below

4. Run the startup script
```powershell
.\start-akamoney.ps1
```

5. The script will automatically check dependencies, install necessary frontend packages, and start all services:
   - Azurite Storage Emulator (ports 10000, 10001, 10002)
   - AkaMoney.Functions API (port 7071)
   - AkaMoney.Redirect service (port 7072)
   - Frontend application (port 8080)

#### Method 2: Manually Starting Each Service

If you want manual control over starting each service, refer to the following steps:

1. Clone the repository
```bash
git clone https://github.com/lettucebo/AkaMoney.git
cd AkaMoney
```

2. Create Table Storage in Azure Storage Emulator or Azure Storage Account
   - Table names: `shorturls` and `clickinfo`

3. Configure `local.settings.json` (in `src/AkaMoney.Functions` and `src/AkaMoney.Redirect`)
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "TableStorageConnection": "UseDevelopmentStorage=true",
    "DefaultRedirectUrl": "https://www.example.com",
    "AzureAd:Instance": "https://login.microsoftonline.com/",
    "AzureAd:TenantId": "your-tenant-id",
    "AzureAd:ClientId": "your-client-id"
  }
}
```

4. Start VS Code's Azurite extension
   - In VS Code, press F1, type "Azurite: Start", and execute this command

5. Start the API project
```bash
cd src/AkaMoney.Functions
func start
```

6. In another terminal window, start the redirect service
```bash
cd src/AkaMoney.Redirect
func start
```

7. Configure frontend environment variables (`.env.local` in `src/akamoney-frontend`)
```
VUE_APP_API_URL=http://localhost:7071/api
VUE_APP_REDIRECT_URL=http://localhost:7072
VUE_APP_AUTH_CLIENT_ID=your-client-id
VUE_APP_AUTH_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
```

8. Install dependencies and start the development server
```bash
cd src/akamoney-frontend
npm install
npm run serve
```

9. The frontend will run at http://localhost:8080

## 🚢 Deployment to Azure

Please refer to the [Deployment Documentation](docs/deployment.md) to learn how to deploy to Azure using Azure Bicep.

## 📦 Packages Used

### Backend
- .NET 8.0
- Azure Functions v4
- Azure.Data.Tables 12.8.3
- Microsoft.Azure.Functions.Extensions 1.1.0
- Microsoft.Azure.WebJobs.Extensions.OpenApi 1.5.1
- Microsoft.Extensions.DependencyInjection 8.0.0
- Microsoft.Identity.Web 2.15.3

### Frontend
- Vue 3.3.x
- Vue Router 4.2.x
- Bootstrap 5.3.x
- Axios 1.6.x
- @azure/msal-browser 3.6.0
- Font Awesome 6.5.0

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📮 Contact

Have any questions? Please open an [Issue](https://github.com/lettucebo/AkaMoney/issues).
