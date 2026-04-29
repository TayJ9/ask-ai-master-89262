# AI Interview Coach

Voice-first interview practice for students: conversational practice with an AI interviewer, resume-aware questions, and structured feedback after each session.

## Stack

- **Frontend**: React, Vite, TypeScript, Tailwind, shadcn/ui (`frontend/`)
- **Backend**: Express, WebSockets, Drizzle (`backend/`)
- **Voice**: ElevenLabs Conversational AI; optional **Hugging Face** inference for resume NER/summarization (`HUGGINGFACE_TOKEN` in backend `.env`)

## Quick start (local)

```bash
npm run install:all
```

Then follow **[LOCAL_DEV_SETUP.md](./LOCAL_DEV_SETUP.md)** for `.env`, ports, and running backend + frontend.

## Deploy

Production layout:** **[VERCEL_RAILWAY_SETUP.md](./VERCEL_RAILWAY_SETUP.md)** (Vercel frontend, Railway API + Postgres).

## Docs

| Document | Purpose |
| -------- | ------- |
| [LOCAL_DEV_SETUP.md](./LOCAL_DEV_SETUP.md) | Local `.env`, SQLite/Postgres, dev commands |
| [VERCEL_RAILWAY_SETUP.md](./VERCEL_RAILWAY_SETUP.md) | Deploy frontend and API |
| [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md) | Product and architecture summary |
| [backend/DATABASE_SETUP.md](./backend/DATABASE_SETUP.md) | Migrations / tables |
| [backend/ENVIRONMENT_VARIABLES.md](./backend/ENVIRONMENT_VARIABLES.md) | Env reference |
| [ELEVENLABS_AGENT_TEMPLATE.md](./ELEVENLABS_AGENT_TEMPLATE.md) | Agent / dynamic variables template |

## Optional: Python voice proxy

If you use the separate Flask service under `python_backend/` for audio proxying, set `PYTHON_BACKEND_URL` in the backend `.env` (see `ENVIRONMENT_VARIABLES.md`).
