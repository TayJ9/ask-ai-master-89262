# Quick Start Guide - Voice Interview System

## ✅ Setup Verification

Run the verification script to check your setup:
```bash
node verify_setup.js
```

## 🚀 Starting the Server

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Production Mode
```bash
npm run server
```

The server will start on port 3001 (or the PORT specified in your .env file).

## 📋 Prerequisites Checklist

- [x] ✅ All dependencies installed (`express`, `cors`, `dotenv`, `ws`, `multer`, `uuid`)
- [x] ✅ `.env` file exists with `OPENAI_API_KEY` set
- [x] ✅ `backend/voiceServer.js` created
- [x] ✅ `server.js` updated with voice server integration
- [x] ✅ Frontend components updated
- [x] ✅ `uploads/` directory exists

## 🧪 Testing the System

### 1. Test Health Endpoint
```bash
curl http://localhost:3001/health
```
Expected response: `{"status":"healthy"}`

### 2. Test Resume Upload Endpoint
```bash
curl -X POST http://localhost:3001/api/upload-resume \
  -F "resume=@test_resume.pdf" \
  -F "name=John Doe" \
  -F "major=Computer Science" \
  -F "year=Junior"
```
Expected response: `{"sessionId":"...", "candidateName":"John Doe"}`

### 3. Test WebSocket Connection
```bash
node test_voice_server.js
```
Or use a WebSocket client to connect to `ws://localhost:3001/voice`

## 🌐 Using the Frontend

1. **Navigate to your site**: https://mockly.replit.app
2. **Login**: Authenticate with your credentials
3. **Select Role**: Choose a role and difficulty level
4. **Choose Voice Interview**: Select "Voice Interview" mode
5. **Fill Candidate Info**: 
   - Enter your full name
   - Enter your major/field
   - Enter your academic year
6. **Upload Resume**: Upload a PDF resume or paste resume text
7. **Start Interview**: The WebSocket connection will establish automatically
8. **Speak**: Click the microphone button to start speaking
9. **Listen**: AI responses will play automatically
10. **View Transcript**: See live transcriptions in the transcript panel
11. **End Interview**: Click "End Interview" when finished

## 🔧 Troubleshooting

### Server won't start
- Check if port 3001 is available: `lsof -i :3001`
- Verify `.env` file exists and has `OPENAI_API_KEY`
- Check dependencies: `npm install`

### WebSocket connection fails
- Verify server is running: `curl http://localhost:3001/health`
- Check browser console for errors
- Ensure WebSocket URL matches server URL

### Microphone access denied
- Check browser permissions
- Use HTTPS (required for microphone access)
- Try refreshing the page

### OpenAI API errors
- Verify `OPENAI_API_KEY` is correct in `.env`
- Check API key has access to Realtime API
- Review server logs for detailed error messages

## 📁 File Structure

```
workspace/
├── server.js                    # Main Express server
├── upload.js                    # Resume upload route handler
├── backend/
│   └── voiceServer.js          # WebSocket voice server
├── src/
│   ├── components/
│   │   ├── ResumeUpload.tsx    # Resume upload component
│   │   └── VoiceInterviewWebSocket.tsx  # WebSocket voice interview
│   └── pages/
│       └── Index.tsx           # Main page with routing
├── uploads/                     # Temporary file storage
├── resume_parser.py             # Python resume parser
└── .env                         # Environment variables
```

## 🔗 Endpoints

- `GET /health` - Health check
- `POST /api/upload-resume` - Upload resume and get sessionId
- `WS /voice` - WebSocket endpoint for voice interview

## 📝 Environment Variables

Required in `.env`:
```bash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001  # Optional, defaults to 3001
```

## 🎯 Next Steps After Setup

1. ✅ Verify setup: `node verify_setup.js`
2. ✅ Start server: `npm run dev`
3. ✅ Test endpoints (see Testing section above)
4. ✅ Open frontend and test voice interview flow
5. ✅ Monitor server logs for any issues

## 📞 Support

If you encounter issues:
1. Check server logs for error messages
2. Run verification script: `node verify_setup.js`
3. Check browser console for frontend errors
4. Verify all environment variables are set correctly

