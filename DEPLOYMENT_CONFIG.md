# Deployment Configuration

## Architecture
- **Backend**: Railway (Node.js/Express server)
- **Frontend**: Vercel (React/Vite application)

## Environment Variables

### Vercel Frontend Environment Variables

Add these in Vercel Dashboard → Project Settings → Environment Variables:

#### Required:
- `NEXT_PUBLIC_API_URL` or `VITE_API_URL` - Your Railway backend URL
  - Example: `https://your-backend-name.up.railway.app`
  - This is used for API calls and WebSocket connections

#### Optional (for development):
- `VITE_API_URL` - Alternative name for API URL (Vite convention)

### Railway Backend Environment Variables

Add these in Railway Dashboard → Your Service → Variables:

#### Required:
- `DATABASE_URL` - PostgreSQL connection string (auto-provided by Railway PostgreSQL)
- `JWT_SECRET` - Secret key for JWT tokens (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `OPENAI_API_KEY` - Your OpenAI API key
- `NODE_ENV` - Set to `production`
- `PORT` - Auto-set by Railway (don't override)

#### Optional:
- `FRONTEND_URL` - Your Vercel frontend URL (for CORS)
  - Example: `https://your-app.vercel.app`
  - If not set, Railway will allow all Vercel domains automatically

## How It Works

### API Requests
1. Frontend (Vercel) makes API calls to Railway backend
2. Uses `NEXT_PUBLIC_API_URL` or `VITE_API_URL` environment variable
3. All API calls go through `/api/*` endpoints on Railway

### WebSocket Connections
1. Frontend connects to Railway backend WebSocket endpoint
2. WebSocket URL: `wss://your-railway-backend.up.railway.app/voice`
3. Automatically uses the same backend URL as API calls

### CORS Configuration
- Railway backend automatically allows:
  - All `*.vercel.app` domains
  - Localhost for development
  - Any origin specified in `FRONTEND_URL`

## Setup Steps

### 1. Deploy Backend to Railway
1. Connect your GitHub repo to Railway
2. Select the `backend` folder as the root
3. Railway will auto-detect Node.js
4. Add environment variables (see above)
5. Deploy

### 2. Deploy Frontend to Vercel
1. Connect your GitHub repo to Vercel
2. Select the `frontend` folder as the root
3. Framework preset: Vite
4. Add environment variable: `NEXT_PUBLIC_API_URL` = Your Railway URL
5. Deploy

### 3. Update Backend CORS (if needed)
If your Vercel domain is not `*.vercel.app`, add `FRONTEND_URL` to Railway variables.

## Testing

### Local Development
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`
- Set `VITE_API_URL=http://localhost:5000` in frontend `.env.local`

### Production
- Backend: `https://your-backend.up.railway.app`
- Frontend: `https://your-app.vercel.app`
- Set `NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app` in Vercel

## Troubleshooting

### Frontend can't connect to backend
- Check `NEXT_PUBLIC_API_URL` is set correctly in Vercel
- Verify Railway backend is running and accessible
- Check Railway logs for CORS errors

### WebSocket connection fails
- Ensure WebSocket URL uses `wss://` (secure) for production
- Check Railway backend WebSocket endpoint is accessible
- Verify `/voice` path is correct

### CORS errors
- Add your Vercel URL to Railway `FRONTEND_URL` variable
- Or ensure your domain matches `*.vercel.app` pattern
- Check Railway backend CORS configuration

