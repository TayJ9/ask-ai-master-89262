# ElevenLabs Agent Template Update (resume personalization)

Add these placeholders to the ElevenLabs agent system prompt or first message template in the ElevenLabs dashboard so dynamic variables influence responses:

```
Candidate resume summary: {{resume_summary}}
Candidate highlights: {{resume_highlights}}
```

Ensure the agent is configured to accept dynamic variables / overrides at conversation start. With DEBUG enabled, verify in browser console and WS frames that `resume_summary`, `resume_highlights`, and `resume_sentinel` are present.***

