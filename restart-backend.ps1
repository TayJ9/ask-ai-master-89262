# Script to restart the backend server
# Kills whatever is on port 3000 and starts the backend

Write-Host "🔄 Restarting Backend Server..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill processes on port 3000
Write-Host "1️⃣  Stopping processes on port 3000..." -ForegroundColor Yellow
$connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "   Stopping process: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Gray
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 1
    Write-Host "   ✅ Port 3000 cleared" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  No processes found on port 3000" -ForegroundColor Gray
}

Write-Host ""

# Step 2: Start backend
Write-Host "2️⃣  Starting backend server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "backend"
Set-Location $backendPath

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "   ❌ backend/.env file not found!" -ForegroundColor Red
    Write-Host "   Please create backend/.env with required variables." -ForegroundColor Red
    Set-Location ..
    exit 1
}

# Start backend in new window
Write-Host "   📡 Starting backend on port 3000..." -ForegroundColor Cyan
$backendDir = (Get-Location).Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; Write-Host '🚀 Backend Server (Port 3000)' -ForegroundColor Green; Write-Host ''; npm run dev"

Set-Location ..

Write-Host ""
Write-Host "✅ Backend server starting in new window!" -ForegroundColor Green
Write-Host ""
Write-Host "Wait 5-10 seconds for the server to start, then test with:" -ForegroundColor Yellow
Write-Host "  node test-signin-simple.js" -ForegroundColor White
Write-Host ""
