# Production Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying the voice interview system to production, including Dialogflow CX agent configuration and security hardening.

## Prerequisites

✅ All code cleanup completed
✅ Environment variables configured in Replit Secrets
✅ Database schema migrated
✅ All tests passing

## Step 1: Code Cleanup Verification

### ✅ Completed Actions:
- [x] Removed all debug print statements
- [x] Removed test logging artifacts
- [x] Kept essential error logging only
- [x] Verified no seed values in Gemini initialization
- [x] Production mode enabled (debug=False by default)

### Verification:
```bash
# Check for remaining debug statements (should show minimal output)
grep -r "print(" python_backend/ | grep -v "#" | grep -v "Error"
grep -r "console.log" server/routes.ts | grep -v "console.error" | grep -v "//"
```

## Step 2: Environment Variable Security

### Required Replit Secrets:

All sensitive credentials are loaded **exclusively** from Replit Secrets:

1. **`GOOGLE_CREDENTIALS`** - Google Cloud service account JSON
2. **`GCP_PROJECT_ID`** or `DIALOGFLOW_PROJECT_ID` - Google Cloud project ID
3. **`DF_AGENT_ID`** or `DIALOGFLOW_AGENT_ID` - Dialogflow agent ID
4. **`DF_LOCATION_ID`** or `DIALOGFLOW_LOCATION_ID` - Dialogflow location (e.g., us-central1)
5. **`DF_ENVIRONMENT_ID`** or `DIALOGFLOW_ENVIRONMENT_ID` - Dialogflow environment ID (use "DRAFT" for now, will change to production)
6. **`GEMINI_API_KEY`** - Google Gemini API key for scoring
7. **`DATABASE_URL`** - PostgreSQL connection string
8. **`JWT_SECRET`** - JWT signing secret

### ✅ Security Verification:
- [x] No hardcoded credentials in code
- [x] All GCP IDs loaded from environment variables
- [x] GOOGLE_CREDENTIALS parsed securely from JSON string
- [x] Error handling for missing credentials

## Step 3: Dialogflow CX Console Configuration

### IMPORTANT: Manual Steps Required

You must complete these steps in the **Google Cloud Console** to deploy your agent to production:

### 3.1 Create Agent Version

1. **Navigate to Dialogflow CX Console:**
   - Go to: https://console.cloud.google.com/dialogflow/cx
   - Select your project
   - Select your agent

2. **Create Version:**
   - Click on **"Manage"** tab in the left sidebar
   - Click on **"Versions"** submenu
   - Click **"Create Version"** button
   - Enter version name: `v1.0` (or `production-v1.0`)
   - Add description: `Production version 1.0 - Initial stable release`
   - Click **"Create"**
   - **Wait for version creation to complete** (this may take a few minutes)

### 3.2 Create Production Environment

1. **Navigate to Environments:**
   - Still in the **"Manage"** tab
   - Click on **"Environments"** submenu
   - Click **"Create Environment"** button

2. **Configure Environment:**
   - **Environment ID:** `production` (or `prod`)
   - **Display Name:** `Production Environment`
   - **Description:** `Production environment for live interviews`
   - **Version:** Select the `v1.0` version you just created
   - Click **"Create"**

3. **Wait for Environment Creation:**
   - This may take 5-10 minutes
   - Status will show "Active" when ready

### 3.3 Update Environment Variable

After creating the production environment:

1. **In Replit Secrets, update:**
   - `DF_ENVIRONMENT_ID` or `DIALOGFLOW_ENVIRONMENT_ID`
   - Change from: `DRAFT`
   - Change to: `production` (or whatever environment ID you created)

2. **Verify the change:**
   - The session path will now use: `environments/production/sessions/...`
   - All new interviews will use the production version

### 3.4 Verify Agent Configuration

1. **Test in Dialogflow Console:**
   - Go to **"Test Agent"** tab
   - Select **"Production"** environment from dropdown
   - Test a sample conversation
   - Verify questions are unique and appropriate

2. **Check Session Parameters:**
   - Verify session parameters are being passed correctly:
     - `candidate_resume_summary`
     - `interviewer_persona`
     - `difficulty_level`

## Step 4: API Endpoint Review

### Main Endpoints Verified:

#### ✅ Voice Interview Endpoints:
- **`POST /api/voice-interview/start`**
  - ✅ Accepts: `session_id`, `role`, `resumeText`, `difficulty`
  - ✅ Returns: `audioResponse` (base64), `agentResponseText`, `sessionId`
  - ✅ Sets session parameters correctly
  - ✅ Handles errors gracefully

- **`POST /api/voice-interview/send-audio`**
  - ✅ Accepts: `audio` (multipart/form-data), `session_id`
  - ✅ Returns: `audioResponse`, `agentResponseText`, `userTranscript`, `isEnd`
  - ✅ Saves transcript (text only, no audio)
  - ✅ Handles conversation flow

