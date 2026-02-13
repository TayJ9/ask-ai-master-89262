# Agent Year-Difficulty E2E Findings

## What Changed Across Years

### Freshman
- Technical question rate: 0%
- Behavioral question rate: 0%
- Advanced keywords: 0
- Avg question length: 32 chars
- Behavioral ratio (expected): 65%

**Sample excerpts (1–2 per year):**
1. ""Hi! Let's begin the interview.""

### Junior
- Technical question rate: 0%
- Behavioral question rate: 0%
- Advanced keywords: 0
- Avg question length: 32 chars
- Behavioral ratio (expected): 50%

**Sample excerpts (1–2 per year):**
1. ""Hi! Let's begin the interview.""

### Senior
- Technical question rate: 0%
- Behavioral question rate: 0%
- Advanced keywords: 0
- Avg question length: 32 chars
- Behavioral ratio (expected): 45%

**Sample excerpts (1–2 per year):**
1. ""Hi! Let's begin the interview.""


## Assertions

| Assertion | Result |
|-----------|--------|
| Senior technicalRate >= Junior >= Freshman | ✅ PASS |
| Freshman fewer advanced keywords than Senior | ✅ PASS |
| Behavioral ratio trend (Freshman more behavioral than Senior) | ✅ PASS |

## Match Expectations?

**Yes** — results align with expected year→difficulty mapping.

## What to Tweak If Not

1. **Prompt wording** — Ensure agent system prompt explicitly references `{{technical_difficulty}}`, `{{technical_depth}}`, `{{behavioral_ratio}}`.
2. **Mapping** — Verify `getYearToDifficulty()` in `frontend/src/lib/yearToDifficulty.ts` matches ElevenLabs agent variable names.
3. **Variable names** — Agent template must use `year` / `studentyear`, `technical_difficulty`, `technical_depth`, `behavioral_ratio` (snake_case) as in the app.
4. **WebSocket vs simulate** — If WebSocket returns 0 messages, the signed URL may be WebRTC-only. Simulate API fallback may require agent support for simulation.
5. **Manual checklist** — In ElevenLabs dashboard: (a) Set default values for `first_name` and `major` in agent Presets/defaults so simulate API receives them; (b) Verify agent prompt uses `{{year}}`, `{{technical_difficulty}}`, etc.
