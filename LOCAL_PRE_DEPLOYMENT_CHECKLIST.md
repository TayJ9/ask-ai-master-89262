# Local Pre-Deployment Verification Checklist

This guide ensures your application is 100% ready for deployment by testing everything locally first.

## 🎯 Quick Verification (5 minutes)

### Step 1: Build Test
```powershell
# Test frontend production build
cd frontend
npm run build

# If build succeeds, test preview
npm run preview
# Open http://localhost:4173 and verify it works
```

### Step 2: Backend Health Check
```powershell
# In another terminal
cd backend
npm run dev

# Test health endpoint
Invoke-WebRequest -Uri http://localhost:3001/health -UseBasicParsing
# Should return: {"status":"healthy",...}
```

### Step 3: Full Stack Test
```powershell
# Start both servers
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Open http://localhost:5173
# Test: Sign in, navigate pages, check API calls work
```

## 📋 Complete Pre-Deployment Checklist

### ✅ 1. Dependency Verification

```powershell
# Check for outdated or vulnerable packages
cd frontend
npm audit
npm outdated

cd ../backend
npm audit
npm outdated
```

**Action Items:**
- [ ] No critical vulnerabilities
- [ ] All dependencies installed (`npm install` completed)
- [ ] React versions match (18.2.0)
- [ ] No peer dependency warnings

### ✅ 2. Environment Variables Check

**Backend Required Variables:**
```powershell
# Check backend/.env exists and has:
# - DATABASE_URL
# - JWT_SECRET
# - OPENAI_API_KEY
# - ELEVENLABS_API_KEY
# - PORT (optional, defaults to 5000)

cd backend
Get-Content .env | Select-String -Pattern "DATABASE_URL|JWT_SECRET|OPENAI_API_KEY|ELEVENLABS_API_KEY"
```

**Frontend Environment:**
- [ ] No hardcoded API URLs (should use environment variables)
- [ ] VITE_API_URL or NEXT_PUBLIC_API_URL set if needed

### ✅ 3. Build Verification

**Frontend Production Build:**
```powershell
cd frontend
npm run build

# Check for:
# - No build errors
# - dist/public folder created
# - No console errors during build
# - Bundle size reasonable (< 5MB total)
```

**Backend Build:**
```powershell
cd backend
npm run build  # If you have a build step
# Or just verify TypeScript compiles:
npx tsc --noEmit
```

### ✅ 4. TypeScript/ESLint Checks

```powershell
# Frontend
cd frontend
npm run lint

# Backend (if configured)
cd ../backend
npx tsc --noEmit  # Type check without emitting files
```

**Action Items:**
- [ ] No TypeScript errors
- [ ] No ESLint errors (or only acceptable warnings)
- [ ] No unused imports or variables

### ✅ 5. Database Connection Test

```powershell
cd backend
npm run dev

# In another terminal, test database:
# Check backend logs for: "✅ Database connection: OK"
# Or test an endpoint that uses database:
Invoke-WebRequest -Uri http://localhost:3001/api/auth/signin -Method POST -Body '{"email":"test@test.com","password":"test"}' -ContentType "application/json"
```

**Action Items:**
- [ ] Database connects successfully
- [ ] Schema is up to date
- [ ] Can perform CRUD operations

### ✅ 6. API Endpoint Testing

Create a test script or use these commands:

```powershell
# Health check
Invoke-WebRequest -Uri http://localhost:3001/health

# Test signup (if you have test credentials)
$body = @{
    email = "test@example.com"
    password = "testpassword123"
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:3001/api/auth/signup -Method POST -Body $body -ContentType "application/json"

# Test signin
$signinBody = @{
    email = "test@example.com"
    password = "testpassword123"
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:3001/api/auth/signin -Method POST -Body $signinBody -ContentType "application/json"
```

**Action Items:**
- [ ] All critical endpoints respond
- [ ] Authentication works
- [ ] CORS headers present
- [ ] Error handling works (test invalid requests)

### ✅ 7. Frontend Feature Testing

**Manual Testing Checklist:**
- [ ] App loads without errors
- [ ] Navigation works (all routes)
- [ ] Sign in/Sign up forms work
- [ ] API calls succeed (check Network tab)
- [ ] Animations work (framer-motion)
- [ ] UI components render correctly (Radix UI)
- [ ] No console errors
- [ ] No console warnings (or acceptable ones)
- [ ] Responsive design works (mobile/tablet/desktop)
- [ ] Dark mode works (if applicable)

### ✅ 8. WebSocket/Real-time Features

```powershell
# Test WebSocket connection (if applicable)
# Check backend logs for WebSocket initialization:
# "✅ WebSocket server initialized on path /voice"
```

**Action Items:**
- [ ] WebSocket connects
- [ ] Real-time features work (voice interview, etc.)
- [ ] Connection errors handled gracefully

### ✅ 9. Production Build Preview

```powershell
# Build frontend
cd frontend
npm run build

# Preview production build
npm run preview

# Open http://localhost:4173
# Test everything as if it's production
```

