# Audio Quality & Webhook Reliability Audit Report

## Executive Summary
This audit addresses reported audio quality issues ("poppy and low quality" on first question) and verifies webhook/API robustness. Findings indicate several areas for improvement in microphone constraints, connection warmup, and webhook error handling.

---

## 1. Audio Quality & Latency Issues (Frontend)

### 🔴 **CRITICAL: Microphone Constraints Too Aggressive**

**Location:** `frontend/src/components/VoiceInterviewWebSocket.tsx:704-712`

**Current Code:**
```typescript
const micPromise = navigator.mediaDevices.getUserMedia({ 
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,    // ⚠️ Too aggressive
    noiseSuppression: true,     // ⚠️ Too aggressive
    autoGainControl: true,      // ⚠️ Too aggressive
  } 
});
```

**Problem:** All three audio processing features (`echoCancellation`, `noiseSuppression`, `autoGainControl`) are enabled, causing aggressive audio gating at connection start. This creates the "poppy" effect as the browser's audio processing pipeline initializes.

**Fix:**
```typescript
const micPromise = navigator.mediaDevices.getUserMedia({ 
  audio: {
    sampleRate: 48000,  // ✅ Match Opus encoder expectations (ElevenLabs uses Opus)
    channelCount: 1,
    echoCancellation: true,     // Keep enabled for WebRTC
    noiseSuppression: false,     // ✅ Disable - ElevenLabs handles this server-side
    autoGainControl: false,     // ✅ Disable - prevents initial gating artifacts
    // Optional: Add latency constraints for lower latency
    latency: 0.01,  // Target 10ms latency
  } 
});
```

**Rationale:**
- `sampleRate: 48000` matches Opus encoder expectations (ElevenLabs uses Opus internally)
- `noiseSuppression: false` - ElevenLabs handles noise suppression server-side, browser processing adds latency
- `autoGainControl: false` - Prevents aggressive gating that causes "popping" at start
- `latency: 0.01` - Reduces buffering delay

---

### 🟡 **MEDIUM: No Jitter Buffer Implementation**

**Location:** `frontend/src/components/VoiceInterviewWebSocket.tsx:534-544`

**Current Code:**
The ElevenLabs SDK (`useConversation`) plays audio chunks immediately upon receipt. No buffering strategy exists.

**Problem:** Network fluctuations at connection start cause audio chunks to arrive irregularly, creating "popping" sounds.

**Fix:** Add a small initial buffer before starting playback:

```typescript
const conversation = useConversation({
  clientTools: null,
  preferHeadphonesForIosDevices: true,
  useWakeLock: true,
  // ✅ Add audio buffer configuration
  audioConfig: {
    minBufferSize: 3,  // Wait for 3 chunks before starting playback (eliminates initial pop)
    bufferSize: 5,      // Maintain 5-chunk buffer during playback
  },
  onConnect: handleConnect,
  onDisconnect: handleDisconnect,
  onMessage: handleMessage,
  onError: handleError,
});
```

**Note:** If the ElevenLabs SDK doesn't support `audioConfig`, implement a custom buffer in `handleMessage`:

```typescript
const audioBufferRef = useRef<ArrayBuffer[]>([]);
const isBufferingRef = useRef(true);
const MIN_BUFFER_CHUNKS = 3;

const handleMessage = useCallback((message: any) => {
  if (message.type === 'audio' && isBufferingRef.current) {
    audioBufferRef.current.push(message.audio);
    if (audioBufferRef.current.length >= MIN_BUFFER_CHUNKS) {
      isBufferingRef.current = false;
      // Play buffered chunks
      audioBufferRef.current.forEach(chunk => {
        // Play chunk via SDK
      });
      audioBufferRef.current = [];
    }
  } else if (message.type === 'audio' && !isBufferingRef.current) {
    // Play immediately after buffer is filled
  }
}, []);
```

---

### 🟡 **MEDIUM: No Connection Warmup**

**Location:** `frontend/src/components/VoiceInterviewWebSocket.tsx:606-937`

**Current Flow:**
1. User clicks "Start Interview"
2. Request microphone access
3. Fetch signed URL token
4. Establish WebSocket connection
5. Start session

**Problem:** All connection steps happen sequentially after user clicks "Start", causing initial latency and audio artifacts.

**Fix:** Pre-warm connection before user clicks "Start":

```typescript
// Add pre-warming effect
useEffect(() => {
  // Pre-warm microphone access (don't await, just request)
  if (!hasStarted && !isStarting) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Stop immediately - we just wanted to warm up the permission
        stream.getTracks().forEach(track => track.stop());
        console.log('[PRE-WARM] Microphone permission cached');
      })
      .catch(() => {
        // Ignore errors - user will grant permission when they click Start
      });
  }
}, [hasStarted, isStarting]);

// Pre-fetch token when component mounts (optional - can be done on hover over Start button)
const preWarmToken = useCallback(async () => {
  if (isTokenRequesting || hasStarted) return;
  
  try {
    // Fetch token but don't start session yet
    const response = await fetch('/api/conversation-token', { ... });
    const data = await response.json();
    // Cache token for immediate use when user clicks Start
    tokenCacheRef.current = data.signed_url;
  } catch (error) {
    // Ignore - will fetch on Start click
  }
}, [isTokenRequesting, hasStarted]);
```

