# Migration Preservation Guide: OpenAI → ElevenLabs

## ⚠️ CRITICAL: Components That MUST NOT Be Changed

This document identifies all critical components that should be preserved during the migration from OpenAI Realtime API to ElevenLabs Conversational AI. These components represent core business logic, user experience, and system architecture that should remain intact.

---

## 1. System Prompt & Interview Logic (MUST PRESERVE)

### File: `backend/voiceServer.js`
### Function: `createSystemPrompt(candidateContext)`

**CRITICAL - DO NOT MODIFY:**
- ✅ Complete system prompt text (lines 71-180)
- ✅ Major category detection logic (CS, Finance, Engineering, Business, Psychology)
- ✅ Technical difficulty calculation based on academic year
- ✅ Behavioral vs technical question ratio calculation
- ✅ Interview structure and timing (15-20 minutes)
- ✅ Tone and approach guidelines (warm, encouraging, confidence-building)
- ✅ Question framing and response handling principles
- ✅ Dynamic adjustment logic based on candidate responses

**Why Preserve:**
- This is the core interview intelligence that makes the system effective
- Years of refinement in question tailoring and candidate assessment
- Critical for maintaining interview quality regardless of voice provider

**Migration Note:**
- The system prompt text should be passed to ElevenLabs API in the same format
- Only the API call structure changes, not the prompt content

---

## 2. Frontend Component Structure (MUST PRESERVE)

### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**CRITICAL - DO NOT MODIFY:**

#### 2.1 Component Props Interface
```typescript
interface VoiceInterviewWebSocketProps {
  sessionId: string;
  candidateContext: {
    name: string;
    major: string;
    year: string;
    skills?: string[];
    experience?: string;
    education?: string;
    summary?: string;
  };
  onComplete: (results?: any) => void;
}
```
- ✅ Keep exact same interface - used by parent components

#### 2.2 State Management
- ✅ `isConnected`, `isInterviewActive`, `isRecording`, `isPlaying`, `isProcessing`
- ✅ `statusMessage` - critical for user feedback
- ✅ `transcripts` - transcript display and management
- ✅ `conversationState` - state machine: `'ai_speaking' | 'listening' | 'user_speaking' | 'processing'`
- ✅ All refs: `wsRef`, `audioContextRef`, `mediaStreamRef`, `audioQueueRef`, etc.

**Why Preserve:**
- State machine ensures proper conversation flow
- User experience depends on accurate state transitions
- Audio queue management prevents playback issues

---

## 3. Audio Processing Pipeline (MUST PRESERVE)

### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**CRITICAL - DO NOT MODIFY:**

#### 3.1 Audio Format Conversion
- ✅ `convertToPCM16(float32Array)` - converts microphone input to PCM16
- ✅ `convertPCM16ToFloat32(pcm16Array)` - converts received audio to Float32
- ✅ AudioContext sample rate: **24000 Hz** (must match ElevenLabs output)

#### 3.2 Audio Queue Management
- ✅ `queueAudioChunk(arrayBuffer)` - queues audio chunks for playback
- ✅ `processAudioQueue()` - processes queue with precise timing
- ✅ Queue size limits: MAX_QUEUE_SIZE = 30, WARN_QUEUE_SIZE = 20
- ✅ Queue clearing logic on interruption
- ✅ Timing drift handling and chunk dropping logic

#### 3.3 Audio Playback
- ✅ `nextPlayTimeRef` - precise scheduling for seamless playback
- ✅ `activeSourcesRef` - tracks active audio sources for cleanup
- ✅ Gain node configuration (0.85 gain to prevent clipping)
- ✅ Audio source cleanup on interruption

**Why Preserve:**
- Prevents audio crackling, popping, and synchronization issues
- Ensures smooth playback regardless of network conditions
- Critical for professional audio quality

**Migration Note:**
- Verify ElevenLabs audio output format matches (PCM16, 24kHz)
- May need to adjust decoder if format differs, but keep queue logic

---

## 4. Conversation State Machine (MUST PRESERVE)

### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**CRITICAL - DO NOT MODIFY:**

#### 4.1 State Transitions
- ✅ `ai_speaking` → `listening` → `user_speaking` → `processing` → `ai_speaking`
- ✅ State transition logging (`logStateTransition`, `setConversationStateWithLogging`)
- ✅ State timeout handling (30s max for AI response)
- ✅ State-based UI updates and status messages

