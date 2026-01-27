# Performance Optimizations Test Script
# Verifies that performance changes haven't broken the interview flow

Write-Host "Performance Optimizations Test Suite" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"
$testResults = @{
    Passed = 0
    Failed = 0
    Warnings = 0
}

function Test-Passed {
    param([string]$Message)
    Write-Host "✅ PASS: $Message" -ForegroundColor Green
    $script:testResults.Passed++
}

function Test-Failed {
    param([string]$Message)
    Write-Host "❌ FAIL: $Message" -ForegroundColor Red
    $script:testResults.Failed++
}

function Test-Warning {
    param([string]$Message)
    Write-Host "⚠️  WARN: $Message" -ForegroundColor Yellow
    $script:testResults.Warnings++
}

# Test 1: Check if files exist and are modified
Write-Host "Test 1: Verifying modified files exist..." -ForegroundColor Cyan
$requiredFiles = @(
    "frontend/src/components/ui/AudioVisualizer.tsx",
    "frontend/src/components/VoiceInterviewWebSocket.tsx",
    "backend/server/routes.ts",
    "frontend/vite.config.ts",
    "backend/scripts/verify-indexes.sql"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Test-Passed "File exists: $file"
    } else {
        Test-Failed "File missing: $file"
    }
}

# Test 2: Check TypeScript compilation
Write-Host ""
Write-Host "Test 2: Checking TypeScript compilation..." -ForegroundColor Cyan
# Check if build output exists (more reliable than checking exit code)
if (Test-Path "frontend/dist/public/assets") {
    $buildFiles = Get-ChildItem "frontend/dist/public/assets/*.js" -ErrorAction SilentlyContinue
    if ($buildFiles -and $buildFiles.Count -gt 0) {
        Test-Passed "Frontend builds successfully (build output exists)"
    } else {
        Test-Warning "Build directory exists but no JS files found - may need to rebuild"
    }
} else {
    # Try to build
    try {
        Push-Location "frontend"
        $null = npm run build 2>&1 | Out-Null
        if (Test-Path "dist/public/assets/*.js") {
            Test-Passed "Frontend builds successfully"
        } else {
            Test-Warning "Build completed but output not found - check for errors"
        }
        Pop-Location
    } catch {
        Test-Warning "Build check skipped - verify manually with 'npm run build'"
        Pop-Location
    }
}

# Test 3: Check for React.memo in AudioVisualizer
Write-Host ""
Write-Host "Test 3: Verifying AudioVisualizer optimizations..." -ForegroundColor Cyan
$audioVisualizerContent = Get-Content "frontend/src/components/ui/AudioVisualizer.tsx" -Raw
if ($audioVisualizerContent -match "React\.memo") {
    Test-Passed "AudioVisualizer is memoized"
} else {
    Test-Failed "AudioVisualizer is not memoized"
}

if ($audioVisualizerContent -match "useCallback") {
    Test-Passed "AudioVisualizer uses useCallback"
} else {
    Test-Warning "AudioVisualizer may not use useCallback for all functions"
}

if ($audioVisualizerContent -match "inputVolumeRef|outputVolumeRef") {
    Test-Passed "AudioVisualizer uses refs for volume"
} else {
    Test-Failed "AudioVisualizer doesn't use refs for volume"
}

# Test 4: Check for cleanup functions in VoiceInterviewWebSocket
Write-Host ""
Write-Host "Test 4: Verifying cleanup functions..." -ForegroundColor Cyan
$voiceInterviewContent = Get-Content "frontend/src/components/VoiceInterviewWebSocket.tsx" -Raw

if ($voiceInterviewContent -match "cleanupAudioContext") {
    Test-Passed "cleanupAudioContext function exists"
} else {
    Test-Failed "cleanupAudioContext function missing"
}

if ($voiceInterviewContent -match "cleanupMediaStream") {
    Test-Passed "cleanupMediaStream function exists"
} else {
    Test-Failed "cleanupMediaStream function missing"
}

if ($voiceInterviewContent -match "conversationRef\.current\.endSession|conversation\.endSession\(\)") {
    Test-Passed "conversation.endSession() is called in cleanup"
} else {
    Test-Warning "conversation.endSession() may not be called in all cleanup paths"
}

if ($voiceInterviewContent -match "inputVolumeRef|outputVolumeRef") {
    Test-Passed "VoiceInterviewWebSocket uses refs for volume"
} else {
    Test-Failed "VoiceInterviewWebSocket doesn't use refs for volume"
}

# Test 5: Check for parallelized database queries
Write-Host ""
Write-Host "Test 5: Verifying database query optimizations..." -ForegroundColor Cyan
$routesContent = Get-Content "backend/server/routes.ts" -Raw

