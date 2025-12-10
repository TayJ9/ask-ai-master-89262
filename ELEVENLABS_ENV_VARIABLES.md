# ElevenLabs Integration - Environment Variables

This document lists all required environment variables for the ElevenLabs voice interview integration.

## Migration Note

**The application has fully migrated from OpenAI to ElevenLabs.** All OpenAI endpoints have been removed:
- `/api/ai/text-to-speech` (removed)
- `/api/ai/speech-to-text` (removed)
- `/api/ai/analyze-response` (removed)
- `/api/ai/coach` (removed)

Voice interview functionality now exclusively uses ElevenLabs ConvAI API. **OPENAI_API_KEY is no longer required or used.**

## Required Environment Variables

The following environment variables are **required** for the application to function:

## Backend (Railway)

Add these environment variables in your Railway project dashboard:

1. **ELEVENLABS_API_KEY**
   - **Description**: Your ElevenLabs API key for accessing the ConvAI API
   - **How to get**: 
     1. Go to https://elevenlabs.io
     2. Sign in to your account
     3. Navigate to Dashboard → Settings → API Keys
     4. Copy your `sk_live_*` key
   - **Example**: `sk_live_abc123def456...`

2. **ELEVENLABS_AGENT_ID**
   - **Description**: The ElevenLabs agent ID for the interview coach
   - **Value**: `agent_8601kavsezrheczradx9qmz8qp3e`
   - **Note**: This is the specific agent ID provided for this project

3. **FRONTEND_URL**
   - **Description**: Your Vercel frontend URL (production domain)
   - **How to get**:
     1. Go to Vercel dashboard
     2. Select your project
     3. Go to Settings → Domains
     4. Copy your production domain (e.g., `https://your-app.vercel.app`)
   - **Example**: `https://mockly-ai.vercel.app`
   - **Note**: Include the `https://` protocol

4. **JWT_SECRET**
   - **Description**: Secret key for JWT token signing and verification
   - **Status**: Should already be set
   - **Note**: If not set, add a strong random string

5. **DATABASE_URL**
   - **Description**: PostgreSQL database connection string
   - **Status**: Should already be set in Railway
   - **Note**: Required for storing interview data

### Optional Variables

- **BACKEND_URL**: Your Railway backend URL (if needed for webhook configuration)
- **NODE_ENV**: Set to `production` for production deployments

### Deprecated Variables (No Longer Used)

- **OPENAI_API_KEY**: ❌ **REMOVED** - No longer required. The application has migrated to ElevenLabs.
- **OPEN_API_KEY**: ❌ **REMOVED** - No longer required. The application has migrated to ElevenLabs.

> **Note**: If you have legacy code that still references OpenAI (e.g., `scoring.ts`), those functions are deprecated and will require `OPENAI_API_KEY` if used. However, all active endpoints have been migrated to ElevenLabs.

## Frontend (Vercel)

Add these environment variables in your Vercel project dashboard:

### Required Variables

1. **VITE_ELEVENLABS_AGENT_ID** or **NEXT_PUBLIC_ELEVENLABS_AGENT_ID**
   - **Description**: The ElevenLabs agent ID (same as backend)
   - **Value**: `agent_8601kavsezrheczradx9qmz8qp3e`
   - **Note**: Use `VITE_` prefix for Vite projects, `NEXT_PUBLIC_` for Next.js

2. **VITE_API_URL** or **NEXT_PUBLIC_API_URL**
   - **Description**: Your Railway backend URL
   - **How to get**:
     1. Go to Railway dashboard
     2. Select your backend service
     3. Copy the public URL (e.g., `https://your-backend.up.railway.app`)
   - **Example**: `https://mockly-backend.up.railway.app`
   - **Note**: Include the `https://` protocol, no trailing slash

### Optional Variables

- **VITE_BACKEND_URL**: Alternative name (if your build config supports it)

## Setting Environment Variables

### Railway (Backend)

1. Go to Railway dashboard: https://railway.app
2. Select your backend project
3. Click on your service
4. Go to the "Variables" tab
5. Click "New Variable"
6. Add each variable with its value
7. Click "Add"
8. Railway will automatically redeploy with new variables

### Vercel (Frontend)

1. Go to Vercel dashboard: https://vercel.com
2. Select your frontend project
3. Go to Settings → Environment Variables
4. Click "Add New"
5. Add each variable:
   - **Key**: Variable name (e.g., `VITE_ELEVENLABS_AGENT_ID`)
   - **Value**: Variable value (e.g., `agent_8601kavsezrheczradx9qmz8qp3e`)
   - **Environment**: Select "Production", "Preview", and/or "Development" as needed
6. Click "Save"
7. Redeploy your application for changes to take effect

## Verification

After setting environment variables:

### Backend Verification

1. Check Railway logs to ensure `ELEVENLABS_API_KEY` is detected
2. Test the token endpoint: `GET /api/conversation-token` (requires authentication)
3. Verify rate limiting works (5 requests/hour per user)

### Frontend Verification

1. Check browser console for any environment variable errors
2. Verify the component can fetch tokens from the backend
3. Test microphone permission flow
4. Test connection establishment

## Webhook Configuration

After deploying the backend:

1. Get your webhook URL: `https://your-backend.up.railway.app/webhooks/elevenlabs`
2. Go to ElevenLabs dashboard
3. Navigate to your agent settings
4. Add the webhook URL in the webhook configuration
5. Save the configuration

The webhook will be called automatically when conversations complete.

## Troubleshooting

### Backend Issues

- **"ELEVENLABS_API_KEY not configured"**: Check Railway variables, ensure the key is set correctly
- **"Rate limit exceeded"**: Normal behavior - 5 tokens per hour per user
- **Webhook not receiving data**: Verify webhook URL is correct in ElevenLabs dashboard

### Frontend Issues

- **"Failed to get conversation token"**: Check backend URL is correct, verify authentication token
- **Microphone permission denied**: User needs to allow microphone access in browser settings
- **Connection failed**: Check network connection, verify WebRTC/WebSocket support

## Security Notes

- Never commit API keys or secrets to version control
- Use environment variables for all sensitive data
- Rotate API keys periodically
- Monitor API usage in ElevenLabs dashboard
- Set up rate limiting to prevent abuse

## Migration Checklist

If you're migrating from OpenAI to ElevenLabs:

1. ✅ Remove `OPENAI_API_KEY` from Railway environment variables
2. ✅ Add `ELEVENLABS_API_KEY` to Railway environment variables
3. ✅ Add `ELEVENLABS_AGENT_ID` to Railway environment variables
4. ✅ Add `VITE_ELEVENLABS_AGENT_ID` to Vercel environment variables
5. ✅ Update frontend to use `InterviewAgent` component instead of OpenAI-based components
6. ✅ Configure webhook URL in ElevenLabs dashboard
7. ✅ Test voice interview functionality end-to-end
8. ✅ Verify interview data is being saved via webhook

## API Endpoints

### Active ElevenLabs Endpoints

- `GET /api/conversation-token` - Get ElevenLabs conversation token (requires auth, rate limited)
- `POST /webhooks/elevenlabs` - Receive conversation completion webhooks from ElevenLabs

### Removed OpenAI Endpoints

- `POST /api/ai/text-to-speech` - ❌ Removed
- `POST /api/ai/speech-to-text` - ❌ Removed
- `POST /api/ai/analyze-response` - ❌ Removed
- `POST /api/ai/coach` - ❌ Removed

