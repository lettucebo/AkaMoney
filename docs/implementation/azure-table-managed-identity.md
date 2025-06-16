# Azure Table Storage Managed Identity Authentication

Follow this plan to configure your Functions app to use Azure Managed Identity for Table Storage in production, while retaining the local development storage emulator.

```mermaid
flowchart TD
  A[Start Function App] --> B{Is TableStorageConnection set?}
  B -- Yes --> C[Use connection string (Development Storage)]
  C --> D[TableClient(connectionString, tableName)]
  D --> E[CreateIfNotExists()]
  B -- No --> F[Read AzureWebJobsStorage__accountName]
  F --> G[Construct endpoint URI: https://{account}.table.core.windows.net]
  G --> H[TableClient(endpoint, tableName, DefaultAzureCredential)]
  H --> E
```

## Implementation Steps

1. Adjust local.settings.json
   - Remove the existing `AzureWebJobsStorage` entry.
   - Ensure the following setting remains under `Values`:
     ```json
     "TableStorageConnection": "UseDevelopmentStorage=true"
     ```

2. Update ShortUrlService.cs

    ```csharp
    // In the constructor:
    string? tableConn = configuration["TableStorageConnection"];
    if (!string.IsNullOrEmpty(tableConn))
    {
        _shortUrlTable = new TableClient(tableConn, TableName);
    }
    else
    {
        string accountName = configuration["AzureWebJobsStorage__accountName"];
        var endpoint = new Uri($"https://{accountName}.table.core.windows.net");
        _shortUrlTable = new TableClient(endpoint, TableName, new DefaultAzureCredential());
    }
    _shortUrlTable.CreateIfNotExists();
    ```

3. Update ClickTrackingService.cs with the same constructor pattern for both `_clickInfoTable` and `_shortUrlTable`.

4. Add necessary usings at the top of both service files:

    ```csharp
    using Azure.Identity;
    using System;
    ```

5. Documentation: Update any readme or docs to specify:
   - Local developer uses `TableStorageConnection` for emulator.
   - Production requires setting `AzureWebJobsStorage__accountName` to the storage account name and assigning a managed identity with `Storage Table Data Contributor` role.