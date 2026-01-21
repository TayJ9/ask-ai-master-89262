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
$pushResult = git push origin main 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[SUCCESS] Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Railway will auto-deploy backend" -ForegroundColor Cyan
    Write-Host "Vercel will auto-deploy frontend" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "[ERROR] Push failed - authentication required" -ForegroundColor Red
    Write-Host ""
    Write-Host "To enable automatic pushing, set up authentication:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "OPTION 1: GitHub Personal Access Token (Recommended)" -ForegroundColor Cyan
    Write-Host "  1. Create token: https://github.com/settings/tokens/new" -ForegroundColor White
    Write-Host "     - Name: Auto Push" -ForegroundColor White
    Write-Host "     - Scopes: repo (all)" -ForegroundColor White
    Write-Host "  2. Run once: git push origin main" -ForegroundColor White
    Write-Host "     Username: TayJ9" -ForegroundColor White
    Write-Host "     Password: [paste token]" -ForegroundColor White
    Write-Host "  3. Credentials saved - future pushes work automatically!" -ForegroundColor White
    Write-Host ""
    Write-Host "OPTION 2: Set GITHUB_TOKEN environment variable" -ForegroundColor Cyan
    Write-Host '  See AUTO_PUSH_GUIDE.md for detailed instructions' -ForegroundColor White
    exit 1
}
