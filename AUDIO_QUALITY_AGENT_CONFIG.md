# Audio Quality Agent Configuration Guide

## Overview

This document outlines the recommended ElevenLabs agent configuration settings to achieve maximum audio fidelity (24kHz+), minimize latency (<400ms), and eliminate robotic artifacts in the AI Interviewer.

## Frontend Configuration

The frontend is configured with the following audio constraints:

- **Sample Rate:** 16kHz (optimal compatibility, reduces crackling and sample rate mismatches)
- **Bit Depth:** 16-bit
- **Channels:** Mono (1 channel)
- **Echo Cancellation:** Enabled (critical for speaker output)
- **Noise Suppression:** Enabled (can be disabled if audio sounds muffled)
- **Auto Gain Control:** Enabled (can be disabled if audio sounds muffled)

## ElevenLabs Agent Dashboard Configuration

### 1. Audio Codec Settings

**Recommended:** Opus codec
- **Why:** Opus provides excellent quality at low bitrates with minimal latency
- **Latency:** Typically <100ms encoding/decoding delay
- **Quality:** Supports 16kHz sample rate (matches frontend configuration)

**Configuration Steps:**
1. Navigate to ElevenLabs Dashboard → Your Agent → Settings
2. Find "Audio Codec" or "WebRTC Settings"
3. Select **Opus** as the preferred codec
4. Ensure WebRTC is enabled for lowest latency

### 2. Sample Rate Configuration

**Recommended:** 48kHz
- **Why:** Matches frontend constraints and provides studio-quality audio
- **Note:** Must match frontend `getUserMedia` sampleRate setting (currently 48kHz)

**Configuration Steps:**
1. In Agent Settings, locate "Sample Rate" or "Audio Quality"
2. Set to **48000 Hz** (48kHz)
3. Verify this matches the frontend configuration

### 3. Voice Model Quality Settings

**Recommended:** High or Ultra quality
- **Why:** Reduces robotic artifacts and improves naturalness
- **Trade-off:** Higher quality may increase processing time slightly

**Configuration Steps:**
1. In Agent Settings → Voice Model
2. Select **High** or **Ultra** quality (if available)
3. Avoid "Fast" or "Low" quality modes for interviews

### 4. WebRTC Settings

**Recommended:** Enabled
- **Why:** WebRTC provides lowest latency (<100ms) compared to WebSocket streaming
- **Current Implementation:** Frontend uses signed URL which automatically upgrades to WebRTC

**Configuration Steps:**
1. Ensure WebRTC is enabled in agent settings
2. Verify STUN/TURN servers are configured (if required)
3. Check that agent supports WebRTC connections

### 5. Voice Settings (Frontend-Controlled)

The frontend sends these voice settings with each session:

```typescript
voiceSettings: {
  stability: 0.5,        // Expressiveness over consistency
  similarityBoost: 0.75,  // Balanced similarity (prevents artifacts)
  style: 0.0,            // Neutral for professional interviews
  useSpeakerBoost: true   // Enhanced clarity
}
```

**Note:** These are sent per-session and override agent defaults. No dashboard configuration needed.

## Latency Optimization

### Target: <400ms End-to-End Latency

**Latency Components:**
1. **Frontend Processing:** ~50ms (getUserMedia → encoding)
2. **Network:** ~50-100ms (WebRTC transport)
3. **ElevenLabs Processing:** ~100-200ms (STT → LLM → TTS)
4. **Audio Playback:** ~50ms (decoding → browser audio)

**Total Expected:** ~250-400ms

### Monitoring

The frontend logs latency measurements:
- `[Audio Latency] User stopped speaking at: <timestamp>`
- `[Audio Latency] Round Trip: <X> ms (User stopped speaking → AI audio started)`

Check browser console during interviews to verify latency targets.

## Troubleshooting

### Audio Sounds Muffled or Underwater

**Symptom:** Audio quality is degraded, sounds like it's underwater

**Solution:**
1. Disable browser noise suppression and auto gain control
2. Edit `VoiceInterviewWebSocket.tsx` line ~860:
   ```typescript
   noiseSuppression: false,  // Disable browser processing
   autoGainControl: false,  // Disable browser processing
   ```

### High Latency (>400ms)

**Check:**
1. Verify WebRTC is being used (check browser Network tab for WebRTC connections)
2. Check agent dashboard for codec settings (should be Opus)
3. Verify network conditions (latency to ElevenLabs API)
4. Check browser console for latency logs

### Robotic Artifacts

**Check:**
1. Verify voice model quality is set to High/Ultra
2. Adjust `stability` setting (lower = more expressive, higher = more consistent)
3. Adjust `similarityBoost` setting (lower = more natural, higher = more consistent)
4. Check agent voice model selection (some models are more natural than others)

### First Question Popping

**Symptom:** Audio "pops" or distorts on the first question/greeting

**Solution:**
- Already implemented: AudioContext resume before session start
- Already implemented: Audio buffering (2 chunks, 300ms max delay)
- If issue persists, check browser AudioContext state in console

## Verification Checklist

After configuring the agent:

- [ ] Agent codec is set to Opus
- [ ] Agent sample rate is set to 16kHz
- [ ] WebRTC is enabled in agent settings
- [ ] Voice model quality is High/Ultra
- [ ] Frontend console shows 16kHz sample rate in getUserMedia constraints
- [ ] Latency logs show <400ms round trip time
- [ ] Audio quality is clear and natural (no robotic artifacts)
- [ ] No "popping" on first question
- [ ] No audio crackling or choppiness

## Additional Resources

- [ElevenLabs Documentation](https://docs.elevenlabs.io/)
- [WebRTC Best Practices](https://webrtc.org/getting-started/overview)
- [Opus Codec Specification](https://opus-codec.org/)

## Notes

- Browser may resample audio if hardware doesn't support 48kHz natively
- Some browsers may ignore `sampleSize` constraint (not all browsers support it)
- Voice settings can be adjusted per voice model for optimal results
- Agent dashboard settings take precedence over API parameters for some configurations
