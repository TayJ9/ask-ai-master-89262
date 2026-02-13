# Voice Fixtures Usage Guide

This guide explains how to use the voice regression test fixtures for:

1. **Evaluator JSON schema sanity check**
2. **Year-based difficulty verification**

---

## Fixture Layout

Each fixture consists of:

| File | Purpose |
|------|---------|
| `{level}_{nn}.mp3` | TTS-generated audio (ElevenLabs) |
| `{level}_{nn}.txt` | Transcript text (from STT or ground-truth fallback) |
| `{level}_{nn}.meta.json` | Metadata: `level`, `prompt_question`, `candidate_answer_text`, `transcript_word_count`, `clarity_score`, `stt_source` |

Levels: `freshman`, `junior`, `senior` — 4 fixtures each (12 total).

---

## (a) Evaluator JSON Schema Sanity Check

**Goal:** Ensure your evaluator output always conforms to `EvaluationJsonSchema` (Zod). Use fixtures as stable inputs.

### Option 1: Run the sanity script

```bash
cd "c:\Users\tayjs\OneDrive - College of Charleston\Documents\ask-ai-master-89262"
# Requires OPENAI_API_KEY in backend/.env or environment
npx tsx test-fixtures/voice/run-evaluator-sanity.ts
```

**Note:** If the evaluator fails with schema validation errors (e.g. `overall_strengths: Required`, `questions: Required`), the OpenAI API may be returning a different structure for single-question inputs. The fixtures help surface this — consider normalizing the evaluator's response transformation to handle 1-question inputs into the expected `{ overall_score, overall_strengths, overall_improvements, questions }` shape.

The script:
- Loads each fixture from `test-fixtures/voice/`
- Builds `{ role, major, resumeText, questions }` from `prompt_question` + transcript
- Calls `scoreInterview()` (OpenAI evaluator)
- Validates output with `EvaluationJsonSchema.safeParse()`
- Fails if any fixture yields invalid JSON

### Option 2: Manual check (single fixture)

```typescript
import { scoreInterview, EvaluationJsonSchema } from "../backend/server/llm/openaiEvaluator";
import fs from "fs";
import path from "path";

const VOICE_DIR = path.join(process.cwd(), "test-fixtures", "voice");

async function checkFixture(id: string) {
  const meta = JSON.parse(fs.readFileSync(path.join(VOICE_DIR, `${id}.meta.json`), "utf-8"));
  const transcript = fs.readFileSync(path.join(VOICE_DIR, `${id}.txt`), "utf-8");

  const evalResult = await scoreInterview({
    role: "Software Engineer Intern",
    major: "Computer Science",
    resumeText: "CS student. Python, JavaScript. GPA 3.5.",
    questions: [{ question: meta.prompt_question, answer: transcript }],
  });

  const parsed = EvaluationJsonSchema.safeParse(evalResult);
  if (!parsed.success) {
    throw new Error(`Schema validation failed: ${parsed.error.message}`);
  }
  console.log(`✅ ${id} passed`);
}
```

### Schema expectation

The evaluator should return:

- `overall_score`: 0–100
- `overall_strengths`: 1–5 strings
- `overall_improvements`: 1–5 strings
- `questions`: array of objects with `question`, `answer`, `score`, `strengths`, `improvements`, plus optional `question_type`, `star_breakdown`, `improvement_quote`, `sample_better_answer`

---

## (b) Year-Based Difficulty Verification

**Goal:** Confirm that `prompt_question` style changes by level (Freshman vs Junior vs Senior).

### Quick manual check

