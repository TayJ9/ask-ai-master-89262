# Automatic GitHub Push Script for Windows
# Usage: .\auto_push.ps1 [commit_message]

param(
    [string]$CommitMessage = "Auto-commit: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Stop"

Write-Host "Auto-pushing to GitHub..." -ForegroundColor Cyan
Write-Host ""

# Navigate to project directory
$projectPath = "C:\Users\tayjs\OneDrive - College of Charleston\Documents\ask-ai-master-89262"
Set-Location $projectPath

# Check if there are changes to commit
$status = git status --porcelain
if (-not $status) {
    Write-Host "[OK] No changes to commit" -ForegroundColor Green
    exit 0
}

Write-Host "Staging all changes..." -ForegroundColor Yellow
git add -A

Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m $CommitMessage

Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
git push origin main *>$null
$pushExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($pushExitCode -eq 0) {
    Write-Host ""
    Write-Host "[SUCCESS] Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Railway will auto-deploy backend" -ForegroundColor Cyan
    Write-Host "Vercel will auto-deploy frontend" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "[ERROR] Push failed - SSH key authentication required" -ForegroundColor Red
    Write-Host ""
    Write-Host "To enable automatic pushing with SSH:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Add your SSH key to GitHub:" -ForegroundColor Cyan
    Write-Host "   - Go to: https://github.com/settings/ssh/new" -ForegroundColor White
    Write-Host "   - Paste your public SSH key" -ForegroundColor White
    Write-Host "   - Click 'Add SSH key'" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Test connection:" -ForegroundColor Cyan
    Write-Host "   ssh -T git@github.com" -ForegroundColor White
    Write-Host ""
    Write-Host "3. If key is already added, ensure SSH agent is running:" -ForegroundColor Cyan
    Write-Host "   Get-Service ssh-agent | Start-Service" -ForegroundColor White
    Write-Host "   ssh-add ~/.ssh/id_rsa" -ForegroundColor White
    Write-Host ""
    Write-Host "See AUTO_PUSH_GUIDE.md for detailed SSH setup instructions" -ForegroundColor White
    exit 1
}
