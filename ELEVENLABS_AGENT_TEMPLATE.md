# ElevenLabs Agent Template (Dynamic Variables)

Ensure the ElevenLabs agent system prompt and first message use these exact placeholder names:

```
{{first_name}}         — Candidate first name (default: "Candidate")
{{major}}              — Major field (default: "General")
{{year}}               — Academic year (default: "Unknown")
{{resume_summary}}     — Resume summary, up to 1500 chars (default: "")
{{resume_highlights}}  — Resume highlights, up to 500 chars (default: "")
{{technical_difficulty}} — Question difficulty level (default: "intermediate")
{{technical_depth}}    — Technical depth (default: "standard")
{{behavioral_ratio}}   — Behavioral vs technical ratio, string (default: "60")
```

Example first message:
```
Hi {{first_name}}! I see you're studying {{major}} as a {{year}}. Let's begin the interview.
```

Example system prompt context:
```
Candidate resume summary: {{resume_summary}}
Candidate highlights: {{resume_highlights}}
Difficulty: {{technical_difficulty}}, depth: {{technical_depth}}, behavioral ratio: {{behavioral_ratio}}
```
