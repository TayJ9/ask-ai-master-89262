# Deployment Checklist

## Pre-Deployment Setup

### Vercel Frontend
1. **Environment Variable Required:**
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-backend.up.railway.app
   ```
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add `NEXT_PUBLIC_API_URL` with your Railway backend URL
   - Ensure it's set for Production, Preview, and Development environments

2. **Verify Build:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```
   - Should complete without errors
   - Check that `dist/public` directory is created

### Railway Backend
1. **Environment Variables Required:**
   ```
   DATABASE_URL=postgresql://... (from Neon)
   JWT_SECRET=your-secret-key-here
   OPENAI_API_KEY=sk-... (or OPEN_API_KEY)
   NODE_ENV=production
   ```
   
2. **Optional Environment Variables:**
   ```
   FRONTEND_URL=https://your-vercel-app.vercel.app
   ```
   - Helps with CORS configuration
   - Not strictly required if CORS allows all origins

3. **Verify Deployment:**
   - Check Railway logs for successful startup
   - Test health endpoint: `https://your-backend.up.railway.app/health`
   - Should return: `{"status":"healthy","database":"connected"}`

## Post-Deployment Testing

### 1. Frontend-Backend Connection
- [ ] Open frontend URL in browser
- [ ] Check browser console for any CORS errors
- [ ] Verify API calls are going to correct backend URL
- [ ] Check Network tab - all `/api/*` requests should go to Railway backend

### 2. Authentication Flow
- [ ] Sign up with new account
- [ ] Verify account creation success
- [ ] Sign out
- [ ] Sign in with created account
- [ ] Verify token is stored in localStorage
- [ ] Test token expiration (wait or manually expire)

### 3. Core Features
- [ ] Resume upload (PDF)
- [ ] Resume text paste
- [ ] Start interview session
- [ ] Submit interview responses
- [ ] Complete interview
- [ ] View session history
- [ ] View feedback and scores

### 4. Error Handling
- [ ] Test with backend offline (should show friendly error)
- [ ] Test with invalid credentials
- [ ] Test with expired token
- [ ] Test with network timeout
- [ ] Verify all errors show user-friendly messages

### 5. CORS Verification
- [ ] Check browser console for CORS errors
- [ ] Verify preflight OPTIONS requests succeed
- [ ] Test from different origins if applicable

## Troubleshooting

### Frontend shows "Unable to connect to server"
1. Check `NEXT_PUBLIC_API_URL` is set correctly in Vercel
2. Verify Railway backend is running (check logs)
3. Test backend URL directly: `curl https://your-backend.up.railway.app/health`
4. Check CORS configuration in backend

### CORS Errors
1. Verify `FRONTEND_URL` is set in Railway (optional but recommended)
2. Check backend CORS middleware allows your Vercel domain
3. Verify preflight OPTIONS requests are handled

### Authentication Errors
1. Check `JWT_SECRET` is set in Railway
2. Verify token is being sent in Authorization header
3. Check backend logs for authentication errors

### Database Connection Errors
1. Verify `DATABASE_URL` is correct in Railway
2. Check Neon database is running
3. Verify database connection in backend logs

## Manual Steps Required

### 1. Set Environment Variables
- **Vercel**: Add `NEXT_PUBLIC_API_URL` in dashboard
- **Railway**: Add `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`

### 2. Deploy Backend First
- Railway backend must be deployed and running before frontend
- Frontend needs backend URL for `NEXT_PUBLIC_API_URL`

### 3. Update Frontend After Backend Deployment
- Get Railway backend URL
- Set `NEXT_PUBLIC_API_URL` in Vercel
- Redeploy frontend (or wait for auto-deploy)

## Verification Commands

### Test Backend Health
```bash
curl https://your-backend.up.railway.app/health
```

### Test Frontend API Connection
```bash
# In browser console on frontend:
fetch('/api/auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@test.com', password: 'test' })
}).then(r => r.json()).then(console.log)
```

### Check Environment Variables
```bash
# Frontend (Vercel)
# Check in Vercel Dashboard → Settings → Environment Variables

# Backend (Railway)
# Check in Railway Dashboard → Variables tab
```

## Success Criteria

✅ Frontend loads without errors
✅ All API calls go to Railway backend
✅ Authentication works (sign up, sign in, sign out)
✅ Resume upload works
✅ Interview sessions can be created and completed
✅ Session history displays correctly
✅ No CORS errors in browser console
✅ Error messages are user-friendly
✅ Backend logs show successful requests

## Next Steps After Deployment

1. **Monitor Logs**
   - Railway: Check backend logs for errors
   - Vercel: Check function logs if using serverless

2. **Set Up Monitoring**
   - Consider adding error tracking (Sentry, etc.)
   - Set up uptime monitoring
   - Monitor API response times

3. **Performance Optimization**
   - Enable CDN caching for static assets
   - Optimize database queries
   - Add request caching where appropriate

4. **Security Hardening**
   - Review CORS configuration
   - Consider migrating to HTTP-only cookies
   - Add rate limiting
   - Set up security headers

5. **Documentation**
   - Document API endpoints
   - Create user guide
   - Document deployment process

