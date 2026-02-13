# Test Script: Verify Interview Results Save Flow
# Tests the complete flow: sign in -> save interview -> fetch results -> verify evaluation

$ErrorActionPreference = "Continue"
$BASE_URL = "http://localhost:3001"
$testsPassed = 0
$testsFailed = 0

function Write-TestResult($name, $passed, $detail) {
    if ($passed) {
        Write-Host "  PASS: $name" -ForegroundColor Green
        if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
        $script:testsPassed++
    } else {
        Write-Host "  FAIL: $name" -ForegroundColor Red
        if ($detail) { Write-Host "        $detail" -ForegroundColor Yellow }
        $script:testsFailed++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Interview Results Save Flow Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---- Test 1: Health Check ----
Write-Host "[1/7] Health Check" -ForegroundColor White
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health" -Method GET -TimeoutSec 5
    Write-TestResult "Backend is healthy" $true "Status: $($health.status)"
} catch {
    Write-TestResult "Backend is healthy" $false "Error: $($_.Exception.Message)"
    Write-Host "`nBackend is not running. Aborting tests." -ForegroundColor Red
    exit 1
}

# ---- Test 2: Sign In (get auth token) ----
Write-Host ""
Write-Host "[2/7] Sign In" -ForegroundColor White
$authToken = $null
try {
    $signInBody = @{ email = "test123@gmail.com"; password = "Test123" } | ConvertTo-Json
    $signInResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/signin" -Method POST -Body $signInBody -ContentType "application/json" -TimeoutSec 5
    $authToken = $signInResponse.token
    $userId = $signInResponse.user.id
    Write-TestResult "Sign in successful" ($null -ne $authToken) "Token: $($authToken.Substring(0, [Math]::Min(20, $authToken.Length)))... | UserId: $userId"
} catch {
    Write-TestResult "Sign in successful" $false "Error: $($_.Exception.Message). Creating test user..."
    
    # Try to create test user first
    try {
        $signUpBody = @{ email = "test123@gmail.com"; password = "Test123"; fullName = "Test User" } | ConvertTo-Json
        $signUpResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/signup" -Method POST -Body $signUpBody -ContentType "application/json" -TimeoutSec 5
        $authToken = $signUpResponse.token
        $userId = $signUpResponse.user.id
        Write-Host "        Created test user and signed in" -ForegroundColor DarkGray
    } catch {
        Write-TestResult "Create test user fallback" $false "Error: $($_.Exception.Message)"
        Write-Host "`nCannot authenticate. Aborting tests." -ForegroundColor Red
        exit 1
    }
}

$headers = @{ "Authorization" = "Bearer $authToken" }

# ---- Test 3: Save Interview (simulates frontend POST /api/save-interview) ----
Write-Host ""
Write-Host "[3/7] Save Interview (/api/save-interview)" -ForegroundColor White
$sessionId = [guid]::NewGuid().ToString()
$conversationId = "test-conv-" + [guid]::NewGuid().ToString().Substring(0, 8)
$interviewId = $null

try {
    $saveBody = @{
        client_session_id = $sessionId
        conversation_id = $conversationId
        ended_by = "user"
        transcript = "Interviewer: Tell me about yourself.`nCandidate: I am a computer science student at the College of Charleston. I have experience in web development with React and Node.js. I also completed an internship at a local tech company where I worked on their frontend team.`nInterviewer: What is your greatest strength?`nCandidate: My greatest strength is my ability to learn quickly and adapt to new technologies. For example, when my team needed to switch from Angular to React, I took the initiative to learn React in two weeks and then helped onboard the rest of the team.`nInterviewer: Describe a challenging project you worked on.`nCandidate: In my software engineering class, we built a full-stack application for a local nonprofit. The challenge was integrating a payment system with limited documentation. I researched the API, created a working prototype, and then collaborated with my team to integrate it into the main application. We delivered on time and the client was very satisfied."
    } | ConvertTo-Json

    $saveResponse = Invoke-RestMethod -Uri "$BASE_URL/api/save-interview" -Method POST -Body $saveBody -ContentType "application/json" -Headers $headers -TimeoutSec 10
    $interviewId = $saveResponse.interviewId
    
    Write-TestResult "Save interview returns interviewId" ($null -ne $interviewId) "interviewId: $interviewId"
    Write-TestResult "Save interview returns success" ($saveResponse.success -eq $true) "success: $($saveResponse.success)"
    Write-TestResult "Save interview returns sessionId" ($saveResponse.sessionId -eq $sessionId) "sessionId: $($saveResponse.sessionId)"
} catch {
    Write-TestResult "Save interview endpoint" $false "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
        Write-Host "        Response body: $errBody" -ForegroundColor Yellow
    }
}

# ---- Test 4: Fetch Results Immediately (should show pending/processing) ----
Write-Host ""
Write-Host "[4/7] Fetch Results Immediately (/api/interviews/:id/results)" -ForegroundColor White
if ($interviewId) {
    try {
        $resultsResponse = Invoke-RestMethod -Uri "$BASE_URL/api/interviews/$interviewId/results" -Method GET -Headers $headers -TimeoutSec 10
        
        Write-TestResult "Results endpoint returns interview" ($null -ne $resultsResponse.interview) "interview.id: $($resultsResponse.interview.id)"
        Write-TestResult "Interview has transcript" ($null -ne $resultsResponse.interview.transcript) "transcript length: $($resultsResponse.interview.transcript.Length) chars"
        Write-TestResult "Interview status is set" ($resultsResponse.interview.status -ne $null) "status: $($resultsResponse.interview.status)"
        
        $evalStatus = if ($resultsResponse.evaluation) { $resultsResponse.evaluation.status } else { "null (not created yet)" }
        Write-TestResult "Evaluation status returned" $true "evaluation status: $evalStatus"
        Write-TestResult "Metadata includes userId" ($resultsResponse.metadata.userId -eq $userId) "userId: $($resultsResponse.metadata.userId)"
    } catch {
        Write-TestResult "Fetch results endpoint" $false "Error: $($_.Exception.Message)"
    }
} else {
    Write-TestResult "Fetch results (skipped)" $false "No interviewId available from save step"
}

