# Pre-Deployment Local Testing Script
# This script verifies your application is ready for deployment

$ErrorActionPreference = "Stop"
$script:errors = @()
$script:warnings = @()

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
    $script:errors += $Message
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
    $script:warnings += $Message
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

Write-Host "`n🚀 Starting Pre-Deployment Verification..." -ForegroundColor Cyan
Write-Host "=" * 60

# Get project root
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = Join-Path $projectRoot "frontend"
$backendPath = Join-Path $projectRoot "backend"

# ============================================
# 1. Dependency Check
# ============================================
Write-Host "`n1️⃣ Checking Dependencies..." -ForegroundColor Yellow

if (Test-Path $frontendPath) {
    Push-Location $frontendPath
    Write-Info "Checking frontend dependencies..."
    
    # Check if node_modules exists
    if (-not (Test-Path "node_modules")) {
        Write-Error-Custom "Frontend node_modules not found. Run 'npm install' first."
    } else {
        Write-Success "Frontend node_modules found"
    }
    
    # Check for critical vulnerabilities
    $auditResult = npm audit --audit-level=moderate 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning-Custom "Frontend has dependency vulnerabilities. Review with 'npm audit'"
    } else {
        Write-Success "Frontend dependencies: No critical vulnerabilities"
    }
    
    Pop-Location
}

if (Test-Path $backendPath) {
    Push-Location $backendPath
    Write-Info "Checking backend dependencies..."
    
    if (-not (Test-Path "node_modules")) {
        Write-Error-Custom "Backend node_modules not found. Run 'npm install' first."
    } else {
        Write-Success "Backend node_modules found"
    }
    
    Pop-Location
}

# ============================================
# 2. Environment Variables Check
# ============================================
Write-Host "`n2️⃣ Checking Environment Variables..." -ForegroundColor Yellow

if (Test-Path (Join-Path $backendPath ".env")) {
    $envContent = Get-Content (Join-Path $backendPath ".env") -Raw
    
    $requiredVars = @("DATABASE_URL", "JWT_SECRET", "OPENAI_API_KEY")
    foreach ($var in $requiredVars) {
        if ($envContent -match "$var=") {
            Write-Success "Backend .env has $var"
        } else {
            Write-Warning-Custom "Backend .env missing $var (may be optional for local dev)"
        }
    }
} else {
    Write-Warning-Custom "Backend .env file not found (may be using system env vars)"
}

# ============================================
# 3. TypeScript/Lint Check
# ============================================
Write-Host "`n3️⃣ Running Linter..." -ForegroundColor Yellow

if (Test-Path $frontendPath) {
    Push-Location $frontendPath
    Write-Info "Running frontend linter..."
    
    try {
        npm run lint 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Frontend linting passed"
        } else {
            Write-Warning-Custom "Frontend linting has warnings/errors"
        }
    } catch {
        Write-Warning-Custom "Could not run linter: $_"
    }
    
    Pop-Location
}

# ============================================
# 4. Build Test
# ============================================
Write-Host "`n4️⃣ Testing Production Build..." -ForegroundColor Yellow

if (Test-Path $frontendPath) {
    Push-Location $frontendPath
    Write-Info "Building frontend for production..."
    
    # Clean previous build
    if (Test-Path "dist") {
        Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
    }
    
    try {
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Frontend build succeeded"
            
            # Check build output
            $distPath = Join-Path $frontendPath "dist/public"
            if (Test-Path $distPath) {
                $buildSize = (Get-ChildItem -Recurse $distPath | Measure-Object -Property Length -Sum).Sum / 1MB
                $buildSizeRounded = [math]::Round($buildSize, 2)
                Write-Info "Build size: $buildSizeRounded MB"
                
                if ($buildSize -gt 10) {
                    $buildSizeRounded = [math]::Round($buildSize, 2)
                    $message = "Build size is large: $buildSizeRounded megabytes. Consider optimization."
                    Write-Warning-Custom $message
                }
            }
        } else {
            Write-Error-Custom "Frontend build failed! Check the output above."
        }
    } catch {
        Write-Error-Custom "Build error: $_"
    }
    
    Pop-Location
}

# ============================================
# 5. Backend Health Check
# ============================================
Write-Host "`n5️⃣ Testing Backend..." -ForegroundColor Yellow

$backendRunning = $false
$backendPort = 3001

# Check if backend is already running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$backendPort/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Success "Backend is already running and healthy"
        $backendRunning = $true
    }
} catch {
    Write-Info "Backend not running. Starting backend for testing..."
    
    # Try to start backend
    if (Test-Path $backendPath) {
        Push-Location $backendPath
        
        # Start backend in background
        $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 8
        
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$backendPort/health" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Success "Backend started and health check passed"
                $backendRunning = $true
                
                # Stop the test backend
                Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Warning-Custom "Could not verify backend health. Make sure backend is running on port $backendPort"
            if ($backendProcess) {
                Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
            }
        }
        
        Pop-Location
    }
}

# ============================================
# 6. Summary
# ============================================
Write-Host "`n" + "=" * 60
Write-Host "📊 Verification Summary" -ForegroundColor Cyan
Write-Host "=" * 60

if ($script:errors.Count -eq 0 -and $script:warnings.Count -eq 0) {
    Write-Host "`n✅ All checks passed! Your application is ready for deployment." -ForegroundColor Green
    exit 0
} elseif ($script:errors.Count -eq 0) {
    Write-Host "`n⚠️  Some warnings found, but no critical errors." -ForegroundColor Yellow
    Write-Host "Warnings:" -ForegroundColor Yellow
    foreach ($warning in $script:warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
    Write-Host "`n✅ Ready for deployment (with warnings)" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ Critical errors found. Please fix before deploying:" -ForegroundColor Red
    foreach ($error in $script:errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    if ($script:warnings.Count -gt 0) {
        Write-Host "`nWarnings:" -ForegroundColor Yellow
        foreach ($warning in $script:warnings) {
            Write-Host "  - $warning" -ForegroundColor Yellow
        }
    }
    exit 1
}
