# Resume website — Mockly link

> **Note:** The public `/demo` hub has been removed. Mockly now uses an **hourly access gate** (US Eastern codes) before login. For portfolio links, point visitors to your deployed app root and share an access code when needed. See [COOLIFY_DEPLOYMENT.md](./COOLIFY_DEPLOYMENT.md) and [ACCESS_GATE_COOLIFY_IMPLEMENTATION_PLAN.md](./ACCESS_GATE_COOLIFY_IMPLEMENTATION_PLAN.md).

Sample mock results (no account) remain available from the login page via **Preview sample report** buttons.

## App URL (replaces `/demo`)

After deploying on Coolify (or your host), link to:

```text
https://<your-mockly-domain>/
```

Users enter the hourly access code at `/gate`, then sign in.

Example: `https://mockly.yourdomain.com/gate`

## HTML snippet (project card)

```html
<section class="project">
  <h3>Mockly — AI Interview Coach</h3>
  <p>
    Voice-first mock interviews for students. Real-time AI conversation,
    resume-aware questions, and STAR-method feedback after each session.
  </p>
  <p>
    <strong>Stack:</strong> React, TypeScript, Express, ElevenLabs, OpenAI, PostgreSQL
  </p>
  <a href="https://<your-mockly-domain>/" target="_blank" rel="noopener noreferrer">
    Live app →
  </a>
</section>
```

## Markdown snippet

```markdown
### Mockly — AI Interview Coach

Voice-first mock interviews for students with structured STAR-method feedback.

**Stack:** React, TypeScript, Express, ElevenLabs, OpenAI, PostgreSQL

[Live demo](https://<your-mockly-domain>/demo)
```

## Optional: link back from Mockly to your resume

Set in your frontend `.env` (Vercel env vars):

```bash
VITE_RESUME_URL=https://your-resume-site.com
VITE_GITHUB_REPO=https://github.com/your-username/your-repo
```

These appear on the `/demo` hub page when configured.

## What visitors see

### `/demo` — Demo hub

1. **Hero** — Project overview and tech stack
2. **How it works** — Four feature cards in plain language (voice practice, resume questions, STAR feedback, AI interviewer walkthrough)
3. **Try it yourself** — Two sample feedback previews:
   - Sample CS results (`/results?mock=true&…`)
   - Sample business results

### `/demo/agent` — AI interviewer walkthrough

Three-step mock walkthrough (no microphone, no API keys). Technical details are tucked into collapsible "For developers" sections.

1. **Your info goes in** — name, major, and resume highlights sent to the AI at start (dynamic variables in developer section)
2. **The AI asks you questions** — resume load, voice orb, and first spoken question (GetResumeProfile API mock in developer section)
3. **You answer out loud** — listening state with plain-language turn-taking (server-side VAD note in developer section)

### Other demo routes

- **`/interview-preview`** — Interview room UI preview
- **`/demo/resume-questions`** — Resume-tailored question reveal
- **`/results?mock=true&interviewId=demo&demo=tech|business`** — Sample evaluation reports

No authentication required for the demo flow. Navigating from the hub sets a session flag so child pages show the portfolio demo banner.
