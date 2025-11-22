# API Endpoint Testing Guide

## Base URL
**Production**: `https://ask-ai-master-89262-production.up.railway.app`

## Test Results Summary

### ✅ Working Endpoints
- **GET** `/` - Root endpoint returns API info ✅

### ⚠️ Issues Found
1. **Health Endpoint**: Not found at `/health` or `/api/health`
2. **Auth Endpoints**: Returning 500 errors (likely database connection)
3. **Error Handling**: Generic error messages need Railway logs for details

## Complete Endpoint List

### Public Endpoints

#### Root
- **GET** `/` - API information
  ```bash
  curl https://ask-ai-master-89262-production.up.railway.app/
  ```

### Authentication Endpoints (No Auth Required)

#### Sign Up
- **POST** `/api/auth/signup`
  ```bash
  curl -X POST https://ask-ai-master-89262-production.up.railway.app/api/auth/signup \
    -H "Content-Type: application/json" \
    -d '{
      "email": "user@example.com",
      "password": "SecurePass123!",
      "fullName": "John Doe"
    }'
  ```
  **Expected Response**: `{"message": "Account created successfully"}`

#### Sign In
- **POST** `/api/auth/signin`
  ```bash
  curl -X POST https://ask-ai-master-89262-production.up.railway.app/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{
      "email": "user@example.com",
      "password": "SecurePass123!"
    }'
  ```
  **Expected Response**: 
  ```json
  {
    "token": "jwt-token-here",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "John Doe"
    }
  }
  ```

### Protected Endpoints (Require Authorization Header)

All endpoints below require: `Authorization: Bearer <token>`

#### Profile
- **GET** `/api/profile` - Get current user profile
  ```bash
  TOKEN="your-jwt-token"
  curl -H "Authorization: Bearer $TOKEN" \
    https://ask-ai-master-89262-production.up.railway.app/api/profile
  ```

- **GET** `/api/auth/me` - Alternative profile endpoint
  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    https://ask-ai-master-89262-production.up.railway.app/api/auth/me
  ```

#### Interview Sessions

- **POST** `/api/interview/start` - Start new interview
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "role": "software-engineer",
      "difficulty": "Medium",
      "resumeText": "Optional resume text"
    }' \
    https://ask-ai-master-89262-production.up.railway.app/api/interview/start
  ```

- **POST** `/api/interview/send-message` - Send interview message
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "sessionId": "session-uuid",
      "userMessage": "My answer to the question..."
    }' \
    https://ask-ai-master-89262-production.up.railway.app/api/interview/send-message
  ```

- **POST** `/api/interview/complete` - Complete interview
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"sessionId": "session-uuid"}' \
    https://ask-ai-master-89262-production.up.railway.app/api/interview/complete
  ```

- **GET** `/api/interview/history` - Get interview history
  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    https://ask-ai-master-89262-production.up.railway.app/api/interview/history
  ```

- **GET** `/api/interview/:sessionId` - Get interview details
  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    https://ask-ai-master-89262-production.up.railway.app/api/interview/SESSION_ID_HERE
  ```

#### Resume Upload

- **POST** `/api/upload-resume` - Upload resume PDF
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -F "resume=@/path/to/resume.pdf" \
    -F "name=John Doe" \
    -F "major=Computer Science" \
    -F "year=Senior" \
    https://ask-ai-master-89262-production.up.railway.app/api/upload-resume
  ```

#### AI Endpoints

- **POST** `/api/ai/text-to-speech` - Convert text to speech
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"text": "Hello, this is a test"}' \
    https://ask-ai-master-89262-production.up.railway.app/api/ai/text-to-speech
  ```

- **POST** `/api/ai/speech-to-text` - Convert speech to text
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"audio": "base64-encoded-audio"}' \
    https://ask-ai-master-89262-production.up.railway.app/api/ai/speech-to-text
  ```

#### Voice Interview Endpoints

- **POST** `/api/voice-interview/start` - Start voice interview
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role": "software-engineer"}' \
    https://ask-ai-master-89262-production.up.railway.app/api/voice-interview/start
  ```

- **POST** `/api/voice-interview/send-audio` - Send audio
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -F "audio=@/path/to/audio.webm" \
    -F "session_id=session-uuid" \
    https://ask-ai-master-89262-production.up.railway.app/api/voice-interview/send-audio
  ```

- **POST** `/api/voice-interview/score` - Score interview
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"session_id": "session-uuid"}' \
    https://ask-ai-master-89262-production.up.railway.app/api/voice-interview/score
  ```

#### Questions

- **GET** `/api/questions/:role` - Get questions by role
  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    "https://ask-ai-master-89262-production.up.railway.app/api/questions/software-engineer?difficulty=medium"
  ```

#### Sessions (Alternative API)

- **POST** `/api/sessions` - Create session
- **GET** `/api/sessions` - Get user sessions
- **PATCH** `/api/sessions/:id` - Update session
- **GET** `/api/sessions/:id/responses` - Get session responses

#### Responses

- **POST** `/api/responses` - Create response

## Testing Workflow

### Step 1: Test Root Endpoint
```bash
curl https://ask-ai-master-89262-production.up.railway.app/
```

### Step 2: Create Account
```bash
curl -X POST https://ask-ai-master-89262-production.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test'$(date +%s)'@example.com","password":"Test123!","fullName":"Test User"}'
```

### Step 3: Sign In and Get Token
```bash
RESPONSE=$(curl -X POST https://ask-ai-master-89262-production.up.railway.app/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}')

TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Token: $TOKEN"
```

### Step 4: Test Protected Endpoints
```bash
# Get profile
curl -H "Authorization: Bearer $TOKEN" \
  https://ask-ai-master-89262-production.up.railway.app/api/profile

# Start interview
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"software-engineer","difficulty":"Medium"}' \
  https://ask-ai-master-89262-production.up.railway.app/api/interview/start
```

## Troubleshooting

### Database Connection Errors
If auth endpoints return 500 errors:
1. Check Railway Variables → `DATABASE_URL` is set
2. Verify database is accessible
3. Check Railway logs for connection errors

### Authentication Errors
- **401 Unauthorized**: Token missing or invalid
- **403 Forbidden**: Token expired or invalid user
- **Solution**: Sign in again to get new token

### Missing Health Endpoint
The health endpoint might not be registered. Check Railway logs or add it to routes.

## Notes

- All timestamps use Unix timestamp for unique emails
- Tokens expire after 7 days
- Most endpoints require authentication
- Check Railway logs for detailed error messages

