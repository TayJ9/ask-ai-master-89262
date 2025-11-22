# Deployment Structure for Railway

## ✅ Project Reorganization Complete

Your project has been restructured into Railway-friendly folders:

### 📁 Backend (`backend/`)
Contains all Node.js backend server code:
- `server/` - Express server with TypeScript
  - `index.ts` - Main server entry point
  - `routes.ts` - API routes
  - `vite.ts` - Vite integration for serving frontend
  - `db.ts` - Database connection
  - `storage.ts` - Database operations
  - `openai.ts` - OpenAI integration
  - `dialogflow.ts` - Dialogflow integration
  - `scoring.ts` - Interview scoring
  - Other server utilities
- `server.js` - Legacy Express server
- `upload.js` - File upload handler
- `voiceServer.js` - WebSocket voice server
- `package.json` - Backend dependencies
- `tsconfig.json` - TypeScript configuration
- `shared/` - Shared TypeScript schemas

### 📁 Frontend (`frontend/`)
Contains all React frontend code:
- `src/` - React source code
  - `components/` - React components
  - `pages/` - Page components
  - `lib/` - Utility libraries
  - `hooks/` - React hooks
  - `main.tsx` - Entry point
  - `App.tsx` - Main app component
- `public/` - Static assets
- `index.html` - HTML entry point
- `vite.config.ts` - Vite configuration
- `package.json` - Frontend dependencies
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `shared/` - Shared TypeScript schemas

### 📁 Shared (`shared/`)
Contains shared TypeScript schemas used by both backend and frontend:
- `schema.ts` - Database schemas and types

## 🚀 Railway Deployment

### Recommended: Deploy Backend Only
The backend serves the frontend's built files in production.

**Steps:**
1. Build the frontend:
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. Deploy backend on Railway:
   - Root directory: `backend/`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment variables: Set in Railway dashboard

### Alternative: Deploy Separately
Deploy backend and frontend as separate Railway services.

**Backend Service:**
- Root: `backend/`
- Build: `npm install`
- Start: `npm start`

**Frontend Service:**
- Root: `frontend/`
- Build: `npm install && npm run build`
- Start: Use a static file server or Railway's static file hosting

## 📝 Environment Variables

Set these in Railway dashboard for the backend service:

```
PORT=5000                    # Railway will set this automatically
DATABASE_URL=...             # Your database connection string
JWT_SECRET=...               # Secret for JWT tokens
OPENAI_API_KEY=...           # Your OpenAI API key
NODE_ENV=production          # Set to production
```

## 🔧 Development

**Run backend:**
```bash
cd backend
npm install
npm run dev
```

**Run frontend:**
```bash
cd frontend
npm install
npm run dev
```

In development, the backend serves the frontend via Vite middleware.

## 📦 Key Changes Made

1. ✅ Moved `server/` → `backend/server/`
2. ✅ Moved `src/` → `frontend/src/`
3. ✅ Moved `public/` → `frontend/public/`
4. ✅ Moved `index.html` → `frontend/index.html`
5. ✅ Updated `backend/server/vite.ts` paths to reference `../frontend/`
6. ✅ Created separate `package.json` files for backend and frontend
7. ✅ Created TypeScript configs for both folders
8. ✅ Copied `shared/` to both backend and frontend

## ✨ Next Steps

1. Install dependencies in both folders:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. Test locally:
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend (if running separately)
   cd frontend && npm run dev
   ```

3. Deploy to Railway following the instructions above.

