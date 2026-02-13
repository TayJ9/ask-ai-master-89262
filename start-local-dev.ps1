# PowerShell script to start local development servers
# Usage: .\start-local-dev.ps1

Write-Host "🚀 Starting Local Development Servers..." -ForegroundColor Green
Write-Host ""

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed. Please install Node.js >= 18.0.0" -ForegroundColor Red
    exit 1
}

# Check Node.js version
$nodeVersion = node --version
Write-Host "✓ Node.js version: $nodeVersion" -ForegroundColor Green

# Check if dependencies are installed
Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow

if (-not (Test-Path "backend\node_modules")) {
    Write-Host "⚠️  Backend dependencies not installed. Installing..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    Set-Location ..
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "⚠️  Frontend dependencies not installed. Installing..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

# Check if .env exists
if (-not (Test-Path "backend\.env")) {
    Write-Host "⚠️  backend/.env file not found!" -ForegroundColor Yellow
    Write-Host "   Make sure backend/.env exists with required variables." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Write-Host "✅ Dependencies ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Starting servers in separate windows..." -ForegroundColor Cyan
Write-Host ""

# Start backend in new window
Write-Host "📡 Starting Backend (port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; Write-Host 'Backend Server (Port 3000)' -ForegroundColor Green; Write-Host ''; npm run dev"

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Start frontend in new window
Write-Host "🌐 Starting Frontend (port 5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; Write-Host 'Frontend Server (Port 5173)' -ForegroundColor Green; Write-Host ''; npm run dev"

Write-Host ""
Write-Host "✅ Servers starting!" -ForegroundColor Green
Write-Host ""
Write-Host "Access your application:" -ForegroundColor Yellow
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:  http://localhost:3000" -ForegroundColor White
Write-Host "  Health:   http://localhost:3000/health" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C in each server window to stop them." -ForegroundColor Gray
