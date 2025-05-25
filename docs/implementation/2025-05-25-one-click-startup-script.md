# 2025-05-25-One-Click Startup Script Implementation

## Summary
This document records the implementation method of the AkaMoney project's one-click startup script. This script can start all necessary services simultaneously, including the Azurite storage emulator, Azure Functions, and the frontend application, allowing developers to quickly start the entire system for development and testing.

## Motivation
When developing, multiple services need to be started to run the AkaMoney system completely, including:
- Azurite storage emulator (for local Azure Storage simulation)
- AkaMoney.Functions (main API service)
- AkaMoney.Redirect (service for short URL redirection)
- Frontend application (Vue.js)

Starting these services manually is both time-consuming and error-prone, especially for developers new to the team. A one-click startup script can simplify this process and improve development efficiency.

## Implementation Details

### Script Location
The script is located in the project root directory: `start-akamoney.ps1`

### Features
1. **Automatic check for necessary tools**: Confirms if VS Code, Azurite extension, Node.js, NPM, and Azure Functions Core Tools are installed
2. **Port conflict check**: Checks if required ports are already occupied
3. **Automatic frontend package installation**: Checks and installs NPM packages required for the frontend application
4. **Parallel service startup**:
   - Azurite storage emulator (ports 10000, 10001, 10002)
   - AkaMoney.Functions (port 7071)
   - AkaMoney.Redirect (port 7072)
   - Frontend application (port 8080)
5. **Colored output**: Uses different colors for status output to improve readability
6. **Error handling**: Captures and displays errors during the startup process

### Ports Used
- Azurite Blob: 10000
- Azurite Queue: 10001
- Azurite Table: 10002
- AkaMoney.Functions: 7071
- AkaMoney.Redirect: 7072
- Frontend application: 8080

### Script Execution Method
Execute from PowerShell terminal:
```powershell
.\start-akamoney.ps1
```

## Considerations

### Advantages
1. **Simplified development workflow**: Start all services with one command
2. **Consistency**: Ensures all developers use the same setup
3. **Visibility**: Clearly displays the status and ports of all services
4. **Scalability**: Easy to add new services or modify existing settings

### Limitations
1. **Manual closure required**: Currently requires manually closing the started windows
2. **Only supports Windows PowerShell**: Currently mainly targeted at Windows development environments
3. **Partial health checks**: Although it checks if Azurite services started successfully, it hasn't implemented complete health checks for Functions and frontend applications

## Future Improvements
1. Add support for Linux/macOS
2. Implement graceful shutdown mechanism
3. Add service health checks
4. Add centralized service log display functionality
5. Consider using Docker Compose as an alternative

## Related Documents
- [Azure Functions Core Tools Documentation](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- [Azurite Storage Emulator Documentation](https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azurite)
- [Vue CLI Service Documentation](https://cli.vuejs.org/guide/cli-service.html)