#### 4.2 Turn-Taking Logic
- ✅ User interruption detection and handling
- ✅ AI response cancellation on user speech start
- ✅ Queue clearing on interruption
- ✅ Transcript preservation during interruptions

**Why Preserve:**
- Ensures natural conversation flow
- Prevents AI from interrupting users
- Critical for interview quality

**Migration Note:**
- ElevenLabs may have different interruption signals - adapt API calls, not state logic

---

## 5. Transcript Handling (MUST PRESERVE)

### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**CRITICAL - DO NOT MODIFY:**

#### 5.1 Transcript State Management
- ✅ `TranscriptMessage` interface: `type`, `text`, `isFinal`, `timestamp`
- ✅ Transcript accumulation logic (non-final + final updates)
- ✅ Pending transcript handling during interruptions
- ✅ Transcript display in UI

#### 5.2 Transcript Processing
- ✅ AI transcript delta accumulation
- ✅ Student transcript delta accumulation
- ✅ Final transcript marking
- ✅ Transcript preservation on interruption

**Why Preserve:**
- Users rely on accurate transcripts
- Transcript accuracy is critical for interview assessment
- Display logic is tightly coupled with state management

**Migration Note:**
- ElevenLabs transcript format may differ - adapt parsing, not display logic

---

## 6. WebSocket Message Handling (ADAPT, DON'T REWRITE)

### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`
### File: `backend/voiceServer.js`

**PRESERVE STRUCTURE, ADAPT MESSAGES:**

#### 6.1 Message Types to Preserve
- ✅ `connected` - connection confirmation
- ✅ `interview_starting` - interview initialization
- ✅ `interview_started` - interview active
- ✅ `ai_transcription` - AI speech transcript
- ✅ `student_transcription` - user speech transcript
- ✅ `student_speech_started` - user interruption detection
- ✅ `student_speech_ended` - user finished speaking
- ✅ `ai_response_done` - AI finished responding
- ✅ `ai_audio_done` - AI audio stream complete
- ✅ `error` - error handling

#### 6.2 Message Flow Logic
- ✅ Message routing and handling structure
- ✅ Error handling and retry logic
- ✅ Connection lifecycle management

**Why Preserve:**
- Message structure is used throughout the frontend
- Changing message types breaks UI components
- Error handling is critical for reliability

**Migration Note:**
- Map ElevenLabs events to existing message types
- Keep message structure identical, only change backend event mapping

---

## 7. UI Components & User Experience (MUST PRESERVE)

### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**CRITICAL - DO NOT MODIFY:**

#### 7.1 UI Elements
- ✅ Status indicators (AI speaking, recording, listening, processing)
- ✅ Microphone button and visual feedback
- ✅ Transcript display with AI/Student differentiation
- ✅ End interview button
- ✅ Loading states and error messages

#### 7.2 User Feedback
- ✅ Status messages for each conversation state
- ✅ Toast notifications for errors
- ✅ Visual indicators (AISpeakingIndicator, animated backgrounds)
- ✅ Button states and disabled states

**Why Preserve:**
- User experience is polished and tested
- Visual feedback is critical for user confidence
- UI consistency maintains professional appearance

---

## 8. Candidate Context Handling (MUST PRESERVE)

### File: `backend/voiceServer.js`
### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**CRITICAL - DO NOT MODIFY:**

#### 8.1 Context Structure
- ✅ Candidate information: name, major, year, skills, experience, education, summary
- ✅ Context validation before interview start
- ✅ Context passing to system prompt

#### 8.2 Context Usage
- ✅ Major-based question tailoring
- ✅ Year-based difficulty adjustment
- ✅ Skills-based question selection
- ✅ Experience-based follow-ups

**Why Preserve:**
- Core personalization logic
- Interview quality depends on context-aware questions
- Business logic for candidate assessment

---

## 9. Error Handling & Resilience (MUST PRESERVE)

### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`
### File: `backend/voiceServer.js`

**CRITICAL - DO NOT MODIFY:**

#### 9.1 Connection Resilience
- ✅ WebSocket retry logic (max 3 retries, exponential backoff)
- ✅ Connection timeout handling
- ✅ Reconnection on unexpected close

#### 9.2 Error Recovery
- ✅ Audio context suspension handling
- ✅ Microphone permission error handling
- ✅ API error message formatting
- ✅ User-friendly error messages

**Why Preserve:**
- Critical for production reliability
- User experience during failures
- Prevents data loss and session corruption

---

## 10. Logging & Monitoring (PRESERVE STRUCTURE)

