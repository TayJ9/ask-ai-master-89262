# Discovery: Student Year → Difficulty Knobs

## 1. Mapping Function

**Location:** `frontend/src/lib/yearToDifficulty.ts` (also duplicated in `backend/voiceServer.js` and `backend/server/routes.ts` dev endpoint)

**Function:** `getYearToDifficulty(year: string | undefined): YearToDifficultyResult`

### Accepted year inputs and normalization

- **Input:** `year` string or `undefined`
- **Normalization:** `(year || '').toLowerCase()` — case-insensitive substring match
- **Accepted substrings:**

| Substring | technicalDifficulty | technicalDepth | behavioralRatio |
|----------|---------------------|----------------|-----------------|
| `high school` | foundational | basic | 70 |
| `freshman` | basic | introductory | 65 |
| `sophomore` | basic-intermediate | foundational | 60 |
| `junior` | intermediate | moderate | 50 |
| `senior` | intermediate-advanced | advanced | 45 |
| `post grad` / `postgrad` / `graduate` | advanced | expert | 40 |
| (default/unknown) | moderate | intermediate | 50 |

### Returned fields (exact key names)

```ts
{
  technicalDifficulty: string;  // camelCase
  technicalDepth: string;
  behavioralRatio: number;
}
```

---

## 2. startSession callsite and dynamicVariables keys

**Location:** `frontend/src/components/VoiceInterviewWebSocket.tsx` lines 1442–1540

**Callsite:** `conversation.startSession(startOptions)` (line 1540)

**Exact keys sent in dynamicVariables (case-sensitive):**

| Key | Source | Example |
|-----|--------|---------|
| `candidate_id` | candidateId \|\| sessionId | uuid |
| `interview_id` | sessionId | uuid |
| `first_name` | normalizedFirstName | "Jane" |
| `major` | normalizedMajor | "Computer Science" |
| `year` | candidateContext?.year \|\| '' | "Freshman" |
| `technical_difficulty` | getYearToDifficulty().technicalDifficulty | "basic" |
| `technical_depth` | getYearToDifficulty().technicalDepth | "introductory" |
| `behavioral_ratio` | String(getYearToDifficulty().behavioralRatio) | "65" |
| `resume_attached` | resumeChars > 0 | boolean |
| `resume_summary` | resumeText.slice(0, 1500) | string |
| `resume_highlights` | resumeText.slice(0, 500) | string |
| `resume_sentinel` | (debug only) | string |

---

## 3. Backend evaluation entrypoint

**Location:** `backend/server/evaluation.ts` — `evaluateInterview(interviewId)`

**Context extraction (lines 334–348):**

- Reads `session.candidateContext` from `elevenLabsInterviewSessions`
- Extracts: `role`, `major` only
- **Year and difficulty knobs are NOT extracted or passed to the evaluator**

**Passed to scoreInterview (lines 418–424):**

```ts
scoreInterview({
  role,
  major,
  resumeText,
  questions: qaPairs,
});
```

**Conclusion:** Student year and difficulty knobs are **not** in the evaluator context. They are stored in `candidateContext` (JSONB) when the webhook provides `year`, but evaluation does not read or use them.

---

## 4. Agent prompt sections referencing these placeholders

### ElevenLabs path (primary)

- **Agent prompt:** Configured in the ElevenLabs dashboard (not in repo)
- **Placeholders:** `{{year}}`, `{{technical_difficulty}}`, `{{technical_depth}}`, `{{behavioral_ratio}}` (per ElevenLabs substitution)
- **Source of truth:** ElevenLabs agent template in dashboard

### voiceServer.js (OpenAI fallback path)

**Location:** `backend/voiceServer.js` — `createSystemPrompt(candidateContext)`

Uses **inline string interpolation** (not placeholders). Sections that reference year and difficulty:

| Line | Section | Variables used |
|------|---------|----------------|
| 83 | CANDIDATE INFORMATION | `year` |
| 114 | BEHAVIORAL / TECHNICAL split | `behavioralRatio`, `100 - behavioralRatio` |
| 121–134 | TECHNICAL QUESTIONS | `year`, `technicalDifficulty`, `technicalDepth`, `majorCategory` |
| 139–148 | MAJOR-SPECIFIC GUIDELINES | `year`, `technicalDifficulty`, `technicalDepth`, `yearLower` |
| 166 | DYNAMIC ADJUSTMENT | `year`, `technicalDifficulty`, `yearLower` |
| 186 | REMEMBER THROUGHOUT | `year`, `technicalDifficulty`, `technicalDepth` |

---

## 5. Current state table

| Aspect | Where | Details |
|--------|-------|---------|
| **Where computed** | `frontend/src/lib/yearToDifficulty.ts` | `getYearToDifficulty(yearStr)` → `technicalDifficulty`, `technicalDepth`, `behavioralRatio` |
| **Where stored** | `elevenLabsInterviewSessions.candidateContext` (JSONB) | `year` merged from webhook; `role`, `major` from session creation |
| **Where sent to ElevenLabs** | `VoiceInterviewWebSocket.tsx` → `conversation.startSession({ dynamicVariables })` | Keys: `year`, `technical_difficulty`, `technical_depth`, `behavioral_ratio` (+ resume, ids) |
| **Where used in prompt** | ElevenLabs agent template (dashboard) | `{{year}}`, `{{technical_difficulty}}`, etc. — exact placeholders in dashboard |
| **Where used in backend evaluation** | **Not used** | `evaluateInterview` extracts only `role`, `major` from `candidateContext`; `scoreInterview` receives no year or difficulty knobs |
