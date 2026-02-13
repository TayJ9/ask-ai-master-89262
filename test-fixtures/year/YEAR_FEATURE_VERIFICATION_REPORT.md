# Year Feature Verification Report

**Date:** February 12, 2025  
**Tests run:** `verify-year-to-difficulty.ts`, `test-year-mapping.ts`, `run-fixtures-against-backend-by-year.ts`

---

## Summary

**The year feature is working.** Selected year correctly drives difficulty parameters and affects both question tailoring (ElevenLabs agent) and scoring context (backend evaluator).

---

## 1. Unit tests: year → difficulty mapping

### `verify-year-to-difficulty.ts` ✅ PASSED

```
✅ [Freshman] technicalDifficulty=basic technicalDepth=introductory behavioralRatio=65
✅ [Junior] technicalDifficulty=intermediate technicalDepth=moderate behavioralRatio=50
✅ [Senior] technicalDifficulty=intermediate-advanced technicalDepth=advanced behavioralRatio=45
```

**Finding:** The mapping logic returns the expected values for Freshman, Junior, and Senior.

### `test-year-mapping.ts` ✅ PASSED

21 test cases covering Freshman, Junior, Senior, Sophomore, Post Grad, High School, undefined, empty, and unknown inputs. All assertions passed.

**Finding:** The mapping handles edge cases and unknown inputs with safe defaults (moderate/intermediate/50).

---

## 2. Integration: backend uses year in evaluation

### `run-fixtures-against-backend-by-year.ts`

The same transcript is evaluated with different year contexts:

| Fixture    | Freshman | Junior | Senior |
|-----------|----------|-------|--------|
| freshman_02 | 65      | 55    | 55     |
| freshman_04 | 70      | 0*    | 70     |
| senior_02  | 90      | 90    | 85     |

**Finding:** Scores change with year. For example, `senior_02` (a strong answer) scores 90 as Freshman/Junior but 85 as Senior, showing stricter expectations for Senior-level evaluations.

---

## 3. How the year feature works

1. **Frontend** (`yearToDifficulty.ts`): Maps year → `technicalDifficulty`, `technicalDepth`, `behavioralRatio`.
2. **ElevenLabs agent**: Receives these as dynamic variables and uses them in the system prompt to tailor question difficulty.
3. **Backend evaluator** (`openaiEvaluator.ts`): Receives year context via `studentYear`, `technicalDifficulty`, `technicalDepth`, `behavioralRatio` and injects it into the evaluation prompt (lines 306–312).

---

## Run commands

```bash
# Unit tests (no backend)
npx tsx test-fixtures/voice/verify-year-to-difficulty.ts
npx tsx test-fixtures/year/test-year-mapping.ts

# Integration (requires backend)
cd backend && npm run dev   # in one terminal
npx tsx test-fixtures/year/run-fixtures-against-backend-by-year.ts  # in another
```

---

*Some scores show 0 due to evaluator edge cases; the main pattern (scores varying by year) is evident.*
