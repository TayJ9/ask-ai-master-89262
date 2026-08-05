# Coolify Deployment Guide

Deploy Mockly as a **single service** on Coolify (Hetzner or any Docker host): the backend serves the API, WebSocket voice endpoint, and the built React frontend from one container.

## Prerequisites

- Coolify instance with Docker build support
- PostgreSQL database (Coolify-managed or external)
- Domain pointed at the Coolify server (e.g. `mockly.yourdomain.com`)

## Service settings

| Setting | Value |
|---------|--------|
| Build pack | Dockerfile (repo root) |
| Port | `5000` |
| Health check | `GET /health` |
| WebSocket | Enable (Traefik passes `Upgrade` by default) |

Do **not** set `VITE_API_URL` — the app uses same-origin relative URLs in production.

## Required environment variables

Set these in Coolify (see also `backend/ENVIRONMENT_VARIABLES.md`):

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<random 32+ bytes>
ACCESS_GATE_SECRET=<random 32+ bytes>
ACCESS_GATE_ADMIN_KEY=<random string>
FRONTEND_URL=https://mockly.yourdomain.com
ALLOW_SIGNUP=true
TRUST_PROXY_HOPS=1
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
ELEVENLABS_WEBHOOK_SECRET=...
```

Optional:

```env
ACCESS_GATE_COOKIE_MAX_AGE_SECONDS=604800
ALLOW_VERCEL_ORIGINS=false
ALLOW_SIGNUP=false
```

## Hourly access codes (UTC)

Codes rotate every **UTC hour**. The operator fetches the current code via:

```http
GET https://mockly.yourdomain.com/api/access/current
X-Admin-Key: <ACCESS_GATE_ADMIN_KEY>
```

Response:

```json
{
  "code": "ABCD-EFGH",
  "validUntil": "2026-01-15T21:00:00.000Z",
  "timezone": "UTC"
}
```

Share the code with invitees. Users enter it at `/gate` before sign-in or sign-up.

### n8n reminder workflow (optional)

```text
Cron: 0 * * * *   (every hour at :00 UTC)
  → HTTP GET https://mockly.yourdomain.com/api/access/current
      Header: X-Admin-Key: {{ACCESS_GATE_ADMIN_KEY}}
  → Optional: Slack / email / Telegram notification with {{code}}
```

## Smoke test after deploy

1. `https://mockly.yourdomain.com/gate` loads
2. Wrong code → 401; correct hourly code → cookie → redirect to login
3. Sign up / sign in works with valid gate cookie
4. Voice interview WebSocket connects at `wss://mockly.yourdomain.com/voice`
5. `GET /` serves the React app (not JSON)
6. `/demo` returns 404
7. Sample mock results on login still work (`/results?mock=true`)

## Creating users when signup is disabled

Set `ALLOW_SIGNUP=false`, then create accounts manually:

```bash
CREATE_USER_CONFIRM=1 \
PROD_USER_EMAIL=invitee@example.com \
PROD_USER_PASSWORD='secure-password' \
PROD_USER_FULL_NAME='Invitee Name' \
npm run create-prod-user --workspace=backend
```

Run against the production database (Coolify shell or one-off job).

## Decommissioning Vercel / Railway

After Coolify is stable:

1. Point DNS away from Vercel/Railway
2. Remove or archive old deploy projects
3. Use this doc as the primary deploy reference (`README.md` links here)
