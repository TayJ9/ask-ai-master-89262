# Environment Variables Guide

## Required Environment Variables

These environment variables **must** be set for your Railway deployment to work:

### 1. `DATABASE_URL` ⚠️ **REQUIRED**
- **Purpose**: PostgreSQL database connection string
- **Format**: `postgresql://username:password@host:port/database`
- **Example**: `postgresql://user:pass@db.railway.app:5432/railway`
- **Where to get it**: 
  - Railway: Add a PostgreSQL database service, Railway provides this automatically
  - Or use Neon, Supabase, or any PostgreSQL provider
- **Used in**: `server/db.ts` - Database connection

### 2. `JWT_SECRET` ⚠️ **REQUIRED (Production)**
- **Purpose**: Secret key for signing and verifying JWT authentication tokens
- **Format**: Any secure random string (at least 32 characters recommended)
- **Example**: `your-super-secret-jwt-key-change-this-in-production-12345`
- **How to generate**: 
  ```bash
  # Generate a secure random string
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Security**: **NEVER commit this to git!** Use Railway's environment variables
- **Used in**: `server/routes.ts` - User authentication

### 3. `OPENAI_API_KEY` ⚠️ **REQUIRED**
- **Purpose**: OpenAI API key for AI features (voice interview, resume parsing, scoring)
- **Format**: `sk-...` (starts with `sk-`)
- **Where to get it**: 
  - Go to https://platform.openai.com/api-keys
  - Create a new API key
  - Copy the key (you can only see it once!)
- **Used in**: 
  - `server/openai.ts` - AI text-to-speech, speech-to-text, analysis
  - `server/routes.ts` - Resume upload parsing
  - `server/scoring.ts` - Interview scoring
  - `backend/voiceServer.js` - Voice interview WebSocket
  - `backend/upload.js` - Resume parsing

### 4. `NODE_ENV` ⚠️ **REQUIRED (Production)**
- **Purpose**: Sets the application environment mode
- **Value**: `production`
- **What it does**: 
  - Enables production optimizations
  - Serves static frontend files instead of Vite dev server
  - Enforces stricter security checks
- **Used in**: `server/index.ts` - Determines static file serving vs Vite dev server

## Optional Environment Variables

These have default values but can be customized:

### 5. `PORT` (Optional - Railway sets automatically)
- **Purpose**: Port number for the server to listen on
- **Default**: `5000`
- **Note**: Railway automatically sets this - **don't override it**
- **Used in**: `server/index.ts`, `server.js`

### 6. `PYTHON_BACKEND_URL` (Optional)
- **Purpose**: URL for Python backend service (if using separate Python service)
- **Default**: `http://127.0.0.1:5001`
- **When to use**: Only if you're running a separate Python Flask backend
- **Format**: `http://host:port` or `https://host:port`
- **Used in**: `server/routes.ts` - Voice interview proxy endpoints

## Railway Environment Variables Setup

### Step-by-Step Instructions:

1. **Go to Railway Dashboard**
   - Navigate to your project
   - Click on your backend service

2. **Open Variables Tab**
   - Click on the "Variables" tab in your service

3. **Add Required Variables**

   Click "New Variable" for each:

   ```
   Name: DATABASE_URL
   Value: [Your PostgreSQL connection string from Railway database service]
   ```

   ```
   Name: JWT_SECRET
   Value: [Generate a secure random string - see above]
   ```

   ```
   Name: OPENAI_API_KEY
   Value: sk-[Your OpenAI API key]
   ```

   ```
   Name: NODE_ENV
   Value: production
   ```

4. **Save and Redeploy**
   - Railway will automatically redeploy when you save variables
   - Check logs to verify all variables are loaded correctly

## Environment Variables Summary Table

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ Yes | None | PostgreSQL connection string |
| `JWT_SECRET` | ✅ Yes (Prod) | Dev default | Secret for JWT tokens |
| `OPENAI_API_KEY` | ✅ Yes | None | OpenAI API key |
| `NODE_ENV` | ✅ Yes (Prod) | `development` | Environment mode |
| `PORT` | ❌ No | `5000` | Server port (Railway sets automatically) |
| `PYTHON_BACKEND_URL` | ❌ No | `http://127.0.0.1:5001` | Python backend URL (if used) |

## Quick Setup Commands

### Generate JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Test Environment Variables Locally:
Create a `.env` file in the `backend/` folder:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
JWT_SECRET=your-secret-key-here
OPENAI_API_KEY=sk-your-openai-key-here
NODE_ENV=production
PORT=5000
```

Then run:
```bash
cd backend
npm install
npm start
```

## Security Best Practices

1. **Never commit `.env` files** - Add `.env` to `.gitignore`
2. **Use Railway's environment variables** - Don't hardcode secrets
3. **Rotate secrets regularly** - Especially `JWT_SECRET` and `OPENAI_API_KEY`
4. **Use different values for dev/staging/production**
5. **Restrict OpenAI API key permissions** - Use API key restrictions in OpenAI dashboard

## Troubleshooting

### Error: "DATABASE_URL must be set"
- **Solution**: Add `DATABASE_URL` environment variable in Railway
- **Check**: Make sure you've added a PostgreSQL database service

### Error: "JWT_SECRET environment variable must be set in production"
- **Solution**: Add `JWT_SECRET` environment variable in Railway
- **Note**: Must be set when `NODE_ENV=production`

### Error: "OPENAI_API_KEY not configured"
- **Solution**: Add `OPENAI_API_KEY` environment variable in Railway
- **Check**: Verify the key starts with `sk-` and is valid

### Server not serving frontend files
- **Solution**: Make sure `NODE_ENV=production` is set
- **Note**: In production, the backend serves static files from `frontend/dist/public`

## Verification

After setting environment variables, check Railway logs to verify:
- ✅ Server starts without errors
- ✅ Database connection successful
- ✅ No missing environment variable warnings
- ✅ Health check endpoint responds: `GET /health`

Your server logs should show:
```
Server running on port [PORT]
✓ OPENAI_API_KEY is configured
```

If you see warnings about missing variables, add them in Railway's Variables tab.

