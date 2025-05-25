#!/usr/bin/env pwsh
# AkaMoney One-Click Startup Script
# This script starts all necessary services, including Azurite Storage Emulator, Azure Functions, and the frontend application

# Define color output function
function Write-ColorOutput {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [string]$ForegroundColor = "White"
    )
    
    Write-Host $Message -ForegroundColor $ForegroundColor
}

# Define project paths
$rootPath = $PSScriptRoot
$functionsPath = Join-Path -Path $rootPath -ChildPath "src\AkaMoney.Functions"
$frontendPath = Join-Path -Path $rootPath -ChildPath "src\akamoney-frontend"

# Display welcome message
Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "             AkaMoney One-Click Startup            " "Cyan"
Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "Checking necessary tools and dependencies..." "Yellow"

# Check if required tools are installed
$vscodePath = Get-Command code -ErrorAction SilentlyContinue
if (-not $vscodePath) {
    Write-ColorOutput "VS Code is not installed. Please install VS Code before running this script." "Red"
    Write-ColorOutput "Download VS Code: https://code.visualstudio.com/download" "Red"
    exit 1
}

# Check VS Code Azurite extension
$vsExtensions = & code --list-extensions
$azuriteExtension = $vsExtensions | Where-Object { $_ -eq "Azurite.azurite" }
if (-not $azuriteExtension) {
    Write-ColorOutput "VS Code Azurite extension is not installed. Please install it in VS Code..." "Yellow"
    Write-ColorOutput "Installation instructions:" "Yellow"
    Write-ColorOutput "1. Open VS Code" "Yellow"
    Write-ColorOutput "2. Press Ctrl+P, type: ext install Azurite.azurite" "Yellow"
    Write-ColorOutput "3. Or search for 'Azurite' in the Extensions panel and install it" "Yellow"
    $installPrompt = Read-Host -Prompt "Continue script execution? Enter Y after installation, or N to exit"
    if ($installPrompt -ne "Y") {
        exit 1
    }
}

$funcPath = Get-Command func -ErrorAction SilentlyContinue
if (-not $funcPath) {
    Write-ColorOutput "Azure Functions Core Tools is not installed. Please install it before running this script." "Red"
    Write-ColorOutput "Installation guide: https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local" "Red"
    exit 1
}

# Check if required ports are available
$portsToCheck = @(7071, 8080, 10000, 10001, 10002)
foreach ($port in $portsToCheck) {
    $portInUse = Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }
    if ($portInUse) {
        Write-ColorOutput "Warning: Port $port is already in use. This may affect the startup of some services." "Yellow"
    }
}

# Start the VS Code Azurite extension
$azuriteDataPath = Join-Path -Path $rootPath -ChildPath ".azurite"
if (-not (Test-Path $azuriteDataPath)) {
    New-Item -ItemType Directory -Path $azuriteDataPath -Force | Out-Null
}

# Try to start Azurite via VS Code commands
Write-ColorOutput "Starting the VS Code Azurite extension..." "Green"
Write-ColorOutput "Please ensure VS Code is open and the Azurite extension is installed" "Yellow"

# Use VS Code command to start Azurite
$startAzuriteCommand = {
    # Use VS Code command to open the workspace and start Azurite
    code --folder-uri $using:rootPath --command "azurite.start"
}
Start-Process -WindowStyle Hidden powershell -ArgumentList "-Command", "& {$startAzuriteCommand}"

Write-ColorOutput "Azurite start command sent, waiting for service to start..." "Green"
Start-Sleep -Seconds 5  # Give Azurite more time to start

# Check if Azurite service is running
$maxRetries = 3
$retryCount = 0
$azuriteRunning = $false

# Function to test TCP connection without using Test-NetConnection
function Test-TcpPort {
    param (
        [string]$ComputerName,
        [int]$Port,
        [int]$Timeout = 1000
    )
    
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connection = $tcpClient.BeginConnect($ComputerName, $Port, $null, $null)
        $wait = $connection.AsyncWaitHandle.WaitOne($Timeout, $false)
        
        if (!$wait) {
            $tcpClient.Close()
            return $false
        }
        
        $tcpClient.EndConnect($connection)
        $tcpClient.Close()
        return $true
    } catch {
        return $false
    }
}

while ($retryCount -lt $maxRetries -and -not $azuriteRunning) {
    $blobEndpoint = Test-TcpPort -ComputerName "127.0.0.1" -Port 10000
    $queueEndpoint = Test-TcpPort -ComputerName "127.0.0.1" -Port 10001
    $tableEndpoint = Test-TcpPort -ComputerName "127.0.0.1" -Port 10002
    
    if ($blobEndpoint -and $queueEndpoint -and $tableEndpoint) {
        $azuriteRunning = $true
        Write-ColorOutput "Azurite service started successfully!" "Green"
    }
    else {
        $retryCount++
        if ($retryCount -lt $maxRetries) {
            Write-ColorOutput "Waiting for Azurite service to start...(Attempt $retryCount/$maxRetries)" "Yellow"
            Start-Sleep -Seconds 3
        }
    }
}

if (-not $azuriteRunning) {
    Write-ColorOutput "Warning: Azurite service may not have started successfully. Please start the Azurite extension manually in VS Code." "Red"
    Write-ColorOutput "In VS Code: Press F1, type 'Azurite: Start' and run this command." "Yellow"
    $continuePrompt = Read-Host -Prompt "Continue script execution? (Y/N)"
    if ($continuePrompt -ne "Y") {
        exit 1
    }
}

# Start AkaMoney.Functions in a new window
$functionsJob = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$functionsPath'; func start --port 7071" -PassThru
Write-ColorOutput "Starting AkaMoney.Functions on port 7071..." "Green"

# Start frontend in a new window
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendPath'; npm run serve" -PassThru
Write-ColorOutput "Starting frontend application on port 8080..." "Green"


Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "All services started!" "Green"
Write-ColorOutput " - Azurite Storage Emulator: http://127.0.0.1:10000 (Blob), 10001 (Queue), 10002 (Table)" "White"
Write-ColorOutput " - AkaMoney.Functions API: http://localhost:7071" "White"
Write-ColorOutput " - Frontend Application: http://localhost:8080" "White"
Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "Press Ctrl+C to end this script (you'll need to manually close the started windows)" "Yellow"

# Keep the script running so the user can press Ctrl+C to exit
try {
    Write-Host "Press Ctrl+C to end the script..." -ForegroundColor Yellow
    Write-Host "Script is running, services are running in the background..." -ForegroundColor Cyan
    # Use an infinite loop to keep the script running until the user presses Ctrl+C
    while ($true) {
        Start-Sleep -Seconds 60
    }
}
catch {
    # User pressed Ctrl+C
}
finally {
    # Remind user to close the Azurite extension in VS Code
    Write-ColorOutput "Ending script." "Yellow"
    Write-ColorOutput "Remember to close the Azurite extension in VS Code (F1 > Azurite: Stop)." "Yellow"
    Write-ColorOutput "Please manually close the Functions and frontend application windows." "Yellow"
}
