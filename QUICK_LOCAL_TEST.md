# Quick Local Pre-Deployment Test

## 🚀 Fastest Way to Verify (2 minutes)

Run this single command to test everything:

```powershell
.\test-local-deployment.ps1
```

This automated script checks:
- ✅ Dependencies installed
- ✅ Environment variables
- ✅ Linting
- ✅ Production build
- ✅ Backend health

## 📋 Manual Quick Test (5 minutes)

### Step 1: Build Test
```powershell
cd frontend
npm run build
```
**Expected**: Build completes without errors, creates `dist/public` folder

### Step 2: Preview Production Build
```powershell
npm run preview
```
**Expected**: Opens on http://localhost:4173, app loads without errors

### Step 3: Backend Test
```powershell
# In another terminal
cd backend
npm run dev

# Test health (in original terminal)
Invoke-WebRequest http://localhost:3001/health
```
**Expected**: Returns `{"status":"healthy",...}`

### Step 4: Full Stack Test
```powershell
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Open http://localhost:5173
# Test: Sign in, navigate, check console for errors
```
**Expected**: 
- App loads
- No console errors
- API calls work
- Navigation works

## ✅ If All Tests Pass

Your application is **100% ready for deployment**! 🎉

## 🚨 Common Issues

### Build Fails
- Check for TypeScript errors: `npx tsc --noEmit`
- Check for lint errors: `npm run lint`
- Verify all dependencies installed: `npm install`

### Backend Won't Start
- Check `.env` file exists and has required variables
- Verify port 3001 is available
- Check database connection

### Frontend Has Errors
- Clear browser cache (Ctrl+Shift+R)
- Check console for specific errors
- Verify API URLs are correct (not hardcoded localhost)

## 📝 Pre-Push Checklist

Before pushing to GitHub:

- [ ] `npm run build` succeeds
- [ ] `npm run preview` works
- [ ] Backend health check passes
- [ ] No console errors in browser
- [ ] All features tested manually
- [ ] Environment variables documented

---

**Remember**: If it works in production build mode locally, it will work in deployment! 🚀
