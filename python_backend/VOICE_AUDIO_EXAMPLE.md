# Simple JavaScript Example for Voice Interview

## Complete Frontend Code for Recording and Playing Audio

Here's a simple, standalone JavaScript example that shows how to:
1. Record microphone audio
2. Send raw audio file to the backend
3. Receive and play the audio response

```html
<!DOCTYPE html>
<html>
<head>
    <title>Voice Interview - Simple Example</title>
</head>
<body>
    <h1>Voice Interview</h1>
    
    <div>
        <button id="startBtn">Start Recording</button>
        <button id="stopBtn" disabled>Stop Recording</button>
        <button id="playBtn" disabled>Play Response</button>
    </div>
    
    <div>
        <p>Status: <span id="status">Ready</span></p>
        <p>Recording Duration: <span id="duration">0</span>s</p>
    </div>
    
    <audio id="audioPlayer" controls style="display: none;"></audio>
    
    <div>
        <h3>Transcript:</h3>
        <p id="transcript">No transcript yet...</p>
    </div>

    <script>
        const API_URL = '/api/voice-interview/send-audio'; // Your backend endpoint
        const SESSION_ID = 'your-session-id-here'; // Replace with actual session ID
        
        let mediaRecorder;
        let audioChunks = [];
        let recordingStartTime;
        let durationInterval;
        
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const playBtn = document.getElementById('playBtn');
        const statusEl = document.getElementById('status');
        const durationEl = document.getElementById('duration');
        const transcriptEl = document.getElementById('transcript');
        const audioPlayer = document.getElementById('audioPlayer');
        
        // Start recording
        startBtn.addEventListener('click', async () => {
            try {
                // Request microphone access
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 24000,
                    }
                });
                
                // Create MediaRecorder with WebM Opus codec
                const options = {
                    mimeType: 'audio/webm;codecs=opus',
                    audioBitsPerSecond: 64000
                };
                
                mediaRecorder = new MediaRecorder(stream, options);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = async () => {
                    // Stop all tracks
                    stream.getTracks().forEach(track => track.stop());
                    
                    // Send audio to backend
                    await sendAudioToBackend();
                };
                
                // Start recording
                mediaRecorder.start(1000); // Collect data every second
                recordingStartTime = Date.now();
                
                // Update UI
                startBtn.disabled = true;
                stopBtn.disabled = false;
                statusEl.textContent = 'Recording...';
                
                // Start duration timer
                durationInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                    durationEl.textContent = elapsed;
                }, 1000);
                
            } catch (error) {
                console.error('Error accessing microphone:', error);
                statusEl.textContent = 'Error: Could not access microphone';
                alert('Could not access microphone. Please check permissions.');
            }
        });
        
        // Stop recording
        stopBtn.addEventListener('click', () => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                clearInterval(durationInterval);
                startBtn.disabled = false;
                stopBtn.disabled = true;
                statusEl.textContent = 'Processing...';
            }
        });
        
        // Send audio to backend
        async function sendAudioToBackend() {
            try {
                // Create audio blob from recorded chunks
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                
                // Create FormData
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.webm');
                formData.append('session_id', SESSION_ID);
                formData.append('audioEncoding', 'AUDIO_ENCODING_WEBM_OPUS');
                formData.append('sampleRate', '24000');
                
                // Get auth token (if you have authentication)
                const token = localStorage.getItem('auth_token') || '';
                
                // Send to backend
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        // Don't set Content-Type - browser will set it with boundary for FormData
                    },
                    body: formData,
                });
                
                if (!response.ok) {
                    // Handle error
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to send audio');
                    } else {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                }
                
                // Check response type
                const contentType = response.headers.get('content-type');
                
                // Extract metadata from headers
                const agentText = response.headers.get('X-Response-Text') || '';
                const userTranscript = response.headers.get('X-Response-Transcript') || '';
                const isEnd = response.headers.get('X-Response-IsEnd') === 'true';
                
                // Update transcript
                if (userTranscript) {
                    transcriptEl.textContent = `User: ${userTranscript}`;
                }
                
                // Handle audio response
                if (contentType && contentType.includes('audio/')) {
                    // Response is raw audio file (MP3)
                    const audioBlob = await response.blob();
                    const audioUrl = URL.createObjectURL(audioBlob);
                    
                    // Set audio source and play
                    audioPlayer.src = audioUrl;
                    audioPlayer.style.display = 'block';
                    playBtn.disabled = false;
                    
                    // Auto-play
                    audioPlayer.play().catch(err => {
                        console.error('Auto-play prevented:', err);
                        statusEl.textContent = 'Click Play to hear response';
                    });
                    
                    // Update status when audio ends
                    audioPlayer.onended = () => {
                        statusEl.textContent = 'Ready';
                        URL.revokeObjectURL(audioUrl);
                    };
                    
                    statusEl.textContent = 'Playing response...';
                    
                    if (isEnd) {
                        statusEl.textContent = 'Interview Complete!';
                        startBtn.disabled = true;
                        stopBtn.disabled = true;
                    }
                } else {
                    // Response is JSON (fallback)
                    const data = await response.json();
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    statusEl.textContent = 'No audio response received';
                }
                
            } catch (error) {
                console.error('Error sending audio:', error);
                statusEl.textContent = `Error: ${error.message}`;
                alert(`Error: ${error.message}`);
            }
        }
        
        // Play button (manual play)
        playBtn.addEventListener('click', () => {
            audioPlayer.play();
        });
    </script>
</body>
</html>
```

## Alternative: Using WAV Format

If you want to use WAV format instead of WebM Opus:

```javascript
// For WAV recording, you'll need to use a library like 'recorder.js'
// Or convert WebM to WAV on the client side

// Example with WAV:
const options = {
    mimeType: 'audio/wav',
    audioBitsPerSecond: 128000
};

// In FormData:
formData.append('audio', audioBlob, 'recording.wav');
formData.append('audioEncoding', 'AUDIO_ENCODING_LINEAR_16');
formData.append('sampleRate', '16000'); // WAV typically uses 16kHz
```

## Key Points

1. **Recording**: Uses `MediaRecorder` API with WebM Opus codec
2. **Sending**: Uses `FormData` to send raw audio file (not base64)
3. **Receiving**: Checks `Content-Type` header to determine if response is audio or JSON
4. **Metadata**: Extracts transcript and status from response headers (`X-Response-*`)
5. **Playing**: Creates audio blob URL and plays directly in HTML5 Audio element

## Backend Endpoint

The backend endpoint `/api/voice-interview/send-audio`:
- Accepts `multipart/form-data` with `audio` file
- Returns raw MP3 audio file with `Content-Type: audio/mpeg`
- Includes metadata in response headers:
  - `X-Response-Text`: Agent's response text
  - `X-Response-Transcript`: User's transcribed speech
  - `X-Response-IsEnd`: Whether interview is complete
  - `X-Response-Intent`: Dialogflow intent name

