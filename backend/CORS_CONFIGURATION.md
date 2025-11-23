# CORS Configuration for Vercel Frontend + Railway Backend

## Overview
This document describes the CORS and WebSocket configuration for the AI Interview Coach application with:
- **Frontend**: Deployed on Vercel (separate deployment)
- **Backend**: Deployed on Railway (Node.js/Express with WebSocket support)

## CORS Configuration

### Allowed Origins
The backend accepts requests from:
1. **Vercel Deployments**: All `*.vercel.app` domains (production and preview)
2. **Explicitly Configured**: `FRONTEND_URL` environment variable (if set)
3. **Development**: `localhost:3000`, `localhost:5173`, `localhost:5000`

### CORS Headers
- `Access-Control-Allow-Origin`: Set dynamically based on request origin
- `Access-Control-Allow-Credentials`: `true` (allows cookies/auth headers)
- `Access-Control-Allow-Methods`: `GET, POST, PUT, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type, Authorization, X-Requested-With`
- `Access-Control-Max-Age`: `86400` (24 hours)

## WebSocket Configuration

### Endpoint
- **Path**: `/voice`
- **Protocol**: `wss://` (secure WebSocket) in production

### Origin Verification
WebSocket connections are verified for security:
- ✅ All `*.vercel.app` domains
- ✅ `localhost` and `127.0.0.1` (development)
- ✅ Explicitly configured `FRONTEND_URL`
- ❌ Unknown origins are blocked and logged

## Environment Variables

### Required in Railway
```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
JWT_SECRET=your-secret-key

# OpenAI
OPENAI_API_KEY=sk-...

# Optional: Explicit frontend URL (if not using *.vercel.app)
FRONTEND_URL=https://your-app.vercel.app
```

### Required in Vercel
```bash
# Backend API URL
VITE_API_URL=https://your-backend.up.railway.app
# OR
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status, database connection, and service availability.

### Root Endpoint
```
GET /
```
Returns API information and available endpoints.

### WebSocket
```
WS /voice
```
Voice interview WebSocket endpoint for real-time audio streaming.

## Testing CORS

### From Browser Console
```javascript
// Test API endpoint
fetch('https://your-backend.up.railway.app/health', {
  method: 'GET',
  credentials: 'include'
})
.then(r => r.json())
.then(console.log);

// Test WebSocket
const ws = new WebSocket('wss://your-backend.up.railway.app/voice');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', e.data);
```

## Troubleshooting

### CORS Errors
1. Check that your Vercel domain matches `*.vercel.app` pattern
2. Verify `FRONTEND_URL` is set correctly if using custom domain
3. Check browser console for specific CORS error messages
4. Verify `Access-Control-Allow-Credentials` header is present

### WebSocket Connection Failures
1. Ensure using `wss://` (not `ws://`) in production
2. Check Railway logs for origin verification messages
3. Verify WebSocket endpoint path is `/voice`
4. Check that Railway WebSocket support is enabled

### Frontend Build Directory Warning
This is **expected** when frontend is deployed separately. The backend will:
- Serve API endpoints normally
- Return JSON for root route
- Not serve static frontend files

## Security Notes

- WebSocket origin verification prevents unauthorized connections
- CORS is configured to allow credentials (cookies/auth tokens)
- Unknown origins are logged for monitoring
- Production uses secure WebSocket (`wss://`)

