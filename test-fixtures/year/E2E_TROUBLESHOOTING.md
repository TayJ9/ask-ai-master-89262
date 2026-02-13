# Agent Year-Difficulty E2E Troubleshooting

## What Was Fixed (Code Changes)

1. **Simulate API request format** — Switched from `prompt` to `first_message` + `language` per ElevenLabs docs.
2. **Minimal simulate fallback** — Tries a minimal request when full simulate fails; includes required `first_name`, `major`.
3. **Debug logging** — Set `DEBUG_E2E=1` to log the signed URL prefix (wss vs WebRTC).
4. **Shorter WebSocket timeout** — 25s instead of 60s so simulate fallback runs sooner.
5. **Alternate event handling** — Handles both `agent_response_event.agent_response` and `msg.agent_response`.
6. **Mock mode** — Set `MOCK_E2E=1` to run with fake data when the API fails, so you can verify the report pipeline.
7. **Text-only mode** — WebSocket flow now sends `conversation_config_override.conversation.text_only: true` so the agent operates in text-only (chat) mode instead of expecting audio. This avoids issues when sending text via `user_message` to a voice-configured agent.

## API Structure (Verified Against Docs)

The request uses:
- `simulation_specification.dynamic_variables_config.dynamic_variable_placeholders` (per docs)
- `dynamic_variables` at body root (per WebSocket ConversationInitiation)

The 400 persists despite multiple formats. **Root cause:** The agent's first message uses `{{first_name}}` and `{{major}}`; the simulate API appears to require these from the agent dashboard, not the request.

**Fix options:**
1. **Remove placeholders from first message** — Change agent's first message to e.g. `"Hi! Let's begin the interview."` (no `{{first_name}}`/`{{major}}`). Use them in the system prompt instead.
2. **Set dashboard defaults** — In agent Personalization → Dynamic variables, set defaults for `first_name` and `major`.

### 2. Only 1 message captured (not a full interview)

The test tries **simulate first** (LLM-based multi-turn), then **minimal simulate** (first_message only), then **WebSocket**.

To get a full 6-turn interview:
1. **Remove `{{first_name}}` and `{{major}}` from the agent's first message** in the ElevenLabs dashboard (e.g. use `"Hi! Let's begin the interview."`).
2. The test uses `simulated_user_config.prompt` for multi-turn; once the agent's first message is fixed, simulate should return 6+ agent messages.

## Current Errors

### 1. Simulate API: `missing_dynamic_variables` (400)

The simulate API returns 400:

```
Missing required dynamic variables in first message: {'first_name', 'major'}
```

The agent’s first message uses `{{first_name}}` and `{{major}}`, but the simulate API isn’t receiving them with the current request structure.

## What You Need to Do (Manual Checklist)

### 1. ElevenLabs Dashboard — Agent Default Values

1. Open the agent in the ElevenLabs dashboard.
2. Go to **Personalization** → **Dynamic variables**.
3. Set **default values** (or Presets) for:
   - `first_name` (e.g. `"John Doe"`)
   - `major` (e.g. `"Generic"`)

With defaults set, the simulate API may work even if the request payload doesn’t match the expected format.

### 2. Confirm Dynamic Variable Names

In the agent’s system prompt and first message, ensure:

- Variable names in the prompt match exactly: `{{first_name}}`, `{{major}}`, `{{year}}`, etc.
- Names are case-sensitive.

### 3. Verify Variables in the Agent Prompt

Check that the agent uses:

- `{{year}}` or `{{studentyear}}`
- `{{technical_difficulty}}`
- `{{technical_depth}}`
- `{{behavioral_ratio}}`

## Quick Commands

```bash
# Normal run (WebSocket → simulate fallback)
npx tsx test-fixtures/year/run-agent-year-difficulty-e2e.ts

# Debug: log signed URL prefix
DEBUG_E2E=1 npx tsx test-fixtures/year/run-agent-year-difficulty-e2e.ts

# Mock mode: use fake data when API fails (tests report pipeline)
MOCK_E2E=1 npx tsx test-fixtures/year/run-agent-year-difficulty-e2e.ts
```

## Next Steps

If the simulate API still returns 400 after setting dashboard defaults, contact ElevenLabs support with the request body (see DEBUG output) and ask why the API reports missing variables when they are provided. **Text-only mode** — The WebSocket flow now uses `conversation_config_override.conversation.text_only: true` so the agent operates in text-only (chat) mode instead of expecting audio. This resolves issues when sending text via `user_message` to a voice-configured agent.