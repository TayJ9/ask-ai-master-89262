# Automatic Deployment Setup - Railway + Vercel

## Overview
This setup allows you to push to GitHub, and Railway + Vercel will automatically deploy your changes. No Replit needed!

## Architecture
- **GitHub**: Source code repository
- **Railway**: Backend deployment (auto-deploys from GitHub)
- **Vercel**: Frontend deployment (auto-deploys from GitHub)

## Setup Instructions

### Step 1: Connect Railway to GitHub

1. Go to [Railway Dashboard](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository: `TayJ9/ask-ai-master-89262`
4. **Important**: Set root directory to `backend`
5. Railway will auto-detect Node.js
6. Add environment variables (see Railway variables section below)
7. Railway will auto-deploy on every push to `main`

### Step 2: Connect Vercel to GitHub

1. Go to [Vercel Dashboard](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository: `TayJ9/ask-ai-master-89262`
4. **Important**: Set root directory to `frontend`
5. Framework Preset: **Vite**
6. Build Command: `npm run build`
7. Output Directory: `dist/public`
8. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = Your Railway backend URL
9. Click "Deploy"
10. Vercel will auto-deploy on every push to `main`

### Step 3: Set Up GitHub Token for Automatic Pushing

To enable automatic pushing from your local environment:

1. **Create GitHub Personal Access Token**:
   - Go to: https://github.com/settings/tokens/new
   - Name: "Auto Push Token"
   - Expiration: Choose your preference (90 days, 1 year, or no expiration)
   - Scopes: ✅ `repo` (all)
   - Click "Generate token"
   - **COPY THE TOKEN** (you won't see it again!)

2. **Store Token Securely**:
   - **Option A**: Add to your system environment variables
     ```bash
     export GITHUB_TOKEN=your_token_here
     ```
   - **Option B**: Use git credential helper
     ```bash
     git config --global credential.helper store
     # Then push once manually, enter token as password
     ```
   - **Option C**: Use SSH keys (more secure)
     ```bash
     # Generate SSH key
     ssh-keygen -t ed25519 -C "your_email@example.com"
     # Add to GitHub: Settings → SSH and GPG keys → New SSH key
     # Change remote to SSH
     git remote set-url origin git@github.com:TayJ9/ask-ai-master-89262.git
     ```

3. **Test Push**:
   ```bash
   git push origin main
   ```

## Railway Environment Variables

Set these in Railway Dashboard → Your Service → Variables:

| Variable | Required | Value |
|----------|----------|-------|
| `DATABASE_URL` | ✅ Yes | Auto-provided by Railway PostgreSQL |
| `JWT_SECRET` | ✅ Yes | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OPENAI_API_KEY` | ✅ Yes | Your OpenAI API key |
| `NODE_ENV` | ✅ Yes | `production` |
| `FRONTEND_URL` | ⚠️ Optional | Your Vercel URL (for CORS) |
| `PORT` | ❌ No | Auto-set by Railway |

## Vercel Environment Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Required | Value |
|----------|----------|-------|
| `NEXT_PUBLIC_API_URL` | ✅ Yes | Your Railway backend URL (e.g., `https://your-backend.up.railway.app`) |

## How Auto-Deployment Works

```
You Push to GitHub
       ↓
   GitHub Webhook
       ↓
   ┌─────────┬─────────┐
   ↓         ↓         ↓
Railway   Vercel   GitHub Actions
(Backend) (Frontend) (Verification)
```

1. **You push to `main` branch**
2. **GitHub receives the push**
3. **Railway webhook triggers** → Deploys backend from `backend/` directory
4. **Vercel webhook triggers** → Deploys frontend from `frontend/` directory
5. **GitHub Actions runs** → Verifies deployment structure

## Workflow

### Daily Development Workflow

1. **Make changes locally** (or in any editor)
2. **Commit changes**:
   ```bash
   git add .
   git commit -m "Your commit message"
   ```
3. **Push to GitHub**:
   ```bash
   git push origin main
   ```
4. **Wait 2-3 minutes**:
   - Railway deploys backend (~2-3 min)
   - Vercel deploys frontend (~1-2 min)
5. **Verify deployments**:
   - Check Railway dashboard for backend status
   - Check Vercel dashboard for frontend status

### No Manual Deployment Needed!

Once set up, you never need to:
- ❌ Manually deploy to Railway
- ❌ Manually deploy to Vercel
- ❌ Use Replit for deployment
- ❌ Run deployment commands

Just push to GitHub and both services auto-deploy!

## Verification

### Check Railway Deployment
1. Go to Railway dashboard
2. Check "Deployments" tab
3. Should show "Active" status
4. Check logs for any errors

### Check Vercel Deployment
1. Go to Vercel dashboard
2. Check "Deployments" tab
3. Should show "Ready" status
4. Visit your Vercel URL to test

### Test Connection
1. Visit your Vercel frontend URL
2. Try signing up/logging in
3. Check browser console for API errors
4. Verify WebSocket connection works (voice interview)

## Troubleshooting

### Railway not deploying
- ✅ Check Railway is connected to GitHub repo
- ✅ Verify root directory is set to `backend`
- ✅ Check Railway logs for errors
- ✅ Verify environment variables are set

### Vercel not deploying
- ✅ Check Vercel is connected to GitHub repo
- ✅ Verify root directory is set to `frontend`
- ✅ Check Vercel build logs
- ✅ Verify `NEXT_PUBLIC_API_URL` is set correctly

### Frontend can't connect to backend
- ✅ Verify `NEXT_PUBLIC_API_URL` matches Railway URL exactly
- ✅ Check Railway backend is running (visit Railway URL/health)
- ✅ Verify CORS is configured (Railway allows `*.vercel.app`)

## Benefits

✅ **Fully Automated**: Push to GitHub → Auto-deploy everywhere  
✅ **No Replit Dependency**: Work from any environment  
✅ **Version Control**: All changes tracked in GitHub  
✅ **Easy Rollback**: Revert commits in GitHub to rollback deployments  
✅ **CI/CD**: GitHub Actions can run tests before deployment  
✅ **Multiple Environments**: Easy to set up staging/production  

## Next Steps

1. ✅ Connect Railway to GitHub (root: `backend`)
2. ✅ Connect Vercel to GitHub (root: `frontend`)
3. ✅ Set environment variables in both platforms
4. ✅ Push your commits to GitHub
5. ✅ Verify auto-deployments work
6. ✅ Enjoy automated deployments! 🚀

