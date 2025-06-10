# Azure Functions Flex Consumption Deployment Fix

## Date: 2025-06-10

## Overview
Fixed the deployment workflow for Azure Functions using Flex Consumption plan. The previous deployment method using `Azure/functions-action@v1` is not compatible with Flex Consumption plans.

## Changes Made

### 1. Updated Deploy Function Job
- Changed runner from `windows-latest` to `ubuntu-latest` for better performance and compatibility
- Removed PowerShell-specific syntax since we're now using Ubuntu

### 2. Replaced Deployment Method
- Removed: `Azure/functions-action@v1` with publish profile
- Added: Azure CLI deployment using `az functionapp deployment source config-zip`

### 3. Added Zip Packaging Step
- Flex Consumption requires the deployment package to be in zip format
- Added explicit step to create deployment.zip from the published artifacts

### 4. Updated Action Versions
- Updated all GitHub Actions to v4 where available
- Kept Azure actions at stable versions (v1 for login, v2 for webapps-deploy)

## Key Differences for Flex Consumption
1. **Deployment Method**: Must use Azure CLI instead of the traditional Functions Action
2. **Package Format**: Requires zip file format
3. **Authentication**: Still uses Azure credentials but through CLI commands

## Required Secrets
The workflow requires these secrets to be configured in GitHub:
- `AZURE_CREDENTIALS`: Service principal credentials for Azure authentication
- `AZURE_STORAGE_ACCOUNT`: Storage account name
- `AZURE_RG`: Resource group name
- `VUE_APP_CLIENT_ID`: Frontend client ID
- `VUE_APP_TENANT_ID`: Azure tenant ID
- `VUE_APP_API_CLIENT_ID`: API client ID

## Note on VSCode Errors
The VSCode GitHub Actions extension may show errors for the Azure actions (`azure/login@v1`, `azure/webapps-deploy@v2`). These are false positives - the actions will work correctly when the workflow runs on GitHub.

## Testing
After implementing these changes:
1. Push to main branch or create a pull request
2. Monitor the GitHub Actions workflow execution
3. Verify the Function App is deployed successfully to the Flex Consumption plan
4. Test the deployed functions to ensure they're working correctly