---

### 🟢 **LOW: ElevenLabs Voice Settings Not Configured**

**Location:** `frontend/src/components/VoiceInterviewWebSocket.tsx:888-891`

**Current Code:**
No `voice_settings` are passed to the SDK. Defaults are used.

**Problem:** Default stability may be too low (causing sporadic pops) or too high (monotone).

**Fix:** Add explicit voice settings:

```typescript
const startOptions: any = {
  signedUrl: signedUrl,
  dynamicVariables,
  // ✅ Add voice settings for consistent quality
  voiceSettings: {
    stability: 0.6,      // Balanced (0.5-0.75 range) - prevents pops while maintaining naturalness
    similarityBoost: 0.75, // High similarity for consistent voice
    style: 0.0,          // Neutral style
    useSpeakerBoost: true, // Enhance clarity
  },
};
```

**Note:** Verify if ElevenLabs SDK accepts `voiceSettings` in `startOptions`. If not, configure in ElevenLabs dashboard.

---

## 2. Webhook & API Reliability Issues (Backend)

### 🔴 **CRITICAL: Missing Individual Error Handling**

**Location:** `backend/server/routes.ts:1602-1670`

**Current Code:**
Database operations are not individually wrapped in try-catch blocks. A database lock on one operation can cause the entire webhook to fail.

**Problem:**
```typescript
const [interview] = await db.insert(interviews).values(interviewData as any).returning();
// ❌ No try-catch - if this fails, entire webhook fails

// Link this interview to any existing elevenlabs_interview_sessions record
const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({...});
// ❌ No try-catch - if this fails, interview is created but not linked

await db.update(elevenLabsInterviewSessions).set({...}).where(...);
// ❌ No try-catch - if this fails, webhook returns 500 even though interview was saved
```

**Fix:** Wrap each database operation in try-catch:

```typescript
// Insert interview record
let interview;
try {
  const [insertedInterview] = await db.insert(interviews).values(interviewData as any).returning();
  interview = insertedInterview;
  console.log(`[WEBHOOK] Interview saved successfully: ${interview.id}`);
} catch (dbError: any) {
  // Check for duplicate (idempotency)
  if (dbError.message?.includes('duplicate') || dbError.code === '23505') {
    const existingInterview = await (db.query as any).interviews?.findFirst({
      where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
    });
    if (existingInterview) {
      interview = existingInterview;
      console.log(`[WEBHOOK] Interview already exists: ${interview.id}`);
    } else {
      throw dbError; // Re-throw if not a duplicate
    }
  } else {
    throw dbError; // Re-throw other errors
  }
}

// Link to session (non-critical - don't fail webhook if this fails)
try {
  const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
    where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversation_id),
  });

  if (sessionByConversationId) {
    await db.update(elevenLabsInterviewSessions)
      .set({
        interviewId: interview.id,
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
    console.log(`[WEBHOOK] Linked interview ${interview.id} to session ${sessionByConversationId.id}`);
  }
} catch (linkError: any) {
  // Log but don't fail - interview is saved, linking can be retried
  console.error(`[WEBHOOK] Failed to link interview to session (non-critical):`, linkError);
}

// Enqueue evaluation (non-critical - don't fail webhook if this fails)
try {
  await evaluationQueue.enqueue(interview.id, conversation_id);
  console.log(`[WEBHOOK] Enqueued evaluation for interview ${interview.id}`);
} catch (evalError: any) {
  console.error(`[WEBHOOK] Failed to enqueue evaluation (non-critical):`, evalError);
  // Don't fail webhook - evaluation can be retried later
}
```

---

### 🟡 **MEDIUM: Status Transition Not Atomic**

**Location:** `backend/server/routes.ts:1560-1568, 1613-1620`

**Current Code:**
Status updates from `ended_pending_webhook` to `completed` happen in separate database calls without transaction.

**Problem:** If the webhook fails between updating the interview and updating the session, statuses can be inconsistent.

**Fix:** Use a transaction (if Drizzle supports it) or ensure idempotency:

```typescript
// Option 1: Use transaction (if Drizzle supports)
import { db } from "./db";

await db.transaction(async (tx) => {
  // Update interview
  await tx.update(interviews).set({ status: 'completed' }).where(...);
  
  // Update session
  await tx.update(elevenLabsInterviewSessions).set({ status: 'completed' }).where(...);
});

// Option 2: Ensure idempotency (current approach is OK, but add retry logic)
// The current code already checks for existing interview, which is good.
// Add explicit status check:
if (sessionByConversationId && sessionByConversationId.status !== 'completed') {
  await db.update(elevenLabsInterviewSessions)
    .set({
      interviewId: interview.id,
      status: 'completed',
      updatedAt: new Date(),
    })
    .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
}
```

---

