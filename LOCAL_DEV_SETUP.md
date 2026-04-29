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
- `PORT=3000`
- `JWT_SECRET` (local dev secret)
- `OPENAI_API_KEY` (your OpenAI key)
- `ELEVENLABS_API_KEY` (your ElevenLabs key)
- `HUGGINGFACE_TOKEN` (optional) – for resume NER and summarization; get from https://huggingface.co/settings/tokens

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
Backend will run on: `http://localhost:3000`

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
- **Backend API**: http://localhost:3000/api/*
- **Health Check**: http://localhost:3000/health

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

**Backend (port 3000):**
```bash
# Find process using port 3000
netstat -ano | findstr :3000

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
PORT=3000
JWT_SECRET=local-dev-jwt-secret-12345
OPENAI_API_KEY=sk-your-key-here
```

## Development Workflow

1. **Make changes** to code
2. **Save files** - both servers auto-reload
3. **Test in browser** - changes appear immediately
4. **Check console** - for any errors or warnings
5. **No deployment needed** - test everything locally first!

## Next steps

- Run through sign-in, upload resume, and a short voice session before deploying.