- **`POST /api/voice-interview/score`**
  - ✅ Accepts: `session_id`
  - ✅ Fetches transcript from database
  - ✅ Calls Gemini API with detailed prompt
  - ✅ Saves score report to database
  - ✅ Returns: `question_scores`, `overall_score`, `summary`

#### ✅ Text Interview Endpoints:
- **`POST /api/dialogflow/start-interview`** - Text-based interview start
- **`POST /api/dialogflow/send-message`** - Text-based conversation
- **`POST /api/dialogflow/complete-interview`** - Interview completion

### Endpoint Stability:
- ✅ All endpoints have error handling
- ✅ Authentication middleware applied
- ✅ Input validation present
- ✅ Proper HTTP status codes

## Step 5: Production Deployment Checklist

### Pre-Deployment:

- [ ] All Replit Secrets configured
- [ ] Database schema migrated (`npm run db:push`)
- [ ] Dialogflow agent version created (v1.0)
- [ ] Dialogflow production environment created
- [ ] Environment variable updated to use production environment
- [ ] All tests passing (`npm run test:full`)
- [ ] Code cleanup verified (no debug statements)

### Deployment Steps:

1. **Update Environment Variable:**
   ```bash
   # In Replit Secrets, set:
   DF_ENVIRONMENT_ID=production
   ```

2. **Redeploy Application:**
   - Click "Deploy" in Replit
   - Or use Git push to trigger deployment
   - Wait for deployment to complete

3. **Verify Deployment:**
   ```bash
   # Check Python backend health
   curl https://your-app.replit.app/api/voice-interview/health
   
   # Expected: {"status":"healthy"}
   ```

4. **Test Production Flow:**
   - Start a voice interview
   - Verify AI speaks first
   - Complete a few Q&A turns
   - Verify scoring works
   - Check database for saved data

### Post-Deployment:

- [ ] Monitor server logs for errors
- [ ] Test interview flow end-to-end
- [ ] Verify scoring accuracy
- [ ] Check database data integrity
- [ ] Monitor API response times

## Step 6: Final Manual Steps Summary

### Actions Required Outside Replit:

1. **Google Cloud Console - Dialogflow CX:**
   - [ ] Create agent version (v1.0)
   - [ ] Create production environment
   - [ ] Assign v1.0 version to production environment
   - [ ] Test agent in production environment
   - [ ] Verify session parameters work correctly

2. **Replit Secrets:**
   - [ ] Update `DF_ENVIRONMENT_ID` from `DRAFT` to `production`
   - [ ] Verify all other secrets are set correctly

3. **Deployment:**
   - [ ] Redeploy application in Replit
   - [ ] Verify both servers start (Node.js + Python)
   - [ ] Test health endpoints

4. **Production Testing:**
   - [ ] Run full interview test
   - [ ] Verify audio quality
   - [ ] Verify transcript saving
   - [ ] Verify scoring works
   - [ ] Check database for data integrity

## Security Notes

### ✅ Security Measures Implemented:

1. **Credentials:**
   - All credentials loaded from environment variables
   - No hardcoded secrets in code
   - GOOGLE_CREDENTIALS parsed securely

2. **Audio Privacy:**
   - Raw audio files NEVER stored
   - Only transcribed text saved
   - Audio discarded after transcription

3. **Authentication:**
   - JWT-based authentication
   - Token validation on all protected endpoints
   - Proper error handling for auth failures

4. **Error Handling:**
   - No sensitive data in error messages
   - Generic error messages for users
   - Detailed errors logged server-side only

5. **Production Mode:**
   - Flask debug mode disabled by default
   - Minimal logging in production
   - No stack traces exposed to users

## Troubleshooting

### If interviews fail in production:

1. **Check Environment Variable:**
   ```bash
   # Verify DF_ENVIRONMENT_ID is set to "production"
   echo $DF_ENVIRONMENT_ID
   ```

2. **Check Dialogflow Environment:**
   - Verify environment exists in Dialogflow console
   - Verify version is assigned to environment
   - Test agent in Dialogflow console

3. **Check Logs:**
   - Review Python backend logs
   - Review Node.js server logs
   - Look for authentication errors

4. **Verify Credentials:**
   - Check GOOGLE_CREDENTIALS is valid JSON
   - Verify service account has Dialogflow permissions
   - Check GCP project ID, location ID, agent ID are correct

## Support

If you encounter issues:
1. Check server logs for detailed error messages
2. Verify all environment variables are set
3. Test Dialogflow agent in console
4. Verify database connection
5. Check API endpoint responses

---

**Status:** ✅ Code cleanup complete, ready for production deployment
**Last Updated:** After final code cleanup and security review


