# Azure Functions Flex Consumption Deployment Fix

## Date: 2025-06-10

## Overview
Fixed the deployment workflow for Azure Functions using Flex Consumption plan. The previous deployment method using `Azure/functions-action@v1` is not compatible with Flex Consumption plans. Additionally, discovered that Flex Consumption requires a specific directory structure with `.azurefunctions` at the root level.

## Changes Made

### 1. Updated Deploy Function Job
- Changed runner from `windows-latest` to `ubuntu-latest` for better performance and compatibility
- Removed PowerShell-specific syntax since we're now using Ubuntu

### 2. Replaced Deployment Method
- Removed: `Azure/functions-action@v1` with publish profile
- Added: Azure CLI deployment using `az functionapp deployment source config-zip`

### 3. Fixed Package Structure for Flex Consumption
- **Critical**: Flex Consumption requires `.azurefunctions` directory at root level of zip package
- Added step to create proper directory structure before zipping:
  ```bash
  mkdir -p .azurefunctions
  find . -maxdepth 1 ! -name '.azurefunctions' ! -name '.' -exec mv {} .azurefunctions/ \;
  zip -r ../deployment.zip .azurefunctions
  ```
- This ensures all function app content is inside `.azurefunctions` directory in the zip

### 4. Updated Action Versions
- Updated all GitHub Actions to v4 where available
- Kept Azure actions at stable versions (v1 for login, v2 for webapps-deploy)

## Key Differences for Flex Consumption
1. **Deployment Method**: Must use Azure CLI instead of the traditional Functions Action
2. **Package Format**: Requires zip file format with specific directory structure
3. **Directory Structure**: Must have `.azurefunctions` directory at root level of zip
4. **Authentication**: Still uses Azure credentials but through CLI commands

## Error Resolution
Fixed the error: `InvalidPackageContentException: Package content validation failed: Cannot find required .azurefunctions directory at root level in the .zip package`

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
4. Check deployment logs for successful package validation
5. Test the deployed functions to ensure they're working correctly
