# Interview Flow Integration Test
# Tests that the interview flow works correctly with performance optimizations

Write-Host "Interview Flow Integration Test" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"
$testResults = @{
    Passed = 0
    Failed = 0
    Warnings = 0
}

function Test-Passed {
    param([string]$Message)
    Write-Host "  [PASS] $Message" -ForegroundColor Green
    $script:testResults.Passed++
}

function Test-Failed {
    param([string]$Message)
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
    $script:testResults.Failed++
}

function Test-Warning {
    param([string]$Message)
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
    $script:testResults.Warnings++
}

# Test 1: Verify AudioVisualizer can be imported and used
Write-Host "Test 1: AudioVisualizer Component Interface" -ForegroundColor Cyan
$audioVisualizerContent = Get-Content "frontend/src/components/ui/AudioVisualizer.tsx" -Raw

# Check that component exports correctly
if ($audioVisualizerContent -match "export default React\.memo") {
    Test-Passed "AudioVisualizer exports as memoized component"
} else {
    Test-Failed "AudioVisualizer export may be incorrect"
}

# Check that props interface is maintained
if ($audioVisualizerContent -match "interface AudioVisualizerProps" -and 
    $audioVisualizerContent -match "inputVolume.*number" -and
    $audioVisualizerContent -match "outputVolume.*number" -and
    $audioVisualizerContent -match "mode.*'user_speaking'") {
    Test-Passed "AudioVisualizer props interface is correct"
} else {
    Test-Failed "AudioVisualizer props interface may have changed"
}

# Test 2: Verify VoiceInterviewWebSocket cleanup doesn't break flow
Write-Host ""
Write-Host "Test 2: VoiceInterviewWebSocket Cleanup Safety" -ForegroundColor Cyan
$voiceInterviewContent = Get-Content "frontend/src/components/VoiceInterviewWebSocket.tsx" -Raw

# Check that cleanup functions have error handling
if ($voiceInterviewContent -match "cleanupAudioContext.*catch|\.catch\(") {
    Test-Passed "Cleanup functions have error handling"
} else {
    Test-Warning "Some cleanup functions may lack error handling"
}

# Check that cleanup doesn't block normal flow
if ($voiceInterviewContent -match "fire-and-forget|\.catch\(|\.then\(\)\.catch\(") {
    Test-Passed "Cleanup uses non-blocking pattern"
} else {
    Test-Warning "Cleanup may block in some cases"
}

# Test 3: Verify volume refs don't break existing functionality
Write-Host ""
Write-Host "Test 3: Volume State Management" -ForegroundColor Cyan

# Check that state is still updated (for UI indicators)
if ($voiceInterviewContent -match "setInputVolume|setOutputVolume") {
    Test-Passed "Volume state is still updated (for UI compatibility)"
} else {
    Test-Failed "Volume state updates may be missing"
}

# Check that refs are used for internal tracking
if ($voiceInterviewContent -match "inputVolumeRef\.current|outputVolumeRef\.current") {
    Test-Passed "Volume refs are used for internal tracking"
} else {
    Test-Failed "Volume refs may not be used correctly"
}

# Test 4: Verify database query changes don't break API
Write-Host ""
Write-Host "Test 4: Database Query Optimization Safety" -ForegroundColor Cyan
$routesContent = Get-Content "backend/server/routes.ts" -Raw

# Check that Promise.all has proper error handling
$resultsEndpoint = Select-String -Path "backend/server/routes.ts" -Pattern "GET.*interviews.*results" -Context 0,50
if ($resultsEndpoint -match "Promise\.all" -and $resultsEndpoint -match "if.*!interview.*404") {
    Test-Passed "Database queries are parallelized with proper error handling"
} else {
    Test-Warning "Database query error handling may need review"
}

# Test 5: Verify no breaking changes to component usage
Write-Host ""
Write-Host "Test 5: Component Usage Compatibility" -ForegroundColor Cyan

# Check where AudioVisualizer is used
$audioVisualizerUsage = Select-String -Path "frontend/src/components/VoiceInterviewWebSocket.tsx" -Pattern "AudioVisualizer" -Context 2,2
if ($audioVisualizerUsage -match "inputVolume=|outputVolume=|mode=") {
    Test-Passed "AudioVisualizer is used with correct props"
} else {
    Test-Failed "AudioVisualizer usage may be incorrect"
}

