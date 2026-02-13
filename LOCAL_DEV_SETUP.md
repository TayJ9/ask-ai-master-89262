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

## How It Works

1. **Vite Proxy**: The frontend automatically proxies `/api/*` requests to `http://localhost:3000`
2. **No Environment Variables Needed**: For local dev, the frontend uses relative URLs
3. **Hot Reload**: Both servers support hot reload - changes reflect immediately

## Testing the TDZ Fix

After starting both servers:

1. Open http://localhost:5173 in your browser
2. Sign in or create an account
3. Navigate to the interview page
4. Click "Start Interview"
5. Check the browser console - you should **NOT** see:
   - `ReferenceError: Cannot access 'k' before initialization`
6. The interview should start successfully

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

## Next Steps

- Test the interview start flow
- Verify no TDZ errors in console
- Test all features locally before deploying
