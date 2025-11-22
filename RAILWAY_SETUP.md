# Railway Deployment Setup

This project is structured for Railway deployment with separate backend and frontend folders.

## Project Structure

```
workspace/
├── backend/          # Node.js backend server
│   ├── server/      # Express server with API routes
│   ├── server.js    # Legacy Express server
│   ├── upload.js    # File upload handler
│   └── package.json # Backend dependencies
├── frontend/         # React frontend app
│   ├── src/         # React source code
│   ├── public/      # Static assets
│   ├── index.html   # HTML entry point
│   └── package.json # Frontend dependencies
└── shared/          # Shared TypeScript schemas
```

## Railway Deployment

### Option 1: Deploy Backend Only (Recommended)
The backend serves the frontend's built static files in production.

1. **Build the frontend first:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Deploy the backend:**
   - Point Railway to the `backend/` folder
   - Set build command: `npm install`
   - Set start command: `npm start`
   - Set PORT environment variable (Railway will set this automatically)

### Option 2: Deploy Both Separately
Deploy backend and frontend as separate Railway services.

**Backend Service:**
- Root: `backend/`
- Build: `npm install`
- Start: `npm start`
- Port: Railway will assign automatically

**Frontend Service:**
- Root: `frontend/`
- Build: `npm install && npm run build`
- Start: `npm run preview` (or use a static file server)
- Port: Railway will assign automatically

## Environment Variables

### Backend (.env in backend/ folder)
```
PORT=5000
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_key
```

### Frontend
No environment variables needed (API calls go to backend URL)

## Development

### Run Backend:
```bash
cd backend
npm install
npm run dev
```

### Run Frontend:
```bash
cd frontend
npm install
npm run dev
```

The backend will serve the frontend via Vite middleware in development mode.