### File: `backend/voiceServer.js`
### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**PRESERVE LOGGING STRUCTURE:**

#### 10.1 Backend Logging
- ✅ Model name logging
- ✅ Session configuration logging
- ✅ Turn detection event logging
- ✅ Session metrics (duration, message counts)

#### 10.2 Frontend Logging
- ✅ Queue size monitoring
- ✅ State transition logging
- ✅ Turn-taking timing logs
- ✅ Audio chunk metrics

**Why Preserve:**
- Critical for debugging
- Performance monitoring
- Issue diagnosis

**Migration Note:**
- Keep logging structure, adapt to ElevenLabs events

---

## 11. Configuration Constants (VERIFY COMPATIBILITY)

### File: `backend/voiceServer.js`
### File: `frontend/src/components/VoiceInterviewWebSocket.tsx`

**VERIFY THESE MATCH ELEVENLABS:**

- ⚠️ Audio sample rate: **24000 Hz** (must match ElevenLabs)
- ⚠️ Audio format: **PCM16** (verify ElevenLabs supports this)
- ⚠️ Turn detection: **server_vad** (ElevenLabs may use different VAD)
- ⚠️ Silence duration: **2500ms** (may need adjustment for ElevenLabs)
- ⚠️ Queue limits: **MAX_QUEUE_SIZE = 30** (keep if working)

---

## 12. Files That Should NOT Be Modified

### Core Business Logic Files:
- ✅ `backend/voiceServer.js` - `createSystemPrompt()` function (lines 10-180)
- ✅ `frontend/src/components/VoiceInterviewWebSocket.tsx` - Component structure and state management
- ✅ `frontend/src/components/InterviewSession.tsx` - Parent component integration

### Configuration Files:
- ✅ `package.json` - Dependencies (add ElevenLabs SDK, don't remove existing)
- ✅ `tsconfig.json` - TypeScript configuration
- ✅ `vercel.json` - Deployment configuration

---

## Migration Strategy

### Phase 1: API Layer Only
1. ✅ Create new `createElevenLabsConnection()` function (parallel to `createOpenAIConnection()`)
2. ✅ Map ElevenLabs events to existing message types
3. ✅ Keep all frontend code unchanged
4. ✅ Keep system prompt unchanged

### Phase 2: Testing
1. ✅ Test with same candidate contexts
2. ✅ Verify audio quality matches or exceeds OpenAI
3. ✅ Verify transcript accuracy
4. ✅ Verify turn-taking behavior

### Phase 3: Switchover
1. ✅ Add feature flag to switch between providers
2. ✅ Test both providers in parallel
3. ✅ Gradually migrate users
4. ✅ Keep OpenAI code as fallback

---

## Rollback Plan

If migration fails:
1. ✅ Revert to git tag: `openai-stable-checkpoint`
2. ✅ Restore `OPENAI_MODEL` constant
3. ✅ Restore `createOpenAIConnection()` usage
4. ✅ All preserved components remain intact

---

## Summary: What Changes vs What Stays

### ✅ STAYS THE SAME (Core Business Logic):
- System prompt and interview logic
- Frontend component structure
- Audio processing pipeline
- Conversation state machine
- Transcript handling
- UI components and UX
- Candidate context handling
- Error handling
- Logging structure

### 🔄 CHANGES (API Integration Only):
- WebSocket connection function (`createOpenAIConnection` → `createElevenLabsConnection`)
- API endpoint URLs
- Message event mapping (ElevenLabs events → existing message types)
- Audio decoder (if format differs)
- Environment variables (API keys)

---

## Critical Success Factors

1. ✅ **Preserve system prompt** - This is your competitive advantage
2. ✅ **Keep audio pipeline** - Prevents quality issues
3. ✅ **Maintain state machine** - Ensures conversation flow
4. ✅ **Preserve UI/UX** - User experience is polished
5. ✅ **Keep error handling** - Production reliability

---

## Questions to Answer Before Migration

1. ✅ Does ElevenLabs support PCM16 at 24kHz?
2. ✅ What is ElevenLabs transcript format?
3. ✅ How does ElevenLabs handle interruptions?
4. ✅ What is ElevenLabs latency compared to OpenAI?
5. ✅ Does ElevenLabs support system prompts?
6. ✅ What is ElevenLabs pricing vs OpenAI?

---

**Last Updated:** Before ElevenLabs Migration
**Checkpoint Tag:** `openai-stable-checkpoint`
**Commit Hash:** (will be set when tag is created)

