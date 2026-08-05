# ElevenLabs Agent Template (Dynamic Variables)

Ensure the ElevenLabs agent system prompt and first message use these exact placeholder names:

```
{{first_name}}         — Candidate first name (default: "Candidate")
{{major}}              — Major field (default: "General")
{{year}}               — Academic year (default: "Unknown")
{{resume_summary}}     — Structured interview brief (Skills/Projects/Experience/Education), up to 1500 chars (default: "")
{{resume_highlights}}  — Compact highlight line from that brief, up to 500 chars (default: "")
{{technical_difficulty}} — Question difficulty level (default: "intermediate")
{{technical_depth}}    — Technical depth (default: "standard")
{{behavioral_ratio}}   — Behavioral vs technical ratio, string (default: "60")
{{question_bank}}     — Curated interview questions by year (default: junior-level questions)
```

Example first message:
```
Hi {{first_name}}! I see you're studying {{major}} as a {{year}}. Let's begin the interview.
```

Example system prompt context:
```
Candidate resume brief (use for tailored questions about skills, projects, school, and experience):
{{resume_summary}}

Candidate highlights:
{{resume_highlights}}

Difficulty: {{technical_difficulty}}, depth: {{technical_depth}}, behavioral ratio: {{behavioral_ratio}}

Sample questions to draw from (adapt to candidate's resume and major):
{{question_bank}}
```

## Hybrid resume strategy (recommended)

1. **At session start:** use `{{resume_summary}}` / `{{resume_highlights}}` (structured brief). Do **not** expect the full resume in dynamic variables.
2. **Before the first question:** call `GetResumeProfile` with `{{interviewid}}` to load structured skills/projects/education.
3. **For deep follow-ups:** call `GetResumeFullText` only when you need more detail than the brief/profile provide.

## Server tools (GetResumeProfile / GetResumeFullText)

The frontend injects a **structured resume brief** at session start via dynamic variables (`resume_summary`, `resume_highlights`, `interviewid`, etc.). That is enough for solid first questions. Full resume text stays on the backend.

Use server tools when the agent needs the **full structured profile** or **complete resume text** mid-conversation (e.g. deep follow-ups on a specific project).

### ElevenLabs dashboard configuration

Each tool must point at your **public** backend URL (not `http://127.0.0.1`). ElevenLabs executes server tools from the cloud and cannot reach localhost.

| Tool | Method | URL |
|------|--------|-----|
| GetResumeProfile | POST (required) | `{PUBLIC_BACKEND_URL}/api/get-resume-profile` |
| GetResumeFullText | POST (required) | `{PUBLIC_BACKEND_URL}/api/get-resume-fulltext` |

**Important:** ElevenLabs defaults webhook tools to **GET**. If the method is GET, requests hit the SPA and return HTML instead of JSON — the tool will always fail with no backend logs. Set **Method: POST** in the tool configuration. GET query params are supported as a fallback if POST cannot be used.

**Headers**

```
Content-Type: application/json
x-api-secret: <ELEVENLABS_API_KEY>
```

`Authorization: Bearer <ELEVENLABS_API_KEY>` is also accepted if your ElevenLabs tool uses Bearer auth instead of `x-api-secret`.

**Critical:** The `x-api-secret` value in the ElevenLabs tool config must **exactly match** `ELEVENLABS_API_KEY` in Coolify/production. A placeholder like `my_secret_interview_key_123` will cause **401 Unauthorized** on every tool call (the agent will show the tool as failed; backend logs may show no `[RESUME-PROFILE]` line on older builds, or `[RESUME-PROFILE] unauthorized` after logging was added).

**Body** (configure in tool `request_body_schema`; ElevenLabs sends values inside a `parameters` object)

```json
{
  "type": "object",
  "properties": {
    "interviewid": {
      "type": "string",
      "description": "Interview session id from dynamic variable interviewid"
    }
  },
  "required": ["interviewid"]
}
```

Use dynamic variable `{{interviewid}}` on the `interviewid` property (or `interview_id` — both are accepted).

ElevenLabs POSTs this envelope to your webhook:

```json
{
  "tool_call_id": "call_abc123",
  "tool_name": "GetResumeProfile",
  "parameters": { "interviewid": "<session-uuid>" },
  "conversation_id": "conv_xyz789"
}
```

**Response** — wrap payload in `result` (required for the agent to receive tool output):

```json
{
  "result": {
    "interviewid": "<session-uuid>",
    "resumeprofile": { "skills": [], "experience": [], "education": [] }
  }
}
```

### Force the tool to run every session

Dynamic variables alone do not guarantee a tool call. Add an early **procedure step** in the agent, e.g.:

> Before asking the first interview question, call GetResumeProfile with interviewid `{{interviewid}}` to load the candidate's structured resume profile.

### Local live testing (ngrok)

```bash
# Terminal 1 — backend (default port 3001)
cd backend && npm run dev

# Terminal 2 — expose backend to ElevenLabs
ngrok http 3001
```

Update each server tool URL in the ElevenLabs dashboard to `https://xxxx.ngrok.io/api/get-resume-profile` (and fulltext equivalent). Run an interview and watch backend logs for:

```
[RESUME-PROFILE] interviewid <uuid> found true
```

### Verify endpoints locally (no ngrok)

Integration tests hit the backend from your machine (not from ElevenLabs cloud):

```bash
cd backend
npm run test:resume-server-tools
```

## Client tool: MarkInterviewComplete

Register a **client tool** named `MarkInterviewComplete` (no parameters required). The frontend handles it: saves the interview with `ended_by: agent`, ends the ElevenLabs session, and navigates to results.

### Ending procedure (required)

Add these steps to the agent procedure / system prompt:

1. After the final interview question, deliver a brief goodbye (thank the candidate, wish them well).
2. **Immediately** call the `MarkInterviewComplete` client tool — do not wait for the candidate to respond.
3. **Do not** ask follow-up questions after goodbye (e.g. "Are you still there?", "Hello?").
4. Do not continue the conversation after calling `MarkInterviewComplete`.

Example closing:

> "That wraps up our interview today. Thank you for your time — best of luck with your applications!"
> → call `MarkInterviewComplete`

### Optional server tool: mark-interview-complete

If you also configure a server tool at `POST {PUBLIC_BACKEND_URL}/api/mark-interview-complete`, send:

```json
{
  "interviewid": "{{interviewid}}",
  "conversationid": "{{conversation_id}}",
  "candidateid": "{{candidateid}}"
}
```

Header: `x-api-secret: <ELEVENLABS_API_KEY>`. The client tool above is the primary path; this endpoint updates session status as a backup.
