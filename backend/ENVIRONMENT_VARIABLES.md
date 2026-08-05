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
  - `server/routes.ts` — resume text and interview flows
  - `server/llm/` — evaluation and related helpers where configured
  - `voiceServer.js` — voice interview WebSocket

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

### 5. `TRUST_PROXY_HOPS` (Optional — behind Railway/Vercel/reverse proxy)

- **Purpose:** Number of proxy hops Express should trust for `req.ip` (rate limiting, logging).
- **Default in code:** `1` if unset.
- **When to raise:** Unusual multi-proxy setups only.

### 6. `PORT` (Optional - Railway sets automatically)
- **Purpose**: Port number for the server to listen on
- **Default**: `5000`
- **Note**: Railway automatically sets this - **don't override it**
- **Used in**: `server/index.ts`

### 7. `PYTHON_BACKEND_URL` (Optional)
- **Purpose**: URL for Python backend service (if using separate Python service)
- **Default**: `http://127.0.0.1:5001`
- **When to use**: Only if you're running a separate Python Flask backend
- **Format**: `http://host:port` or `https://host:port`
- **Used in**: `server/routes.ts` - Voice interview proxy endpoints

### 8. Arize tracing (Optional — scoring pipeline observability)

Export GPT-4o-mini scoring traces to [Arize AX](https://arize.com) for prompt, rubric, response, latency, and token monitoring.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ARIZE_SPACE_ID` | Yes (with API key) | None | Space ID from Arize AX → Space Settings → API Keys |
| `ARIZE_API_KEY` | Yes (with space ID) | None | API key from Arize AX → Space Settings → API Keys |
| `ARIZE_PROJECT_NAME` | No | `mockly-scoring` | Project name in Arize (filter traces by project) |
| `ARIZE_OTLP_URL` | No | `https://otlp.arize.com/v1/traces` | OTLP HTTP endpoint (EU spaces may differ) |

- **Used in**: `server/instrumentation.ts`, `server/llm/openaiEvaluator.ts`, `server/evaluation.ts`
- **When disabled**: If either `ARIZE_SPACE_ID` or `ARIZE_API_KEY` is unset, tracing is skipped with no impact on scoring.
- **What is traced**: Every `gpt-4o-mini` call in the scoring pipeline — system/user prompts (rubric), model response, latency, token counts, interview ID, and final capped scores.

Example (Railway Variables or `backend/.env`):

```env
ARIZE_SPACE_ID=your-space-id
ARIZE_API_KEY=your-api-key
ARIZE_PROJECT_NAME=mockly-scoring
```

For local evaluator scripts (`npm run test:evaluator`), call `initArizeTracing()` after loading `.env` if you want traces from test runs.

### 10. Email (Resend — verification + results)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | ✅ Yes (Prod) | — | Resend API key for verification and results emails |
| `EMAIL_FROM` | Recommended | `Mockly <onboarding@resend.dev>` | Verified sender address in Resend |
| `FRONTEND_URL` | ✅ Yes (Prod) | — | Used in verification and results email links |

- **Used in**: `server/email.ts`, `server/resultsEmail.ts`, auth signup/resend routes
- **When disabled**: Signup still works; verification email is skipped (dev logs verify URL). Results emails are skipped.

Example:

```env
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=Mockly <noreply@yourdomain.com>
FRONTEND_URL=https://mockly.yourdomain.com
```

### 11. Access gate (Production — Coolify unified deploy)

Hourly rotating access codes (**UTC** hour boundaries) gate the app before login. See [docs/COOLIFY_DEPLOYMENT.md](../docs/COOLIFY_DEPLOYMENT.md).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACCESS_GATE_SECRET` | ✅ Yes (Prod) | — | HMAC secret for hourly codes (32+ random bytes, hex or base32) |
| `ACCESS_GATE_ADMIN_KEY` | Recommended | — | Protects `GET /api/access/current` (operator / n8n) |
| `ACCESS_GATE_COOKIE_MAX_AGE_SECONDS` | No | `604800` (7 days) | Gate cookie lifetime after successful verify |
| `ALLOW_SIGNUP` | No | `true` | Set `false` to disable registration (invite-only) |
| `ALLOW_VERCEL_ORIGINS` | No | `false` | Set `true` to re-enable `*.vercel.app` CORS |
| `FRONTEND_URL` | ✅ Yes (Prod) | — | Public app URL for CORS (e.g. `https://mockly.yourdomain.com`) |

When `ACCESS_GATE_SECRET` is **unset**, the gate is disabled (local dev convenience). In production (`NODE_ENV=production`), startup **fails** if `ACCESS_GATE_SECRET` is missing.

**Operator:** fetch current code (never exposes the secret):

```http
GET /api/access/current
X-Admin-Key: <ACCESS_GATE_ADMIN_KEY>
```

Response includes `code`, `validUntil` (ISO timestamp), and `timezone: "UTC"`.

## Railway / Coolify Environment Variables Setup

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
| `ARIZE_SPACE_ID` | ❌ No | None | Arize AX space ID (enables scoring traces) |
| `ARIZE_API_KEY` | ❌ No | None | Arize AX API key (enables scoring traces) |
| `ARIZE_PROJECT_NAME` | ❌ No | `mockly-scoring` | Arize project for scoring traces |
| `ACCESS_GATE_SECRET` | ✅ Yes (Prod) | None | Hourly access code HMAC secret |
| `ACCESS_GATE_ADMIN_KEY` | Recommended | None | Admin key for `/api/access/current` |
| `ACCESS_GATE_COOKIE_MAX_AGE_SECONDS` | ❌ No | `604800` | Gate cookie max age (seconds) |
| `ALLOW_SIGNUP` | ❌ No | `true` | Set `false` to disable registration |
| `ALLOW_VERCEL_ORIGINS` | ❌ No | `false` | Allow `*.vercel.app` CORS origins |
| `FRONTEND_URL` | ✅ Yes (Prod) | None | Frontend URL for CORS |

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

