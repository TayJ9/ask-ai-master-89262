# Vercel + Railway Deployment Setup

## Architecture Overview
- **Frontend**: Deployed on Vercel (React/Vite)
- **Backend**: Deployed on Railway (Node.js/Express + PostgreSQL)

## Quick Setup Guide

### Step 1: Deploy Backend to Railway

1. **Connect Repository**
   - Go to [Railway](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Set root directory to `backend`

2. **Add PostgreSQL Database**
   - In Railway dashboard, click "New" → "Database" → "PostgreSQL"
   - Railway will auto-create `DATABASE_URL` variable

3. **Set Environment Variables** (Railway → Variables tab)
   ```
   JWT_SECRET=[generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"]
   DATABASE_URL=[auto-provided by Railway PostgreSQL]
   OPENAI_API_KEY=sk-[your OpenAI API key]
   NODE_ENV=production
   FRONTEND_URL=[your Vercel URL, e.g., https://your-app.vercel.app]
   ```

4. **Deploy**
   - Railway will auto-deploy on push to main
   - Note your Railway backend URL (e.g., `https://your-backend.up.railway.app`)

### Step 2: Deploy Frontend to Vercel

1. **Connect Repository**
   - Go to [Vercel](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Set root directory to `frontend`

2. **Configure Build Settings**
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist/public`
   - Install Command: `npm install`

3. **Set Environment Variables** (Vercel → Settings → Environment Variables)
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
   ```
   ⚠️ **Important**: Replace `your-backend.up.railway.app` with your actual Railway backend URL

4. **Deploy**
   - Vercel will auto-deploy on push to main
   - Your frontend will be live at `https://your-app.vercel.app`

### Step 3: Verify Connection

1. **Test API Connection**
   - Visit your Vercel frontend URL
   - Open browser console (F12)
   - Check for any CORS or connection errors
   - Try signing up/logging in

2. **Test WebSocket**
   - Start a voice interview
   - Check browser console for WebSocket connection
   - Should connect to `wss://your-backend.up.railway.app/voice`

## Environment Variables Summary

### Railway (Backend)
| Variable | Required | Value |
|----------|----------|-------|
| `DATABASE_URL` | ✅ Yes | Auto-provided by Railway PostgreSQL |
| `JWT_SECRET` | ✅ Yes | Generate secure random string |
| `OPENAI_API_KEY` | ✅ Yes | Your OpenAI API key |
| `NODE_ENV` | ✅ Yes | `production` |
| `FRONTEND_URL` | ⚠️ Optional | Your Vercel URL (for CORS) |
| `PORT` | ❌ No | Auto-set by Railway |

### Vercel (Frontend)
| Variable | Required | Value |
|----------|----------|-------|
| `NEXT_PUBLIC_API_URL` | ✅ Yes | Your Railway backend URL |

## How It Works

### API Requests
```
Vercel Frontend → Railway Backend
https://app.vercel.app → https://backend.up.railway.app/api/*
```

### WebSocket Connections
```
Vercel Frontend → Railway Backend WebSocket
wss://backend.up.railway.app/voice
```

### CORS Configuration
- Railway backend automatically allows:
  - All `*.vercel.app` domains
  - Domain specified in `FRONTEND_URL`
  - Localhost for development

## Troubleshooting

### Frontend can't connect to backend
- ✅ Verify `NEXT_PUBLIC_API_URL` is set correctly in Vercel
- ✅ Check Railway backend is running (visit Railway URL/health)
- ✅ Check Railway logs for errors
- ✅ Verify CORS is allowing your Vercel domain

### WebSocket connection fails
- ✅ Ensure WebSocket URL uses `wss://` (secure WebSocket)
- ✅ Check Railway backend WebSocket endpoint is accessible
- ✅ Verify `/voice` path is correct
- ✅ Check Railway logs for WebSocket errors

### CORS errors
- ✅ Add your Vercel URL to Railway `FRONTEND_URL` variable
- ✅ Or ensure your domain matches `*.vercel.app` pattern
- ✅ Check Railway backend CORS logs

### Authentication errors
- ✅ Verify `JWT_SECRET` is set in Railway
- ✅ Check Railway logs for JWT errors
- ✅ Ensure tokens are being sent in requests

## Auto-Deployment

Both Railway and Vercel auto-deploy on push to `main` branch:
- **Railway**: Monitors `backend/` folder
- **Vercel**: Monitors `frontend/` folder

After pushing to GitHub:
1. Railway will deploy backend changes (~2-3 minutes)
2. Vercel will deploy frontend changes (~1-2 minutes)
3. Both services will be updated automatically

## Local Development

For local development, create `.env.local` in `frontend/`:
```
VITE_API_URL=http://localhost:5000
```

Then run:
```bash
# Terminal 1: Backend
cd backend
npm install
npm start

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

## Support

- Railway Docs: https://docs.railway.app
- Vercel Docs: https://vercel.com/docs
- Project Issues: Check GitHub issues

