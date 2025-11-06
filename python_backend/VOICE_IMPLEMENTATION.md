# Voice Interview Implementation Guide

## Overview
This implementation enables voice conversations with Dialogflow CX using native STT (Speech-to-Text) and TTS (Text-to-Speech) capabilities, eliminating the need for external OpenAI services.

## Files Created

### Backend Files
1. **`dialogflow_voice.py`** - Core voice functions
   - `detect_intent_with_audio()` - Sends audio to Dialogflow, receives audio response
   - `start_voice_interview_session()` - Initializes voice interview with audio output

2. **`app.py`** - Flask API server
   - `/api/voice-interview/start` - Start voice interview
   - `/api/voice-interview/send-audio` - Send audio, receive audio response
   - `/api/voice-interview/score` - Score completed interview

### Frontend Files
1. **`VoiceInterview.tsx`** - React component with full UI
2. **`VoiceInterviewSimple.js`** - Simple JavaScript class for integration

## API Endpoints

### Start Voice Interview
```bash
POST /api/voice-interview/start
Content-Type: application/json
Authorization: Bearer <token>

{
  "session_id": "unique-session-id",
  "role": "software-engineer",
  "resumeText": "...",
  "difficulty": "Medium"
}

Response:
{
  "sessionId": "...",
  "audioResponse": "base64_encoded_mp3",
  "audioFormat": "mp3",
  "agentResponseText": "Hello, let's begin..."
}
```

### Send Audio
```bash
POST /api/voice-interview/send-audio
Content-Type: application/json
Authorization: Bearer <token>

{
  "session_id": "unique-session-id",
  "audio": "base64_encoded_webm_opus",
  "audioEncoding": "AUDIO_ENCODING_WEBM_OPUS",
  "sampleRate": 24000
}

Response:
{
  "audioResponse": "base64_encoded_mp3",
  "audioFormat": "mp3",
  "agentResponseText": "That's a great answer...",
  "userTranscript": "I have 5 years of experience...",
  "isEnd": false,
  "intent": "continue_interview"
}
```

### Score Interview
```bash
POST /api/voice-interview/score
Content-Type: application/json
Authorization: Bearer <token>

{
  "session_id": "unique-session-id"
}

Response:
{
  "overallScore": 85,
  "question_scores": [...],
  "summary": "..."
}
```

## Frontend JavaScript Usage

### Simple Integration (VoiceInterviewSimple.js)

```javascript
import VoiceInterview from './components/VoiceInterviewSimple.js';

const interview = new VoiceInterview({
  sessionId: 'your-session-id',
  apiBaseUrl: '', // Leave empty if same origin
  authToken: localStorage.getItem('auth_token'),
  onTranscript: (transcript) => {
    console.log('User said:', transcript);
    // Update UI with user transcript
  },
  onAgentResponse: (text) => {
    console.log('Agent said:', text);
    // Update UI with agent response
  },
  onError: (error) => {
    console.error('Error:', error);
    // Show error to user
  }
});

// 1. Start interview
await interview.start('software-engineer', '', 'Medium');

// 2. User clicks mic button - start recording
await interview.startRecording();

// 3. User clicks stop - automatically sends and plays response
interview.stopRecording();

// 4. Complete interview
const results = await interview.completeInterview();
```

### Recording Audio (WebM Opus)

```javascript
// Get microphone access
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 24000,
  }
});

// Create MediaRecorder with WebM Opus
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 64000
});

const audioChunks = [];
mediaRecorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    audioChunks.push(event.data);
  }
};

// Start recording
mediaRecorder.start(1000); // Collect data every second

// Stop recording
mediaRecorder.stop();

// Convert to base64
const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
const reader = new FileReader();
reader.readAsDataURL(audioBlob);
reader.onloadend = () => {
  const base64Audio = reader.result.split(',')[1];
  // Send to API
};
```

### Playing Audio Response (MP3)

```javascript
// Receive base64 MP3 from API
const base64Audio = response.audioResponse;

// Convert to audio blob
const audioBytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
const audioBlob = new Blob([audioBytes], { type: 'audio/mp3' });
const audioUrl = URL.createObjectURL(audioBlob);

// Play audio
const audio = new Audio(audioUrl);
audio.onended = () => {
  URL.revokeObjectURL(audioUrl);
  // Auto-start recording for next turn
};
audio.play();
```

## Audio Specifications

### Input (User Speech)
- **Format**: WebM Opus
- **Sample Rate**: 24000 Hz
- **Codec**: Opus
- **Bitrate**: 64000 bps
- **Recording**: Browser MediaRecorder API

### Output (AI Speech)
- **Format**: MP3
- **Voice**: en-US-Neural2-F (high-quality neural voice)
- **Encoding**: MP3
- **Source**: Dialogflow CX TTS (Chirp HD voices)

## Dialogflow CX Configuration

### Audio Encoding Enum
The backend uses `AudioEncoding` enum from Dialogflow CX:
- `AUDIO_ENCODING_WEBM_OPUS` (default)
- `AUDIO_ENCODING_LINEAR_16`
- `AUDIO_ENCODING_MULAW`
- `AUDIO_ENCODING_ALAW`

### Voice Configuration
```python
OutputAudioConfig(
    synthesize_speech_config={
        "voice": {
            "name": "en-US-Neural2-F",  # High-quality neural voice
            "ssml_gender": "FEMALE"
        },
        "audio_encoding": OutputAudioEncoding.OUTPUT_AUDIO_ENCODING_MP3,
        "speaking_rate": 1.0,
        "pitch": 0.0,
        "volume_gain_db": 0.0
    }
)
```

## Key Features

1. **Native STT/TTS**: Uses Dialogflow CX's built-in speech recognition and synthesis
2. **High-Quality Voices**: Uses Chirp HD neural voices (en-US-Neural2-F)
3. **Automatic Transcript**: Dialogflow provides user transcript automatically
4. **Seamless Conversation**: Auto-start recording after AI finishes speaking
5. **Error Handling**: Robust error handling for microphone, API, and audio playback

## Testing

1. **Start Interview**: Call `/api/voice-interview/start`
2. **Record Audio**: Use browser MediaRecorder to capture WebM Opus
3. **Send Audio**: POST to `/api/voice-interview/send-audio`
4. **Play Response**: Play MP3 audio from response
5. **Complete**: Call `/api/voice-interview/score` when done

## Troubleshooting

### Microphone Not Working
- Check browser permissions
- Ensure HTTPS (required for getUserMedia)
- Test with `navigator.mediaDevices.getUserMedia()`

### Audio Playback Issues
- Check browser autoplay policies
- Ensure audio blob is created correctly
- Verify base64 decoding

### Dialogflow Errors
- Verify credentials in environment variables
- Check session ID is consistent
- Ensure audio format matches (WebM Opus)

## Next Steps

1. Integrate `VoiceInterview.tsx` into your React app
2. Update your Node.js backend to proxy requests to Python Flask server
3. Test with real microphone input
4. Customize voice settings (rate, pitch, voice name)
5. Add visual feedback for recording/playing states


