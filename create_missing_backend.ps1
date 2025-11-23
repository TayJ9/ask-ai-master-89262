# PowerShell Script to Create Missing Backend Files
# Run this in VS Code terminal: .\create_missing_backend.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Creating Missing Backend Files" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if backend folder exists
if (-not (Test-Path "backend")) {
    Write-Host "Creating backend folder..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "backend" -Force | Out-Null
    Write-Host "✓ Backend folder created" -ForegroundColor Green
} else {
    Write-Host "✓ Backend folder already exists" -ForegroundColor Green
}

# Check if voiceServer.js exists
if (-not (Test-Path "backend\voiceServer.js")) {
    Write-Host ""
    Write-Host "⚠️  backend\voiceServer.js is MISSING" -ForegroundColor Red
    Write-Host ""
    Write-Host "This file is required for the server to work." -ForegroundColor Yellow
    Write-Host "You need to:" -ForegroundColor Yellow
    Write-Host "  1. Download from GitHub: https://github.com/TayJ9/ask-ai-master-89262" -ForegroundColor White
    Write-Host "  2. Or ask me to create it for you!" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "✓ backend\voiceServer.js exists" -ForegroundColor Green
}

# Check if routes folder exists
if (-not (Test-Path "backend\routes")) {
    Write-Host "Creating backend\routes folder..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "backend\routes" -Force | Out-Null
    Write-Host "✓ Backend routes folder created" -ForegroundColor Green
} else {
    Write-Host "✓ Backend routes folder exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run: node verify_and_fix_setup.js" -ForegroundColor Yellow
Write-Host "to check all files and get detailed report" -ForegroundColor Gray
Write-Host ""








