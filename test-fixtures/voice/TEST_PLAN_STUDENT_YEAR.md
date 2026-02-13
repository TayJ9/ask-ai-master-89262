# Test Plan: Student Year Feature

Proves that the student year feature (and derived difficulty knobs) works end-to-end using repeatable tests.

---

## Goals

1. **dynamicVariables presence**: `year` (or `studentYear`) and derived knobs (`technical_difficulty`, `technical_depth`, `behavioral_ratio`) are present at session start in `dynamicVariables` (case-sensitive).
2. **Agent prompt usage**: The ElevenLabs agent prompt actually uses those variables (not just receiving them).
3. **Question style progression**: Agent question style/difficulty changes predictably across years (Freshman vs Junior vs Senior) while holding everything else constant.
4. **Evaluation + Results flow**: Backend evaluation and Results page stay schema-consistent (canonical `questions[]` shape).

---

## Test Matrix

| Test | Tool | Command | Guards |
|------|------|---------|--------|
| 1. yearToDifficulty mapping | Node script | `npx tsx test-fixtures/voice/verify-year-to-difficulty.ts` | None |
| 2. dynamicVariables shape | Node script | `npx tsx test-fixtures/voice/verify-dynamic-variables.ts` | None |
| 3. Agent prompt usage | ElevenLabs MCP | Manual (see below) | No secrets in logs |
| 4. Question style progression | Fixture + Node | `npx tsx test-fixtures/voice/verify-difficulty-progression.ts` | None |
| 5. Evaluator schema | Node script | `npx tsx test-fixtures/voice/run-evaluator-sanity.ts` | OPENAI_API_KEY |
| 6. Backend eval pipeline | Node + backend | `npx tsx test-fixtures/voice/run-against-backend.ts` | Backend running |

---

## 1. yearToDifficulty Mapping

**Script:** `verify-year-to-difficulty.ts`

Asserts that `getYearToDifficulty(year)` returns correct values for Freshman, Junior, Senior:

- Freshman → `technicalDifficulty: "basic"`, `technicalDepth: "introductory"`, `behavioralRatio: 65`
- Junior → `technicalDifficulty: "intermediate"`, `technicalDepth: "moderate"`, `behavioralRatio: 50`
- Senior → `technicalDifficulty: "intermediate-advanced"`, `technicalDepth: "advanced"`, `behavioralRatio: 45`

---

## 2. dynamicVariables Shape at Session Start

**Script:** `verify-dynamic-variables.ts`

Builds the same `dynamicVariables` shape as `VoiceInterviewWebSocket.tsx` and asserts:

- Required keys present (case-sensitive): `year`, `technical_difficulty`, `technical_depth`, `behavioral_ratio`
- Values are non-empty for known years (Freshman, Junior, Senior)
- Optional: `studentYear` if agent template expects it (add as alias in frontend if needed)

**Note:** The current implementation uses `year` in dynamicVariables. If the ElevenLabs agent template uses `{{studentYear}}`, add `studentYear: yearStr` as an alias in `VoiceInterviewWebSocket.tsx` and include it in the required keys.

---

## 3. Agent Prompt Usage (ElevenLabs MCP)

**Manual / MCP-assisted:**

1. Start a voice interview with `year: "Freshman"` and capture the first question. Log keys only (e.g. `dynamicVariables_keys=year,technical_difficulty,...`), no secrets.
2. Verify the first question reflects Freshman-appropriate content (softer, intro-level).
3. Repeat with `year: "Senior"` — first question should be more technical.
4. If both questions differ in expected direction, the agent prompt is using the variables.

**Fallback (no MCP):** Use fixture prompt_questions in `fixtures-definitions.json` as proxy — they already follow the progression. Run `verify-difficulty-progression.ts`.

---

## 4. Question Style Progression

**Script:** `verify-difficulty-progression.ts` (existing)

Uses fixture `prompt_question` text to assert Senior prompts have more technical keywords than Freshman.

---

## 5. Evaluator Schema Consistency

**Script:** `run-evaluator-sanity.ts` (existing)

Runs each fixture through `scoreInterview()`, validates against `EvaluationJsonSchema`. Ensures canonical `questions[]` shape.

---

## 6. Backend Evaluation Pipeline

**Script:** `run-against-backend.ts` (existing)

Calls `POST /api/dev/eval-fixture` for each fixture. Validates response schema. Outputs `backend_eval_report.csv`.

---

## Logging Constraints

- **Do not log:** API keys, resume text, full transcripts, secrets.
- **OK:** Keys-only (`dynamicVariables_keys=year,technical_difficulty,...`), lengths-only (`resume_length=500`), short excerpts (max 120 chars).

---

## Run All Tests

```bash
# 1. yearToDifficulty
npx tsx test-fixtures/voice/verify-year-to-difficulty.ts

# 2. dynamicVariables shape
npx tsx test-fixtures/voice/verify-dynamic-variables.ts

# 3. Agent prompt (MCP or manual - see above)

# 4. Question progression
npx tsx test-fixtures/voice/verify-difficulty-progression.ts

# 5. Evaluator schema (requires OPENAI_API_KEY)
npx tsx test-fixtures/voice/run-evaluator-sanity.ts

# 6. Backend pipeline (requires backend running)
npx tsx test-fixtures/voice/run-against-backend.ts
```