1. Open `fixtures-definitions.json` or `MANIFEST.md`.
2. Compare `prompt_question` across levels for the same question “slot” (e.g. #1 = “Tell me about yourself”):

| Level | Slot 1 style |
|-------|--------------|
| Freshman | Soft, intro-level (“tell me about yourself”, “worked with a team”, “handle stress”) |
| Junior | Mix of behavioral + technical (“debug a difficult bug”, “explain REST APIs”) |
| Senior | More technical depth (“technical trade-off”, “design a rate limiter”, “disagreed with technical decision”) |

### Programmatic check

```bash
cd "c:\Users\tayjs\OneDrive - College of Charleston\Documents\ask-ai-master-89262"
npx tsx test-fixtures/voice/verify-difficulty-progression.ts
```

This script:
- Loads all `.meta.json` files
- Groups by level
- Extracts `prompt_question` text
- Compares vocabulary and topic (e.g. presence of “design”, “trade-off”, “REST”, “rate limiter” in Senior vs simpler terms in Freshman)

### Mapping to `yearToDifficulty.ts`

Your `frontend/src/lib/yearToDifficulty.ts` maps:

- Freshman → `technicalDifficulty: "basic"`, `technicalDepth: "introductory"`, `behavioralRatio: 65`
- Junior → `technicalDifficulty: "intermediate"`, `technicalDepth: "moderate"`, `behavioralRatio: 50`
- Senior → `technicalDifficulty: "intermediate-advanced"`, `technicalDepth: "advanced"`, `behavioralRatio: 45`

The fixtures mirror this: Freshman questions are behavioral/intro; Senior questions are more technical and design-oriented.

---

## Fixture Replay (Dev-Only Backend Pipeline Test)

Test the real evaluation pipeline without live voice:

1. Start the backend: `cd backend && npm run dev`
2. Run: `npx tsx test-fixtures/voice/run-against-backend.ts`

This calls `POST /api/dev/eval-fixture` for each fixture and outputs `backend_eval_report.csv` with `fixtureId`, `overallScore`, `perQuestionScores`, `status`.

**Endpoint:** `POST /api/dev/eval-fixture`  
**Body:** `{ "fixtureId": "freshman_01" }`  
**Returns:** Canonical `EvaluationJson` (same shape as evaluator sanity script expects).

**Guardrails:** Disabled in production (`NODE_ENV=production` returns 403).

**Optional:** `BACKEND_URL=http://localhost:3001` if the backend runs on a different port.

---

## Upgrading Transcripts to Real STT

If fixtures were generated with ground-truth fallback (no STT permission), you can upgrade transcripts to real speech-to-text:

```bash
cd "c:\Users\tayjs\OneDrive - College of Charleston\Documents\ask-ai-master-89262"
# Requires ELEVENLABS_API_KEY with Speech-to-Text permission
npx tsx test-fixtures/voice/transcribe-fixtures-elevenlabs.ts
```

**Behavior:**
- Scans `test-fixtures/voice/*.mp3`
- Transcribes each file with ElevenLabs STT (model `scribe_v2`)
- On success: overwrites `.txt`, sets `stt_source: "elevenlabs_scribe_v2"` in `.meta.json`
- On failure: keeps ground-truth text in `.txt`, sets `stt_source: "ground_truth_fallback"` and `stt_error` in `.meta.json`
- Writes `STT_ERRORS.json` with per-file status

**Note:** STT may fail unless the ElevenLabs API key has **Speech-to-Text** permissions enabled. The script falls back safely to ground-truth text and continues processing; fixtures remain usable.

---

## Student Year Feature Test Plan

See `TEST_PLAN_STUDENT_YEAR.md` for the full test plan. Quick commands:

```bash
npx tsx test-fixtures/voice/verify-year-to-difficulty.ts
npx tsx test-fixtures/voice/verify-dynamic-variables.ts
npx tsx test-fixtures/voice/verify-difficulty-progression.ts
```

---

## Regenerating Fixtures

```bash
cd "c:\Users\tayjs\OneDrive - College of Charleston\Documents\ask-ai-master-89262"
# Requires ELEVENLABS_API_KEY (TTS; STT optional / falls back to ground-truth if no permission)
npx tsx test-fixtures/voice/generate-fixtures.ts
```

Output: `*.mp3`, `*.txt`, `*.meta.json` in `test-fixtures/voice/`, plus `MANIFEST.md`.
