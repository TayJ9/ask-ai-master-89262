# Voice Interview Setup Guide

## Overview
This implementation uses Dialogflow CX's native Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities for voice conversations.

## Files Created

1. **`dialogflow_voice.py`** - Voice functions for Dialogflow CX audio input/output
2. **`app.py`** - Flask API server with voice endpoints
3. **`VoiceInterview.tsx`** - React component for voice interaction

## API Endpoints

### 1. Start Voice Interview
```
POST /api/voice-interview/start
Body: {
  "session_id": "...",
  "role": "software-engineer",
  "resumeText": "...",
  "difficulty": "Medium"
}
Response: {
  "sessionId": "...",
  "audioResponse": "base64_mp3",
  "audioFormat": "mp3",
  "agentResponseText": "..."
}
```

### 2. Send Audio
```
POST /api/voice-interview/send-audio
Body: {
  "session_id": "...",
  "audio": "base64_encoded_webm_opus",
  "audioEncoding": "AUDIO_ENCODING_WEBM_OPUS",
  "sampleRate": 24000
}
Response: {
  "audioResponse": "base64_mp3",
  "audioFormat": "mp3",
  "agentResponseText": "...",
  "userTranscript": "...",
  "isEnd": false
}
```

### 3. Score Interview
```
POST /api/voice-interview/score
Body: {
  "session_id": "..."
}
Response: {
  "overallScore": 85,
  "question_scores": [...],
  "summary": "..."
}
```

## Frontend JavaScript

The `VoiceInterview.tsx` component handles:
- Recording microphone audio (WebM Opus format)
- Sending audio to backend
- Playing MP3 audio responses
- Auto-starting recording after AI finishes speaking

## Audio Formats

- **Input**: WebM Opus (captured from browser)
- **Output**: MP3 (from Dialogflow TTS)
- **Sample Rate**: 24000 Hz
- **Voice**: en-US-Neural2-F (high-quality neural voice)

## Running on Replit

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables in Replit Secrets:
- `GOOGLE_CREDENTIALS`
- `GCP_PROJECT_ID` (or `DIALOGFLOW_PROJECT_ID`)
- `DF_AGENT_ID` (or `DIALOGFLOW_AGENT_ID`)
- `DF_LOCATION_ID` (optional, default: "us-central1")
- `GEMINI_API_KEY` (for scoring)

3. Run the Flask server:
```bash
python app.py
```

The server will run on port 5000 (or PORT environment variable).