# ---- Test 5: Poll for Evaluation Completion ----
Write-Host ""
Write-Host "[5/7] Poll for Evaluation Completion (max 45s)" -ForegroundColor White
if ($interviewId) {
    $evalComplete = $false
    $pollCount = 0
    $maxPolls = 15  # 15 polls * 3 seconds = 45 seconds max
    
    while (-not $evalComplete -and $pollCount -lt $maxPolls) {
        Start-Sleep -Seconds 3
        $pollCount++
        
        try {
            $pollResponse = Invoke-RestMethod -Uri "$BASE_URL/api/interviews/$interviewId/results" -Method GET -Headers $headers -TimeoutSec 10
            $currentStatus = if ($pollResponse.evaluation) { $pollResponse.evaluation.status } else { "pending" }
            Write-Host "        Poll $pollCount/$maxPolls - evaluation status: $currentStatus" -ForegroundColor DarkGray
            
            if ($currentStatus -eq "complete") {
                $evalComplete = $true
                Write-TestResult "Evaluation completed" $true "Completed after $($pollCount * 3) seconds"
                
                # Verify evaluation data
                $hasScore = $pollResponse.evaluation.overallScore -ne $null
                Write-TestResult "Has overall score" $hasScore "Score: $($pollResponse.evaluation.overallScore)"
                
                $evalData = $pollResponse.evaluation.evaluation
                $hasQuestions = ($evalData -ne $null) -and ($evalData.questions -ne $null) -and ($evalData.questions.Count -gt 0)
                Write-TestResult "Has question-level feedback" $hasQuestions "Questions evaluated: $($evalData.questions.Count)"
                
                if ($hasQuestions) {
                    foreach ($q in $evalData.questions) {
                        $hasAllFields = ($q.question -ne $null) -and ($q.answer -ne $null) -and ($q.score -ne $null) -and ($q.strengths -ne $null) -and ($q.improvements -ne $null)
                        Write-TestResult "  Q: '$($q.question.Substring(0, [Math]::Min(50, $q.question.Length)))...'" $hasAllFields "Score: $($q.score)/100"
                    }
                }
                
                $hasOverallStrengths = ($evalData.overall_strengths -ne $null) -and ($evalData.overall_strengths.Count -gt 0)
                $hasOverallImprovements = ($evalData.overall_improvements -ne $null) -and ($evalData.overall_improvements.Count -gt 0)
                Write-TestResult "Has overall strengths" $hasOverallStrengths "Count: $($evalData.overall_strengths.Count)"
                Write-TestResult "Has overall improvements" $hasOverallImprovements "Count: $($evalData.overall_improvements.Count)"
            }
            elseif ($currentStatus -eq "failed") {
                $evalComplete = $true
                Write-TestResult "Evaluation completed (failed)" $false "Error: $($pollResponse.evaluation.error)"
            }
        } catch {
            Write-Host "        Poll $pollCount error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    if (-not $evalComplete) {
        Write-TestResult "Evaluation completed within timeout" $false "Timed out after $($pollCount * 3) seconds"
    }
} else {
    Write-TestResult "Poll for evaluation (skipped)" $false "No interviewId available"
}

# ---- Test 6: Lookup by Session ID (fallback path) ----
Write-Host ""
Write-Host "[6/7] Lookup by Session ID (/api/interviews/by-session/:sessionId)" -ForegroundColor White
try {
    $sessionLookup = Invoke-RestMethod -Uri "$BASE_URL/api/interviews/by-session/$sessionId" -Method GET -Headers $headers -TimeoutSec 10
    $foundId = $sessionLookup.interviewId
    Write-TestResult "Session lookup returns interviewId" ($foundId -eq $interviewId) "Found: $foundId (expected: $interviewId)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-TestResult "Session lookup returns interviewId" $false "Session not found (404) - session record may not have been created"
    } else {
        Write-TestResult "Session lookup endpoint" $false "Error: $($_.Exception.Message)"
    }
}

# ---- Test 7: Idempotency - Save same interview again ----
Write-Host ""
Write-Host "[7/7] Idempotency - Save Same Interview Again" -ForegroundColor White
if ($interviewId) {
    try {
        $saveBody2 = @{
            client_session_id = $sessionId
            conversation_id = $conversationId
            ended_by = "user"
        } | ConvertTo-Json

        $save2Response = Invoke-RestMethod -Uri "$BASE_URL/api/save-interview" -Method POST -Body $saveBody2 -ContentType "application/json" -Headers $headers -TimeoutSec 10
        $save2InterviewId = $save2Response.interviewId
        
        Write-TestResult "Idempotent save returns same interviewId" ($save2InterviewId -eq $interviewId) "Got: $save2InterviewId (expected: $interviewId)"
        Write-TestResult "Idempotent save returns success" ($save2Response.success -eq $true) "success: $($save2Response.success)"
    } catch {
        Write-TestResult "Idempotent save" $false "Error: $($_.Exception.Message)"
    }
} else {
    Write-TestResult "Idempotency test (skipped)" $false "No interviewId available"
}

# ---- Summary ----
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Passed: $testsPassed" -ForegroundColor Green
Write-Host "  Failed: $testsFailed" -ForegroundColor $(if ($testsFailed -gt 0) { "Red" } else { "Green" })
Write-Host "  Total:  $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "$testsFailed TEST(S) FAILED" -ForegroundColor Red
}
