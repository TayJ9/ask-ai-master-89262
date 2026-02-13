# ElevenLabs Implementation Audit

**Date:** February 2026  
**Scope:** Voice interview flow using ElevenLabs Conversational AI SDK

---

## Step 1: Context Gathering

### MCP Models List

The ElevenLabs MCP `list_models` call returned **401 (missing_permissions)** — the API key lacks `models_read`. You can verify available models in the [ElevenLabs Dashboard](https://elevenlabs.io/app) or via the [Models API](https://elevenlabs.io/docs/api-reference/models/list) with an API key that has the `models_read` scope.

**Current TTS models (from public docs):**

| Model ID | Latency | Languages | Use Case |
|----------|---------|-----------|----------|
| `eleven_flash_v2_5` | **Lowest** (~75ms + network) | 32 | **Preferred for conversational AI** |
| `eleven_flash_v2` | Low | English only | English-only apps |
| `eleven_turbo_v2_5` | Medium | 32 | High quality, slightly higher latency |
| `eleven_turbo_v2` | Medium | Multilingual | Legacy |
| `eleven_multilingual_v2` | Higher | 29 | Legacy |

### Your Implementation

**Primary flow (frontend):**
- **File:** `frontend/src/components/VoiceInterviewWebSocket.tsx`
- **SDK:** `@elevenlabs/react` v0.13.0, `useConversation` hook
- **Flow:** Backend token endpoint → `get_signed_url` → `signedUrl` passed to `conversation.startSession()`
- **Connection:** SDK auto-upgrades to WebRTC when signed URL is used

**Backend token flow:**
- **File:** `backend/server/routes.ts` (lines ~1348–1386)
- **Endpoint:** `GET https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`
- **Headers:** `xi-api-key`

**Legacy WebSocket server (not used by frontend):**
- **File:** `backend/voiceServer.js`
- **URL:** `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=...&output_format=pcm_16000`
- **Flow:** Direct WebSocket with `conversation_init` message
- **Note:** Frontend uses signed URL flow; `voiceServer.js` is likely legacy or for a different path.

---

## Step 2: Audit Findings

### 1. Model ID

**Finding:** The TTS model is **not** passed in your code — it is set in the **ElevenLabs agent configuration** in the dashboard. The `get_signed_url` API only accepts `agent_id`, `include_conversation_id`, and `branch_id`; no `model_id` parameter exists.

**Implication:** To use `eleven_flash_v2_5` or another model, the agent must be updated in the ElevenLabs dashboard.

**Action:** In the ElevenLabs dashboard → your agent → **Voice & language** / **Model** settings, choose `eleven_flash_v2_5` for lowest latency.

---

### 2. Streaming / WebSocket URL

**Status:** ✅ Correct

| Component | Your Implementation | Expected |
|-----------|---------------------|----------|
| Token endpoint | `GET /v1/convai/conversation/get_signed_url?agent_id=${agentId}` | ✅ Matches |
| Frontend | `conversation.startSession({ signedUrl, ... })` | ✅ Matches |
| WebRTC upgrade | SDK handles automatically when using signed URL | ✅ Correct |
| Auth | `xi-api-key` header on server | ✅ Correct |

Your backend uses the standard pattern. The SDK uses the signed URL (WebSocket or WebRTC) as documented.

---

### 3. Voice Settings

**Your `startSession` options (VoiceInterviewWebSocket.tsx:1475–1485):**

```ts
voiceSettings: {
  stability: 0.5,        // Lower = more expressive
  similarityBoost: 0.75,
  style: 0.0,
  useSpeakerBoost: true,
},
```

**Per-model behavior:**
- **`eleven_flash_v2_5` / `eleven_turbo_v2_5`:** Full support for `stability`, `similarityBoost`, `style`, `useSpeakerBoost`.
- **Legacy models:** Some settings may be ignored.
- **Docs:** Stability 0.5–0.75 is recommended; your 0.5 is fine for expressiveness. Similarity 0.75 is within the typical range.

**Recommendation:** Keep current values for conversational interviews. If you hear artifacts or monotony, try `stability: 0.55–0.6` and `similarityBoost: 0.7–0.75`.

---

### 4. Legacy voiceServer.js

**File:** `backend/voiceServer.js`

| Setting | Value | Notes |
|---------|-------|-------|
| `ELEVENLABS_LLM` | `'gpt-5.1'` | ⚠️ Likely should be `gpt-4o-mini` or similar; verify in ElevenLabs docs |
| `ELEVENLABS_VOICE_ID` | `'kdmDKE6EkgrWrrykO9Qt'` | Configured |
| `conversation_init` | Sends `voice_id`, `llm`, `output_format` | No TTS model override |
| WebSocket URL | `?agent_id=...&output_format=pcm_16000` | Standard |

**Note:** If the frontend uses the signed URL flow (which it does), `voiceServer.js` may not be in the active path. Confirm whether it is still used.

---

### 5. SDK Version

**Current:** `@elevenlabs/react` v0.13.0 — up to date.

---

## Step 3: Action Plan

### Immediate (Dashboard)

1. **Set TTS model to `eleven_flash_v2_5`**
   - ElevenLabs Dashboard → Your Agent → Voice & language
   - Select `eleven_flash_v2_5` for lowest latency
   - If not available, use `eleven_turbo_v2_5` as a fallback

2. **Confirm LLM**
   - If using `voiceServer.js`, verify `gpt-5.1` is valid; otherwise use a supported LLM (e.g. `gpt-4o-mini`, `gemini-2.0-flash-001`).

### Optional (Code)

3. **Add `optimize_streaming_latency` (if supported)**
   - ElevenLabs supports a 0–4 latency optimization for some APIs.
   - The React SDK’s `startSession` may not expose this; confirm in the SDK docs. If it does, add it to `startOptions`.

4. **Document agent configuration**
   - Document the agent ID, model, and voice settings in `ELEVENLABS_AGENT_CONFIG.md` or similar so future changes are explicit.

### No Changes Needed

- API endpoints and URL structure
- `xi-api-key` authentication
- Signed URL flow and WebRTC upgrade
- `voiceSettings` (stability, similarityBoost, style, useSpeakerBoost)

---

## Summary Table

| Item | Status | Action |
|------|--------|--------|
| TTS model | Unknown (agent config) | Set to `eleven_flash_v2_5` in dashboard |
| Streaming URL | ✅ Correct | None |
| Voice settings | ✅ Reasonable | Optional tuning |
| LLM (voiceServer) | ⚠️ Verify | Confirm `gpt-5.1` vs supported LLMs |
| SDK version | ✅ 0.13.0 | None |

---

## References

- [ElevenLabs Get Signed URL API](https://elevenlabs.io/docs/api-reference/conversations/get-signed-url)
- [ElevenLabs Models Overview](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs Voice Customization](https://elevenlabs.io/docs/agents-platform/customization/voice)
- [@elevenlabs/react README](https://www.npmjs.com/package/@elevenlabs/react)
