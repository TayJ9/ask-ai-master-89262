/**
 * Simple Voice Interview JavaScript
 * Records microphone audio and plays TTS responses
 */

class VoiceInterview {
  constructor(options) {
    this.sessionId = options.sessionId;
    // Use provided apiBaseUrl or get from centralized utility
    this.apiBaseUrl = options.apiBaseUrl || this.getApiBaseUrl();
    this.authToken = options.authToken || localStorage.getItem('auth_token');
    
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isProcessing = false;
    this.currentAudio = null;
    
    this.onTranscript = options.onTranscript || (() => {});
    this.onAgentResponse = options.onAgentResponse || (() => {});
    this.onError = options.onError || ((error) => console.error(error));
  }

  /**
   * Get API base URL from environment or use relative URLs
   */
  getApiBaseUrl() {
    // Check for NEXT_PUBLIC_API_URL (Vercel) or VITE_API_URL (Vite)
    // In browser, these are available via window or build-time injection
    if (typeof window !== 'undefined') {
      // Check if injected at build time
      const env = window.__ENV__ || {};
      if (env.NEXT_PUBLIC_API_URL) {
        return env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
      }
      if (env.VITE_API_URL) {
        return env.VITE_API_URL.replace(/\/$/, '');
      }
    }
    // Fallback to relative URLs
    return '';
  }

  /**
   * Start voice interview session
   */
  async start(role, resumeText = '', difficulty = 'Medium') {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/voice-interview/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          session_id: this.sessionId,
          role: role,
          resumeText: resumeText,
          difficulty: difficulty,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start voice interview');
      }

      const data = await response.json();
      
      // Play initial audio response
      if (data.audioResponse) {
        await this.playAudio(data.audioResponse);
      }
      
      // Callback with agent response text
      if (data.agentResponseText) {
        this.onAgentResponse(data.agentResponseText);
      }
      
      return data;
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }

  /**
   * Start recording microphone
   */
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        }
      });

      // Use WebM Opus for audio compatibility
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 64000
      };

      this.mediaRecorder = new MediaRecorder(stream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.handleRecordingStop();
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording = true;
      
      console.log('Recording started');
    } catch (error) {
      this.onError(new Error('Microphone access denied or unavailable'));
      throw error;
    }
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      console.log('Recording stopped');
    }
  }

  /**
   * Handle recording stop and send audio
   */
  async handleRecordingStop() {
    this.isProcessing = true;
    
    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
      
      // Convert to base64
      const base64Audio = await this.blobToBase64(audioBlob);
      
      // Send to backend
      const response = await fetch(`${this.apiBaseUrl}/api/voice-interview/send-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          session_id: this.sessionId,
          audio: base64Audio,
          audioEncoding: 'AUDIO_ENCODING_WEBM_OPUS',
          sampleRate: 24000,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send audio');
      }

      const data = await response.json();
      
      // Callback with user transcript
      if (data.userTranscript) {
        this.onTranscript(data.userTranscript);
      }
      
      // Play agent audio response
      if (data.audioResponse) {
        await this.playAudio(data.audioResponse);
      }
      
      // Callback with agent response text
      if (data.agentResponseText) {
        this.onAgentResponse(data.agentResponseText);
      }
      
      // Check if interview is complete
      if (data.isEnd) {
        console.log('Interview complete');
      }
      
      return data;
    } catch (error) {
      this.onError(error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Play audio from base64 MP3
   */
  async playAudio(base64Audio) {
    return new Promise((resolve, reject) => {
      try {
        // Stop any currently playing audio
        if (this.currentAudio) {
          this.currentAudio.pause();
          this.currentAudio = null;
        }

        // Convert base64 to audio blob
        const audioBytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
        const audioBlob = new Blob([audioBytes], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const audio = new Audio(audioUrl);
        this.currentAudio = audio;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          this.currentAudio = null;
          resolve();
        };

        audio.onerror = (e) => {
          URL.revokeObjectURL(audioUrl);
          this.currentAudio = null;
          reject(new Error('Audio playback error'));
        };

        audio.play().catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Convert blob to base64
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Complete interview and get score
   */
  async completeInterview() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/voice-interview/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          session_id: this.sessionId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to score interview');
      }

      return await response.json();
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stopRecording();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }
}

// Example usage:
/*
const interview = new VoiceInterview({
  sessionId: 'your-session-id',
  apiBaseUrl: '', // Leave empty if same origin
  authToken: localStorage.getItem('auth_token'),
  onTranscript: (transcript) => {
    console.log('User said:', transcript);
  },
  onAgentResponse: (text) => {
    console.log('Agent said:', text);
  },
  onError: (error) => {
    console.error('Error:', error);
  }
});

// Start interview
await interview.start('software-engineer', '', 'Medium');

// Start recording (user speaks)
await interview.startRecording();

// Stop recording (will auto-send and play response)
interview.stopRecording();

// Complete interview
const results = await interview.completeInterview();
*/

export default VoiceInterview;


