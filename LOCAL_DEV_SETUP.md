# Local Development Setup Guide

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Step 1: Install Dependencies

**Install all dependencies:**
```bash
npm run install:all
```

Or install separately:
```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### Step 2: Verify Environment Variables

The backend `.env` file should already exist at `backend/.env` with:
- `DATABASE_URL=file:./local.db` (SQLite for local dev)
- `PORT=3001` (matches Vite proxy in `frontend/vite.config.ts`)
- `JWT_SECRET` (local dev secret)
- `OPENAI_API_KEY` (your OpenAI key)
- `ELEVENLABS_API_KEY` (your ElevenLabs key)
- `HUGGINGFACE_TOKEN` (optional) – for resume NER and summarization; create at https://huggingface.co/settings/tokens with **Inference Providers** permission (or set `HF_TOKEN`). Optional override: `HF_INFERENCE_PROVIDER=hf-inference` (default).

If `.env` is missing, create it:
```bash
cd backend
# Copy from existing .env or create new one
```

### Step 3: Start Development Servers

**Option A: Run Both Servers (Recommended)**

Open **two terminal windows**:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend will run on: `http://localhost:3001` (or whatever `PORT` is in `backend/.env`)

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend will run on: `http://localhost:5173` (Vite default)

**Option B: Use Root Scripts**

From the root directory:
```bash
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

### Step 4: Access Your Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api/* (via Vite proxy from the frontend)
- **Health Check**: http://localhost:3001/health

### Step 5 (optional): Dev test login (no secrets in Git)

1. Add to **`backend/.env`** (never commit this file):

   ```bash
   DEV_TEST_PASSWORD=your_local_password_at_least_8_chars
   # optional:
   # DEV_TEST_EMAIL=dev@localhost.test
   # DEV_TEST_FULL_NAME=Local Dev User
   ```

2. From **`backend/`**, run:

   ```bash
   npm run create-test-user
   ```

3. Sign in at http://localhost:5173 with `DEV_TEST_EMAIL` (default `dev@localhost.test`) and your `DEV_TEST_PASSWORD`.

The script refuses to run when `NODE_ENV=production`. Placeholder variable names only live in **`.env.example`**; real passwords stay in **`.env`**.

## How it works

1. **Vite proxy**: The frontend proxies `/api/*` to the backend (see `frontend/vite.config.ts` for the target port).
2. **Hot reload**: Both servers reload on save.

## Troubleshooting

### Port Already in Use

**Backend (port 3001):**
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**Frontend (port 5173):**
Vite will automatically try the next available port (5174, 5175, etc.)

### Dependencies Not Installed

```bash
# Clean install
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

### Database Issues

The backend uses SQLite for local development (`local.db` file). If you see database errors:

```bash
cd backend
npm run db:setup
```

### Environment Variables Missing

Make sure `backend/.env` exists with at minimum:
```
DATABASE_URL=file:./local.db
PORT=3001
JWT_SECRET=local-dev-jwt-secret-12345
OPENAI_API_KEY=sk-your-key-here
```

## Development Workflow

1. **Make changes** to code
2. **Save files** - both servers auto-reload
3. **Test in browser** - changes appear immediately
4. **Check console** - for any errors or warnings
5. **No deployment needed** - test everything locally first!

## Local vs tunnel vs deploy

ElevenLabs can only call your backend over the **public internet**. Your browser and backend can call ElevenLabs and OpenAI from localhost — that direction always works.

### What works in each mode

| Capability | Local (`localhost`) | Tunnel (ngrok) | Deploy (Railway + Vercel) |
|------------|---------------------|----------------|---------------------------|
| Sign-in, resume upload, UI | Yes | Yes | Yes |
| Voice interview (browser ↔ ElevenLabs) | Yes | Yes | Yes |
| Resume context via dynamic variables | Yes | Yes | Yes |
| `/api/conversation-token` | Yes | Yes | Yes |
| `/api/save-interview` + client transcript | Yes | Yes | Yes |
| Transcript fetch (backend → ElevenLabs API) | Yes | Yes | Yes |
| OpenAI evaluation / Results page | Yes | Yes | Yes |
| `MarkInterviewComplete` **client** tool (SDK → browser) | Yes | Yes | Yes |
| Server tools (`get-resume-profile`, `get-resume-fulltext`) | No | Yes | Yes |
| `/api/mark-interview-complete` server tool | No | Yes | Yes |
| Post-call webhook (`/webhooks/elevenlabs`) | No | Yes | Yes |

**Default:** Stay on **local** for everyday development — the core interview → save → results flow has fallbacks and does not require a public URL.

**Use a tunnel** when you need to verify ElevenLabs **server tools** or **webhooks** against your local SQLite DB.

**Use deploy** for pre-release validation, demos, or when you want a stable public URL without ngrok.

### ElevenLabs inbound endpoints (cloud → your backend)

These only fire when ElevenLabs can reach a public URL configured in the dashboard:

| Endpoint | Purpose | Missing locally? |
|----------|---------|------------------|
| `POST /api/get-resume-profile` | Structured resume mid-call | Usually fine — dynamic vars inject resume at session start |
| `POST /api/get-resume-fulltext` | Full resume text mid-call | Only matters for deep follow-ups on specific projects |
| `POST /api/mark-interview-complete` | Server-side “done” signal | Low impact — client tool + save-interview handle end |
| `POST /webhooks/elevenlabs` | Post-call transcript + session linking | Redundant with save-interview + ElevenLabs API fetch |

Missing `[RESUME-PROFILE]` or `[WEBHOOK]` logs during a local interview is **expected**, not a sign the app is broken.

### Tunnel setup (ngrok)

Backend runs on port **3001** by default (see `frontend/vite.config.ts` proxy target and `PORT` in `backend/.env`).

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev

# Terminal 3 — expose backend to ElevenLabs
ngrok http 3001
```

In the ElevenLabs dashboard, point server tools and webhooks at the ngrok URL:

- Tools: `https://<tunnel>/api/get-resume-profile`, `https://<tunnel>/api/get-resume-fulltext`
- Webhook: `https://<tunnel>/webhooks/elevenlabs`
- Header: `x-api-secret: <ELEVENLABS_API_KEY>`
- Tool body: `{ "interviewid": "{{interviewid}}" }`

Watch backend logs for `[RESUME-PROFILE] interviewid … found true` or `[WEBHOOK]`.

### Dashboard URL gotcha

If tool/webhook URLs in the ElevenLabs dashboard still point at **Railway or production**, server tools *will* run — but they hit **production data**, not your local `local.db`. Point them at your tunnel when testing locally, or at Railway when testing staging/prod.

### Verify endpoints without ElevenLabs

Integration tests call the backend from your machine (not from ElevenLabs cloud):

```bash
cd backend
npm run test:resume-server-tools
```

See `ELEVENLABS_AGENT_TEMPLATE.md` for full agent + tool configuration.

## Next steps

- Run through sign-in, upload resume, and a short voice session before deploying.
