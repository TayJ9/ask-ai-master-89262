# OpenAI Evaluator Implementation

## Summary

Replaced placeholder heuristic scoring with OpenAI-based evaluation that returns structured JSON matching a strict schema, validated server-side with Zod.

## Files Changed

### Backend

1. **`backend/server/llm/openaiEvaluator.ts`** (NEW)
   - OpenAI evaluator module
   - Exports `scoreInterview()` function
   - Zod schema validation
   - Error handling with retry support

2. **`backend/server/evaluation.ts`**
   - Replaced `generateEvaluation()` placeholder with `scoreInterview()` call
   - Removed placeholder scoring logic
   - Now calls OpenAI evaluator asynchronously

3. **`backend/test-openai-evaluator.js`** (NEW)
   - Test script for OpenAI evaluator
   - Tests end-to-end evaluation with sample Q&A pairs
   - Validates schema compliance

### Frontend

4. **`frontend/src/pages/Results.tsx`**
   - Updated TypeScript interface to include new fields
   - Added display for `overall_strengths` and `overall_improvements`
   - Added display for `sample_better_answer` per question

## Schema

### Zod Schema (`EvaluationJsonSchema`)

```typescript
{
  overall_score: number (0-100),
  overall_strengths: string[] (1-5 items),
  overall_improvements: string[] (1-5 items),
  questions: [
    {
      question: string,
      answer: string,
      score: number (0-100),
      strengths: string[] (1-3 items),
      improvements: string[] (1-3 items),
      sample_better_answer: string (20-500 chars)
    }
  ] (min 1 item)
}
```

### JSON Schema (for OpenAI)

The evaluator uses a detailed JSON schema that matches the Zod schema, ensuring OpenAI returns the correct structure. The schema is defined in `openaiEvaluator.ts` as `evaluationJsonSchema`.

## OpenAI Request

### Model
- **Model:** `gpt-4o-mini` (cost-effective, suitable for evaluation)
- **Temperature:** `0.2` (low for determinism)
- **Max Tokens:** `2000`
- **Response Format:** `json_object` (validated with Zod)

### Prompt Structure

**System Prompt:**
- Defines evaluation rubric (8 dimensions: Clarity, Specificity, STAR Structure, Relevance, Impact, Ownership, Communication, Coachability)
- Provides constraints for strengths/improvements
- Instructs to avoid AI-related language

**User Prompt:**
- Includes role/major context (if available)
- Lists all Q&A pairs
- Requests strict JSON matching schema

### Example Request

```typescript
await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { 
      role: "system", 
      content: "You are an evaluator for internship and entry-level job interviews..." 
    },
    { 
      role: "user", 
      content: "Evaluate this interview...\n\nQuestion 1:\nQ: Can you tell me about yourself?\nA: Hi! I'm a software engineer..." 
    },
  ],
  response_format: { type: "json_object" },
  temperature: 0.2,
  max_tokens: 2000,
});
```

## Example Evaluation JSON Output

```json
{
  "overall_score": 75,
  "overall_strengths": [
    "Demonstrated strong technical experience with specific metrics",
    "Showed clear communication and structured thinking",
    "Used concrete examples effectively"
  ],
  "overall_improvements": [
    "Could provide more STAR-structured responses",
    "Consider including more quantifiable impact metrics",
    "Practice articulating learning outcomes from challenges"
  ],
  "questions": [
    {
      "question": "Can you tell me about yourself?",
      "answer": "Hi! I'm a software engineer with 5 years of experience...",
      "score": 80,
      "strengths": [
        "Provided specific metrics (40% increase)",
        "Demonstrated leadership experience",
        "Clear and concise communication"
      ],
      "improvements": [
        "Could connect experience more directly to the role",
        "Consider mentioning relevant technical skills earlier"
      ],
      "sample_better_answer": "I'm a software engineer with 5 years of experience building web applications. In my current role, I led a team of 3 developers and increased user engagement by 40% through implementing a new React-based dashboard. I'm particularly passionate about creating user-friendly interfaces and solving complex technical problems, which aligns well with this position."
    }
  ]
}
```

## Error Handling

- **OpenAI API Errors:** Thrown as errors, caught by queue retry logic
- **Schema Validation Errors:** Thrown as Zod errors, caught by queue retry logic
- **After Max Retries:** Evaluation marked as `failed` with error message
- **Error Messages:** Include specific details (API key invalid, rate limit, schema validation errors)

## Testing

### Run Test Script

```bash
cd backend
OPENAI_API_KEY=your-key node test-openai-evaluator.js
```

### Test Assertions

The test script validates:
- ✅ `overall_score` is a number
- ✅ `overall_score` is in range 0-100
- ✅ `questions.length > 0`
- ✅ `overall_strengths` exists and is an array
- ✅ `overall_improvements` exists and is an array
- ✅ Each question has `score` (number, 0-100)
- ✅ Each question has `sample_better_answer` (string, >= 20 chars)
- ✅ Each question has `strengths` array (length > 0)
- ✅ Each question has `improvements` array (length > 0)

## Integration Points

### Queue System
- Evaluation errors trigger retry logic (3 retries with exponential backoff)
- After max retries, evaluation marked as `failed` with error message
- Queue continues processing other jobs

### Database
- Evaluation saved to `interview_evaluations` table
- `evaluation_json` field stores full JSON
- `overall_score` stored separately for quick queries
- `status` set to `complete` on success, `failed` on error

### Frontend
- Results page displays all new fields
- Overall strengths/improvements shown at top
- Sample better answers shown per question in highlighted box
- Backward compatible (handles missing fields gracefully)

## Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key for evaluation

## Cost Considerations

- **Model:** `gpt-4o-mini` (cost-effective)
- **Average Tokens:** ~1500-2000 per evaluation
- **Estimated Cost:** ~$0.001-0.002 per evaluation

## Future Enhancements

1. **Caching:** Cache evaluations for identical Q&A pairs
2. **Model Selection:** Allow configurable model selection
3. **Role/Major Context:** Extract from dynamic variables if stored
4. **Structured Outputs:** Use `json_schema` format if OpenAI SDK version supports it
5. **Batch Processing:** Evaluate multiple interviews in parallel

