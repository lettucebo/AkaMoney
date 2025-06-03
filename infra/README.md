# AkaMoney Infrastructure Documentation

This directory contains Azure Infrastructure as Code (IaC) files for the AkaMoney project, using Azure Bicep for resource deployment.

## Directory Structure

- `main.bicep` - Main Bicep deployment file
- `environments/` - Parameter files for different environments
- `modules/` - Reusable Bicep modules

## Azure Service Principal Creation Guide

### What is a Service Principal?

A Service Principal is an identity used by applications, services, or automation tools to access Azure resources. In CI/CD pipelines, we use service principals to allow tools like GitHub Actions to deploy resources to Azure.

### Steps to Create a Service Principal

#### 1. Using Azure CLI to Create a Service Principal

```powershell
# Login to Azure account
az login

# View available subscriptions
az account list --output table

# Select the subscription to use (if you have multiple)
az account set --subscription "<subscription name or ID>"

# Create a service principal and credentials for GitHub Actions
az ad sp create-for-rbac --name "AkaMoneyGitHubActions" --role contributor --scopes /subscriptions/<subscription ID> --sdk-auth
```

After executing the last command, you will get a JSON output that looks like this:

```json
{
  "clientId": "xxxx-xxxx-xxxx-xxxx-xxxx",
  "clientSecret": "xxxx-xxxx-xxxx-xxxx-xxxx",
  "subscriptionId": "xxxx-xxxx-xxxx-xxxx-xxxx",
  "tenantId": "xxxx-xxxx-xxxx-xxxx-xxxx",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

#### 2. Using Azure Portal to Create a Service Principal

1. Sign in to the [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Provide a name (e.g., "AkaMoneyGitHubActions")
5. Select the appropriate supported account type
6. Click "Register"
7. After registration, note the "Application (client) ID" and "Directory (tenant) ID"
8. Navigate to "Certificates & secrets" > "Client secrets" > "New client secret"
9. Provide a description and select an expiration time, then click "Add"
10. **Important**: Copy the generated secret value immediately, as you won't be able to see it again after leaving the page
11. Navigate to "Subscriptions" > select your subscription > "Access control (IAM)" > "Add role assignment"
12. Choose the "Contributor" role and assign it to your application registration

### Using Service Principal in GitHub Actions

1. Go to your GitHub repository > "Settings" > "Secrets and variables" > "Actions"
2. Create a new Secret named `AZURE_CREDENTIALS`
3. Paste the complete JSON output as the value

In your GitHub Actions workflow, use:

```yaml
- name: Azure Login
  uses: azure/login@v1
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}
```

### Security Best Practices

- Follow the principle of least privilege, only granting the service principal the minimum permissions needed
- Set reasonable expiration times for access secrets
- Rotate service principal secrets periodically
- Monitor service principal activity
- Delete or disable service principals when no longer needed

### Testing Service Principal Locally

```powershell
# Login using service principal
az login --service-principal --username <clientId> --password <clientSecret> --tenant <tenantId>

# Verify successful login
az account list --output table
```