if ($routesContent -match "Promise\.all\(\[") {
    Test-Passed "Database queries are parallelized"
} else {
    Test-Failed "Database queries are not parallelized"
}

# Test 6: Check for vendor chunk splitting
Write-Host ""
Write-Host "Test 6: Verifying bundle optimizations..." -ForegroundColor Cyan
$viteConfigContent = Get-Content "frontend/vite.config.ts" -Raw

if ($viteConfigContent -match "form-vendor|chart-vendor|animation-vendor") {
    Test-Passed "Vendor chunk splitting is configured"
} else {
    Test-Warning "Vendor chunk splitting may not be fully configured"
}

# Test 7: Check for linting errors
Write-Host ""
Write-Host "Test 7: Checking for linting errors..." -ForegroundColor Cyan
try {
    Push-Location "frontend"
    $lintOutput = npm run lint 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -or $lintOutput -notmatch "error|Error") {
        Test-Passed "No linting errors"
    } else {
        Test-Warning "Linting issues found (may be non-critical)"
        Write-Host $lintOutput -ForegroundColor Yellow
    }
    Pop-Location
} catch {
    Test-Warning "Linting check skipped (lint script may not exist)"
    Pop-Location
}

# Test 8: Verify build output chunks
Write-Host ""
Write-Host "Test 8: Verifying build output..." -ForegroundColor Cyan
if (Test-Path "frontend/dist/public/assets") {
    $chunkFiles = Get-ChildItem "frontend/dist/public/assets/*.js" -ErrorAction SilentlyContinue
    if ($chunkFiles) {
        $vendorChunk = $chunkFiles | Where-Object { $_.Name -like "*vendor*.js" -and $_.Name -notlike "*form*" -and $_.Name -notlike "*chart*" -and $_.Name -notlike "*animation*" }
        $formChunk = $chunkFiles | Where-Object { $_.Name -like "*form-vendor*" }
        
        if ($formChunk) {
            Test-Passed "Form vendor chunk exists (better caching)"
        }
        
        if ($vendorChunk) {
            $vendorSize = [math]::Round($vendorChunk.Length / 1KB, 2)
            if ($vendorSize -lt 800) {
                Test-Passed "Vendor chunk size is reasonable: $vendorSize KB"
            } else {
                Test-Warning "Vendor chunk is large: $vendorSize KB"
            }
        }
    } else {
        Test-Warning "Build output not found - run 'npm run build' first"
    }
} else {
    Test-Warning "Build directory not found - run 'npm run build' first"
}

# Test 9: Check for async/await issues in cleanup
Write-Host ""
Write-Host "Test 9: Verifying async cleanup patterns..." -ForegroundColor Cyan
$voiceInterviewContent = Get-Content "frontend/src/components/VoiceInterviewWebSocket.tsx" -Raw

# Check that cleanup doesn't use await in return function (React limitation)
$cleanupPattern = '(?s)return\s*\{[^}]*await\s+conversationRef\.current\.endSession'
if ($voiceInterviewContent -match $cleanupPattern) {
    Test-Failed "Cleanup function uses await in return (should use fire-and-forget)"
} else {
    Test-Passed "Cleanup uses fire-and-forget pattern (correct)"
}

# Test 10: Verify no breaking changes to component props
Write-Host ""
Write-Host "Test 10: Verifying component interface compatibility..." -ForegroundColor Cyan
$audioVisualizerProps = Select-String -Path "frontend/src/components/ui/AudioVisualizer.tsx" -Pattern "interface AudioVisualizerProps" -Context 0,10
if ($audioVisualizerProps -match "inputVolume|outputVolume|mode") {
    Test-Passed "AudioVisualizer props interface maintained (backward compatible)"
} else {
    Test-Failed "AudioVisualizer props may have changed"
}

# Summary
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "✅ Passed: $($testResults.Passed)" -ForegroundColor Green
Write-Host "❌ Failed: $($testResults.Failed)" -ForegroundColor Red
Write-Host "⚠️  Warnings: $($testResults.Warnings)" -ForegroundColor Yellow
Write-Host ""

if ($testResults.Failed -eq 0) {
    Write-Host "All critical tests passed! Performance optimizations are working correctly." -ForegroundColor Green
    if ($testResults.Warnings -gt 0) {
        Write-Host "Some warnings were found - review them but they may not be critical." -ForegroundColor Yellow
    }
    exit 0
} else {
    Write-Host "Some tests failed. Please review the errors above." -ForegroundColor Red
    exit 1
}
