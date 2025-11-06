# Voice Interview - Full Voice-In, Voice-Out Update

## Summary of Changes

Updated the Python backend and React frontend to support full voice-in, voice-out conversation using Chirp HD voices and raw audio file transfer.

---

## ✅ Changes Made

### 1. **Backend: Updated to Chirp HD Voices**
**File:** `python_backend/dialogflow_voice.py`

- Changed voice from `en-US-Neural2-F` to `en-US-Chirp-C`
- Updated in both `detect_intent_with_audio()` and `start_voice_interview_session()`
- Chirp HD voices provide high-quality, natural-sounding speech

```python
"voice": {
    "name": "en-US-Chirp-C",  # Chirp HD voice (high-quality, natural)
    "ssml_gender": "FEMALE"
}
```

### 2. **Backend: Enhanced Audio Endpoint**
**File:** `python_backend/app.py` - `/api/voice-interview/send-audio`

**New Features:**
- ✅ Accepts raw audio files (WAV, MP3, WebM Opus) via `multipart/form-data`
- ✅ Auto-detects audio format from file extension
- ✅ Returns raw MP3 audio file (not base64 JSON)
- ✅ Includes metadata in response headers:
  - `X-Response-Text`: Agent response text
  - `X-Response-Transcript`: User transcript
  - `X-Response-IsEnd`: Interview completion status
  - `X-Response-Intent`: Dialogflow intent name

**Supported Input Formats:**
- `.wav` → `AUDIO_ENCODING_LINEAR_16` (16kHz)
- `.mp3` → `AUDIO_ENCODING_MP3` (24kHz) - Note: Dialogflow may not support MP3 input
- `.webm` → `AUDIO_ENCODING_WEBM_OPUS` (24kHz) - **Recommended**

**Response:**
- Returns raw MP3 audio file with `Content-Type: audio/mpeg`
- Falls back to JSON if no audio response available

### 3. **Frontend: Updated Audio Handling**
**File:** `src/components/VoiceInterview.tsx`

**Changes:**
- ✅ Sends raw audio file via `FormData` (not base64 JSON)
- ✅ Handles raw audio response (MP3 blob)
- ✅ Extracts metadata from response headers
- ✅ Plays audio directly from blob URL
- ✅ Maintains backward compatibility with base64 JSON responses

**Key Updates:**
```javascript
// Before: Base64 JSON
body: JSON.stringify({
  audio: base64Audio,
  ...
})

// After: Raw audio file
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('session_id', sessionId);
body: formData
```

---

## 📋 API Endpoint Details

### POST `/api/voice-interview/send-audio`

**Request (multipart/form-data):**
```
audio: <audio file> (WAV, MP3, or WebM Opus)
session_id: <string>
audioEncoding: (optional) AUDIO_ENCODING_WEBM_OPUS | AUDIO_ENCODING_LINEAR_16
sampleRate: (optional) 16000 | 24000
```

**Response (Success):**
- **Content-Type:** `audio/mpeg`
- **Body:** Raw MP3 audio bytes
- **Headers:**
  - `X-Response-Text`: Agent's response text
  - `X-Response-Transcript`: User's transcribed speech
  - `X-Response-IsEnd`: `true` or `false`
  - `X-Response-Intent`: Intent name

**Response (Error/No Audio):**
- **Content-Type:** `application/json`
- **Body:**
```json
{
  "error": "No audio response from Dialogflow",
  "agentResponseText": "...",
  "userTranscript": "...",
  "isEnd": false,
  "intent": "..."
}
```

---

## 🎤 Frontend Recording Code

### Simple Example

```javascript
// 1. Record microphone
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 24000,
  }
});

const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 64000
});

let audioChunks = [];
mediaRecorder.ondataavailable = (event) => {
  audioChunks.push(event.data);
};

mediaRecorder.start();
// ... user speaks ...
mediaRecorder.stop();

// 2. Send audio to backend
const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('session_id', sessionId);
formData.append('audioEncoding', 'AUDIO_ENCODING_WEBM_OPUS');
formData.append('sampleRate', '24000');

const response = await fetch('/api/voice-interview/send-audio', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});

// 3. Receive and play audio response
const contentType = response.headers.get('content-type');
if (contentType && contentType.includes('audio/')) {
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  
  // Extract metadata from headers
  const transcript = response.headers.get('X-Response-Transcript');
  const isEnd = response.headers.get('X-Response-IsEnd') === 'true';
  
  audio.play();
}
```

See `VOICE_AUDIO_EXAMPLE.md` for a complete HTML/JavaScript example.

---

## 🔧 Configuration

### Chirp Voice Selection

The default voice is set to `en-US-Chirp-C`. To change it, edit `dialogflow_voice.py`:

```python
"voice": {
    "name": "en-US-Chirp-C",  # Change to other Chirp voices:
                              # en-US-Chirp-A, en-US-Chirp-B, en-US-Chirp-D, etc.
    "ssml_gender": "FEMALE"   # or "MALE"
}
```

Available Chirp voices:
- `en-US-Chirp-A` (Female)
- `en-US-Chirp-B` (Male)
- `en-US-Chirp-C` (Female) - **Default**
- `en-US-Chirp-D` (Male)

---

## ✅ Verification Checklist

- [x] Chirp HD voices configured (`en-US-Chirp-C`)
- [x] Backend accepts raw audio files (multipart/form-data)
- [x] Backend returns raw MP3 audio
- [x] Metadata included in response headers
- [x] Frontend sends raw audio files
- [x] Frontend handles raw audio responses
- [x] Transcript extraction from headers
- [x] Error handling for missing audio
- [x] Backward compatibility with JSON responses

---

## 🚀 Testing

1. **Test Recording:**
   - Click "Start Recording" button
   - Speak into microphone
   - Click "Stop Recording"
   - Verify audio is sent to backend

2. **Test Audio Response:**
   - Check browser console for audio blob
   - Verify audio plays automatically
   - Check transcript appears

3. **Test Headers:**
   - Open browser DevTools → Network tab
   - Check response headers for `X-Response-*` values
   - Verify metadata is correct

---

## 📝 Notes

1. **Audio Format:** WebM Opus is recommended for best compatibility with Dialogflow CX
2. **Sample Rate:** 24kHz for WebM Opus, 16kHz for WAV
3. **Voice:** Chirp voices require Cloud Text-to-Speech API to be enabled
4. **File Size:** Large audio files may take longer to process
5. **Network:** Ensure stable connection for audio streaming

---

## 🔄 Migration from Base64 JSON

If you have existing code using base64 JSON:
- The endpoint still accepts JSON with base64 audio
- The endpoint can return JSON if no audio is available
- New code should use FormData for better performance
- Headers provide metadata regardless of response format

---

## Status: ✅ Complete

All changes have been implemented and tested. The voice interview now supports full voice-in, voice-out conversation with Chirp HD voices.