### 🟢 **LOW: Webhook Idempotency Could Be More Robust**

**Location:** `backend/server/routes.ts:1548-1584`

**Current Code:**
Checks for existing interview by `conversation_id` and returns early. This is good, but could handle edge cases better.

**Fix:** Add more robust idempotency checks:

```typescript
// Check if interview already exists (prevent duplicates)
const existingInterview = await (db.query as any).interviews?.findFirst({
  where: (interviews: any, { eq }: any) => eq(interviews.conversationId, conversation_id),
});

if (existingInterview) {
  console.log(`[WEBHOOK] Interview with conversation_id ${conversation_id} already exists (id: ${existingInterview.id})`);
  
  // ✅ Verify transcript hasn't changed (if webhook fires twice with different data)
  if (transcript && existingInterview.transcript !== transcript) {
    console.warn(`[WEBHOOK] Transcript mismatch for existing interview - updating`);
    await db.update(interviews)
      .set({ transcript })
      .where(eq(interviews.id, existingInterview.id));
  }
  
  // Link to session if not already linked (idempotent)
  const sessionByConversationId = await (db.query as any).elevenLabsInterviewSessions?.findFirst({
    where: (sessions: any, { eq }: any) => eq(sessions.conversationId, conversation_id),
  });
  
  if (sessionByConversationId && !sessionByConversationId.interviewId) {
    try {
      await db.update(elevenLabsInterviewSessions)
        .set({
          interviewId: existingInterview.id,
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(elevenLabsInterviewSessions.id, sessionByConversationId.id));
      console.log(`[WEBHOOK] Linked existing interview ${existingInterview.id} to session ${sessionByConversationId.id}`);
    } catch (linkError: any) {
      // Don't fail if link already exists
      if (!linkError.message?.includes('duplicate')) {
        console.error(`[WEBHOOK] Error linking existing interview:`, linkError);
      }
    }
  }
  
  // Enqueue evaluation if not already complete
  const existingEvaluation = await (db.query as any).interviewEvaluations?.findFirst({
    where: (evaluations: any, { eq }: any) => eq(evaluations.interviewId, existingInterview.id),
  });
  
  if (!existingEvaluation || existingEvaluation.status === 'failed') {
    evaluationQueue.enqueue(existingInterview.id, conversation_id).catch((error: any) => {
      console.error(`[WEBHOOK] Failed to enqueue evaluation:`, error);
    });
  }
  
  // ✅ Always return success for idempotent operations
  return res.json({ 
    success: true, 
    message: 'Interview already exists',
    interviewId: existingInterview.id 
  });
}
```

---

## Summary of Required Changes

### Frontend (`frontend/src/components/VoiceInterviewWebSocket.tsx`)

1. **Line 704-712:** Update `getUserMedia` constraints:
   - Change `sampleRate` to `48000`
   - Set `noiseSuppression: false`
   - Set `autoGainControl: false`
   - Add `latency: 0.01`

2. **Line 534-544:** Add audio buffer configuration to `useConversation`:
   - Add `minBufferSize: 3` to eliminate initial pop
   - Add `bufferSize: 5` for smooth playback

3. **After line 605:** Add connection pre-warming effect:
   - Pre-request microphone permission
   - Optionally pre-fetch token on component mount

4. **Line 888-891:** Add `voiceSettings` to `startOptions`:
   - `stability: 0.6`
   - `similarityBoost: 0.75`
   - `useSpeakerBoost: true`

### Backend (`backend/server/routes.ts`)

1. **Line 1602-1670:** Wrap database operations in individual try-catch blocks:
   - Interview insert: Handle duplicates gracefully
   - Session linking: Non-critical, log errors but don't fail webhook
   - Evaluation enqueue: Non-critical, log errors but don't fail webhook

2. **Line 1552-1584:** Enhance idempotency checks:
   - Verify transcript consistency
   - Handle duplicate link attempts gracefully
   - Always return success for idempotent operations

3. **Line 1613-1620:** Add status check before updating:
   - Only update if status is not already `completed`

---

## Expected Impact

### Audio Quality Improvements:
- ✅ Eliminates "poppy" sound on first question (reduced gating artifacts)
- ✅ Smoother audio playback (jitter buffer prevents network fluctuation artifacts)
- ✅ Lower latency (pre-warmed connection, optimized sample rate)
- ✅ More consistent voice quality (explicit voice settings)

### Webhook Reliability Improvements:
- ✅ Webhook won't fail if non-critical operations (linking, evaluation) fail
- ✅ Better handling of duplicate webhook calls
- ✅ More robust error recovery
- ✅ Consistent status transitions

---

## Testing Checklist

- [ ] Test audio quality on first question (should be smooth, no popping)
- [ ] Test connection latency (should be < 2 seconds from click to audio)
- [ ] Test webhook idempotency (send same webhook twice, verify no errors)
- [ ] Test webhook with database lock (simulate lock, verify graceful handling)
- [ ] Test early interview termination (verify webhook still processes correctly)
- [ ] Test network fluctuation (simulate packet loss, verify audio buffer handles it)
