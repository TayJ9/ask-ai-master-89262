# Test signin directly
$body = @{
    email = 'test123@gmail.com'
    password = 'Test123'
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/signin" -Method POST -Body $body -ContentType "application/json"
    Write-Host "✅ Sign in successful!" -ForegroundColor Green
    Write-Host "Token: $($response.token.Substring(0, 20))..." -ForegroundColor Green
    Write-Host "User: $($response.user.email)" -ForegroundColor Green
} catch {
    Write-Host "❌ Sign in failed!" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $responseBody = $reader.ReadToEnd()
    Write-Host "Error: $responseBody" -ForegroundColor Red
}