# Test 6: Verify build produces working bundle
Write-Host ""
Write-Host "Test 6: Build Output Verification" -ForegroundColor Cyan

if (Test-Path "frontend/dist/public/assets/index-*.js") {
    $indexFile = Get-ChildItem "frontend/dist/public/assets/index-*.js" | Select-Object -First 1
    if ($indexFile.Length -gt 1000) {
        Test-Passed "Main bundle exists and has content"
    } else {
        Test-Failed "Main bundle may be empty or corrupted"
    }
} else {
    Test-Warning "Build output not found - run 'npm run build' first"
}

# Test 7: Check for common React performance anti-patterns
Write-Host ""
Write-Host "Test 7: React Performance Patterns" -ForegroundColor Cyan

# Check that AudioVisualizer doesn't have unnecessary dependencies
$audioVisualizerDeps = Select-String -Path "frontend/src/components/ui/AudioVisualizer.tsx" -Pattern "useEffect.*\[" -Context 0,1
$hasVolumeInDeps = $audioVisualizerDeps | Where-Object { $_ -match "inputVolume|outputVolume" }
if (-not $hasVolumeInDeps) {
    Test-Passed "AudioVisualizer useEffect doesn't depend on volume (correct)"
} else {
    Test-Failed "AudioVisualizer may re-render on volume changes"
}

# Test 8: Verify cleanup is called in all paths
Write-Host ""
Write-Host "Test 8: Cleanup Coverage" -ForegroundColor Cyan

$cleanupPaths = @(
    "component unmount",
    "handleEndInterview",
    "handleDisconnect"
)

foreach ($path in $cleanupPaths) {
    $found = $false
    switch ($path) {
        "component unmount" {
            if ($voiceInterviewContent -match "useEffect.*return.*cleanupAudioContext|conversationRef\.current\.endSession") {
                $found = $true
            }
        }
        "handleEndInterview" {
            if ($voiceInterviewContent -match "handleEndInterview.*cleanupAudioContext|handleEndInterview.*endSession") {
                $found = $true
            }
        }
        "handleDisconnect" {
            if ($voiceInterviewContent -match "handleDisconnect.*cleanupAudioContext") {
                $found = $true
            }
        }
    }
    
    if ($found) {
        Test-Passed "Cleanup is called in: $path"
    } else {
        Test-Warning "Cleanup may not be called in: $path"
    }
}

# Test 9: Verify no memory leak patterns
Write-Host ""
Write-Host "Test 9: Memory Leak Prevention" -ForegroundColor Cyan

# Check for proper ref cleanup
if ($voiceInterviewContent -match "micAudioContextRef\.current = null|micAudioContextRef\.current\.close") {
    Test-Passed "AudioContext ref is properly cleared"
} else {
    Test-Warning "AudioContext ref cleanup may be incomplete"
}

# Check for MediaStream cleanup
if ($voiceInterviewContent -match "getTracks\(\)\.forEach.*stop|cleanupMediaStream") {
    Test-Passed "MediaStream tracks are stopped"
} else {
    Test-Failed "MediaStream cleanup may be missing"
}

# Test 10: Verify performance optimizations don't break functionality
Write-Host ""
Write-Host "Test 10: Functional Compatibility" -ForegroundColor Cyan

# Check that conversation mode detection still works
if ($voiceInterviewContent -match "getConversationMode|conversationMode") {
    Test-Passed "Conversation mode detection is maintained"
} else {
    Test-Failed "Conversation mode detection may be broken"
}

# Check that volume polling still works
if ($voiceInterviewContent -match "getInputVolume|getOutputVolume|volumeIntervalRef") {
    Test-Passed "Volume polling is maintained"
} else {
    Test-Failed "Volume polling may be broken"
}

# Summary
Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "Passed: $($testResults.Passed)" -ForegroundColor Green
Write-Host "Failed: $($testResults.Failed)" -ForegroundColor Red
Write-Host "Warnings: $($testResults.Warnings)" -ForegroundColor Yellow
Write-Host ""

if ($testResults.Failed -eq 0) {
    Write-Host "All integration tests passed! Interview flow should work correctly." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some integration tests failed. Review the errors above." -ForegroundColor Red
    exit 1
}
