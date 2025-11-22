# Railway Deployment Guide

## ✅ Files Ready for Deployment

Your backend is now ready for Railway deployment with:

1. **`package.json`** - Complete with all dependencies and start script
2. **`server.js`** - JavaScript fallback server (ES modules)
3. **`server/index.ts`** - Main TypeScript server (recommended)

## 🚀 Railway Deployment Steps

### Step 1: Connect Your Repository
1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo" (or your Git provider)
4. Choose your repository

### Step 2: Configure Railway Settings

**Root Directory:** `backend`

**Build Command:** 
```bash
npm install
```

**Start Command:**
```bash
npm start
```

**Environment Variables** (set in Railway dashboard):
```
PORT=5000                    # Railway sets this automatically
DATABASE_URL=...             # Your PostgreSQL database URL
JWT_SECRET=...               # A secure random string for JWT tokens
OPENAI_API_KEY=...           # Your OpenAI API key
NODE_ENV=production          # Set to production
```

### Step 3: Deploy

Railway will:
1. Install dependencies (`npm install`)
2. Run the start script (`npm start` which runs `tsx server/index.ts`)
3. Your server will be available at the Railway-provided URL

## 📋 What Railway Detects

Railway automatically detects:
- ✅ **Node.js project** (via `package.json`)
- ✅ **Start script** (`"start": "tsx server/index.ts"`)
- ✅ **Dependencies** (all listed in `package.json`)
- ✅ **Node version** (via `engines.node` field)

## 🔧 How It Works

1. **Main Server**: `server/index.ts` (TypeScript)
   - Uses `tsx` to run TypeScript directly (no compilation needed)
   - Full-featured server with all API routes
   - Serves frontend static files in production

2. **Fallback Server**: `server.js` (JavaScript)
   - Simple Express + WebSocket server
   - Used if TypeScript server has issues
   - Basic health check and WebSocket support

## 🧪 Testing Locally

Before deploying, test locally:

```bash
cd backend
npm install
npm start
```

Visit `http://localhost:5000/health` to verify it's running.

## 📝 Package.json Details

The `package.json` includes:

- **Main entry**: `server/index.ts` (TypeScript server)
- **Start script**: Runs TypeScript server with `tsx`
- **All dependencies**: express, ws, dotenv, openai, multer, cors, etc.
- **Node version**: Requires Node.js >= 18.0.0

## 🎯 Key Features

✅ Express HTTP server  
✅ WebSocket support  
✅ Environment variable configuration  
✅ Health check endpoint  
✅ Error handling  
✅ Railway-ready configuration  

## 🆘 Troubleshooting

**Issue**: Railway can't detect the start command
- **Solution**: Make sure `package.json` has a `"start"` script

**Issue**: Dependencies not installing
- **Solution**: Check that all dependencies in `package.json` have valid version numbers

**Issue**: Server crashes on startup
- **Solution**: Check Railway logs and ensure all required environment variables are set

**Issue**: Port already in use
- **Solution**: Railway sets PORT automatically - don't hardcode it

## ✨ Next Steps

1. Deploy to Railway using the steps above
2. Set environment variables in Railway dashboard
3. Build frontend and ensure backend can serve it (or deploy frontend separately)
4. Test your deployed API endpoints