**Action Items:**
- [ ] Production build works
- [ ] All assets load correctly
- [ ] API calls work (may need to set VITE_API_URL)
- [ ] No development-only code running

### ✅ 10. Error Handling Verification

**Test Error Scenarios:**
- [ ] Network errors (disconnect internet, test offline)
- [ ] Invalid API responses
- [ ] 404/500 errors from backend
- [ ] Invalid form inputs
- [ ] Missing environment variables

**Action Items:**
- [ ] Error boundaries catch errors
- [ ] User-friendly error messages shown
- [ ] No unhandled promise rejections
- [ ] Logging works for debugging

### ✅ 11. Performance Check

```powershell
# Check bundle sizes
cd frontend
npm run build
# Check dist/public folder sizes
Get-ChildItem -Recurse dist/public | Measure-Object -Property Length -Sum
```

**Action Items:**
- [ ] Initial bundle < 500KB (gzipped)
- [ ] Total assets < 5MB
- [ ] Images optimized
- [ ] Lazy loading works (if implemented)
- [ ] No memory leaks (check DevTools Performance)

### ✅ 12. Security Checks

**Action Items:**
- [ ] No API keys in frontend code
- [ ] No sensitive data in console logs
- [ ] HTTPS enforced in production (Railway/Vercel)
- [ ] CORS configured correctly
- [ ] Input validation on forms
- [ ] XSS protection (React escapes by default)

### ✅ 13. Browser Compatibility

**Test in:**
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (if possible)
- [ ] Mobile browser (Chrome mobile)

**Action Items:**
- [ ] No browser-specific errors
- [ ] CSS works in all browsers
- [ ] JavaScript features supported

### ✅ 14. Environment-Specific Testing

**Local Development:**
```powershell
# Test with NODE_ENV=development
$env:NODE_ENV="development"
cd backend
npm run dev
```

**Production Simulation:**
```powershell
# Test with NODE_ENV=production
$env:NODE_ENV="production"
cd backend
npm start
```

**Action Items:**
- [ ] Development mode works
- [ ] Production mode works
- [ ] Environment variables load correctly
- [ ] Static file serving works (production)

## 🚀 Automated Pre-Deployment Script

Create a PowerShell script to automate most checks:

```powershell
# pre-deployment-check.ps1
Write-Host "🔍 Running Pre-Deployment Checks..." -ForegroundColor Cyan

# 1. Check dependencies
Write-Host "`n1️⃣ Checking dependencies..." -ForegroundColor Yellow
cd frontend
npm audit --audit-level=moderate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Dependency vulnerabilities found!" -ForegroundColor Red
    exit 1
}

# 2. Build frontend
Write-Host "`n2️⃣ Building frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    exit 1
}

# 3. Lint check
Write-Host "`n3️⃣ Running linter..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Linter warnings found (continuing...)" -ForegroundColor Yellow
}

# 4. Backend health check
Write-Host "`n4️⃣ Testing backend..." -ForegroundColor Yellow
cd ../backend
# Start backend in background, test, then stop
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
Start-Sleep -Seconds 5
try {
    $response = Invoke-WebRequest -Uri http://localhost:3001/health -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend health check passed" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Backend health check failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ All checks passed! Ready for deployment." -ForegroundColor Green
```

## 📝 Final Pre-Deployment Checklist

Before pushing to production:

- [ ] All tests pass locally
- [ ] Production build succeeds
- [ ] No console errors
- [ ] All environment variables documented
- [ ] Database migrations applied (if any)
- [ ] API endpoints tested
- [ ] Frontend features tested
- [ ] Error handling verified
- [ ] Performance acceptable
- [ ] Security checks passed
- [ ] Browser compatibility verified
- [ ] Documentation updated (if needed)

## 🎯 Quick Test Command

Run this single command to test the most critical items:

```powershell
cd frontend && npm run build && npm run preview &
cd ../backend && npm run dev &
Start-Sleep 3
Invoke-WebRequest http://localhost:3001/health
Invoke-WebRequest http://localhost:4173
Write-Host "✅ Quick test complete - check both URLs in browser"
```

## 💡 Pro Tips

1. **Use Production Build Locally**: Always test `npm run preview` before deploying
2. **Check Network Tab**: Verify API calls use correct URLs (not localhost in production)
3. **Test Error States**: Intentionally break things to ensure error handling works
4. **Monitor Console**: Keep DevTools open during testing
5. **Test on Different Devices**: Use browser DevTools device emulation
6. **Check Logs**: Review backend logs for any warnings or errors
7. **Environment Variables**: Document all required env vars for deployment

## 🚨 Common Issues to Check

- [ ] Hardcoded `localhost` URLs in frontend code
- [ ] Missing environment variables
- [ ] Database connection strings incorrect
- [ ] CORS configuration too restrictive
- [ ] Missing API keys or secrets
- [ ] Build errors in production mode
- [ ] Asset paths incorrect (404s on images/fonts)
- [ ] WebSocket URLs incorrect for production

---

**Remember**: If it works locally in production build mode, it should work in deployment! 🎉
