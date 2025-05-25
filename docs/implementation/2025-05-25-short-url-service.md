# AkaMoney Short URL Service Implementation Plan

## Overview
AkaMoney is a short URL service that allows users to create short URLs redirecting to target URLs, and track click counts and sources. The system is divided into three main components: frontend website, backend API, and redirection service.

## System Architecture

### Frontend
- Vue 3.x SPA
- Vue Router
- Bootstrap 5
- FontAwesome
- Hosted on Azure Static Web Apps
- Azure Entra ID integration

### Backend API
- Azure Functions (C#)
- Azure Table Storage
- Swagger UI / OpenAPI
- Divided into two projects: AkaMoney.Functions and AkaMoney.Services

### Redirection Service
- Independent Azure Function (C#)
- Redirection logic and click tracking

## Implementation Steps

### 1. Building Basic Project Structure
- [x] Create folder structure (src, infra, docs)
- [ ] Create backend solution and projects
- [ ] Create frontend project
- [ ] Create ADR documents

### 2. Backend API Implementation
- [ ] Configure Azure Table Storage data model
- [ ] Implement short URL CRUD services
- [ ] Implement API endpoints
- [ ] Integrate Swagger UI
- [ ] Implement Azure Entra ID authentication

### 3. Redirection Service Implementation
- [ ] Create independent Azure Function project
- [ ] Implement redirection logic
- [ ] Implement click tracking functionality
- [ ] Configure default redirection

### 4. Frontend Implementation
- [ ] Set up Vue project
- [ ] Implement user interface
- [ ] Integrate API services
- [ ] Implement Azure Entra ID login flow
- [ ] Add Bootstrap 5 and FontAwesome

### 5. Azure Bicep Deployment
- [ ] Create Azure Function App deployment script
- [ ] Create Azure Static Web Apps deployment script
- [ ] Create Azure Table Storage deployment script
- [ ] Configure custom domain

### 6. Documentation and Pull Request
- [ ] Update README.md
- [ ] Create user documentation
- [ ] Submit pull request

## Technology Stack and Versions

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

## Data Model

### ShortUrl Entity
- PartitionKey: "ShortUrl"
- RowKey: {short URL code}
- TargetUrl: target URL
- Title: social media title (optional)
- Description: social media description (optional)
- ImageUrl: social media image (optional)
- CreatedAt: creation time
- ExpirationDate: expiration date (optional)
- IsArchived: whether it is archived
- ClickCount: click count

### ClickInfo Entity
- PartitionKey: {short URL code}
- RowKey: {timestamp}-{random string}
- UserAgent: user agent
- Referrer: referrer source
- IPAddress: IP address
- Timestamp: click time
