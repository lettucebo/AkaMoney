#!/usr/bin/env pwsh
# AkaMoney 一鍵啟動腳本
# 這個腳本會啟動所有必要的服務，包括 Azurite 儲存模擬器、Azure Functions 和前端應用程式

# 定義顏色輸出函式
function Write-ColorOutput {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [string]$ForegroundColor = "White"
    )
    
    Write-Host $Message -ForegroundColor $ForegroundColor
}

# 定義專案路徑
$rootPath = $PSScriptRoot
$functionsPath = Join-Path -Path $rootPath -ChildPath "src\AkaMoney.Functions"
$redirectPath = Join-Path -Path $rootPath -ChildPath "src\AkaMoney.Redirect"
$frontendPath = Join-Path -Path $rootPath -ChildPath "src\akamoney-frontend"

# 顯示歡迎訊息
Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "                AkaMoney 一鍵啟動                  " "Cyan"
Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "正在檢查必要的工具和相依套件..." "Yellow"

# 檢查是否已安裝必要工具
$azuritePath = Get-Command azurite -ErrorAction SilentlyContinue
if (-not $azuritePath) {
    Write-ColorOutput "未安裝 Azurite。正在嘗試使用 npm 全域安裝..." "Yellow"
    npm install -g azurite
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "Azurite 安裝失敗。請手動安裝：npm install -g azurite" "Red"
        exit 1
    }
}

$funcPath = Get-Command func -ErrorAction SilentlyContinue
if (-not $funcPath) {
    Write-ColorOutput "未安裝 Azure Functions Core Tools。請安裝後再執行此腳本。" "Red"
    Write-ColorOutput "安裝指南：https://docs.microsoft.com/zh-tw/azure/azure-functions/functions-run-local" "Red"
    exit 1
}

# 檢查必要端口是否可用
$portsToCheck = @(7071, 7072, 8080, 10000, 10001, 10002)
foreach ($port in $portsToCheck) {
    $portInUse = Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }
    if ($portInUse) {
        Write-ColorOutput "警告：端口 $port 已被使用。可能會影響某些服務的啟動。" "Yellow"
    }
}

# 開始 Azurite 儲存模擬器
$azuriteJob = Start-Job -ScriptBlock {
    try {
        Write-Output "開始啟動 Azurite 儲存模擬器..."
        azurite --silent --location $using:rootPath --debug $using:rootPath\azurite-debug.log
    }
    catch {
        Write-Output "Azurite 啟動失敗: $_"
        exit 1
    }
}
Write-ColorOutput "正在啟動 Azurite 儲存模擬器..." "Green"
Start-Sleep -Seconds 3  # 給 Azurite 一些時間來啟動

# 在新視窗中啟動 AkaMoney.Functions
$functionsJob = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$functionsPath'; func start --port 7071" -PassThru
Write-ColorOutput "正在啟動 AkaMoney.Functions 於端口 7071..." "Green"

# 在新視窗中啟動 AkaMoney.Redirect
$redirectJob = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$redirectPath'; func start --port 7072" -PassThru
Write-ColorOutput "正在啟動 AkaMoney.Redirect 於端口 7072..." "Green"

# 前端應用程式是否存在
if (Test-Path $frontendPath) {
    # 在新視窗中啟動前端
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendPath'; npm run serve" -PassThru
    Write-ColorOutput "正在啟動前端應用程式於端口 8080..." "Green"
}
else {
    Write-ColorOutput "前端應用程式目錄未找到。跳過前端啟動。" "Yellow"
}

Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "所有服務已啟動！" "Green"
Write-ColorOutput " - Azurite 儲存模擬器: http://127.0.0.1:10000 (Blob), 10001 (Queue), 10002 (Table)" "White"
Write-ColorOutput " - AkaMoney.Functions API: http://localhost:7071" "White"
Write-ColorOutput " - AkaMoney.Redirect 服務: http://localhost:7072" "White"
Write-ColorOutput " - 前端應用程式: http://localhost:8080" "White"
Write-ColorOutput "==================================================" "Cyan"
Write-ColorOutput "按下 Ctrl+C 結束此腳本 (需要手動關閉已啟動的視窗)" "Yellow"

# 保持腳本運行，這樣用戶可以按 Ctrl+C 來退出
try {
    Write-Host "按 Ctrl+C 結束腳本..." -ForegroundColor Yellow
    Wait-Job -Job $azuriteJob -Timeout ([System.Threading.Timeout]::Infinite)
}
catch {
    # 用戶按下 Ctrl+C
}
finally {
    # 清理作業
    if ($azuriteJob) {
        Remove-Job -Job $azuriteJob -Force
    }
    
    Write-ColorOutput "正在結束腳本。請手動關閉已啟動的視窗。" "Yellow"
}
