# Implementation Plan: Hourly Access Gate + Coolify Deployment

**Audience:** Implementing agent  
**Product:** Mockly (AI Interview Coach)  
**Goal:** Replace public demo/open signup with an hourly rotating access code, keep existing JWT login for per-user tracking, and deploy as a unified app on Coolify/Hetzner.

---

## 1. Summary

| Item | Decision |
|------|----------|
| Access model | Hourly rotating code (HMAC/TOTP-style, 3600s period) **before** login |
| Account model | Keep existing email/password signup + signin + JWT |
| Signup policy | **Gate required for signup**; optionally disable signup entirely via env |
| Deployment | Single Coolify service on Hetzner: backend serves API + WebSocket + built frontend |
| Demo routes (`/demo/*`) | **Remove** (user preference). Keep mock sample results buttons on login (`Auth.tsx`). |
| Timezone for codes | **UTC** (document clearly for operator) |

---

## 2. Non-goals (do not implement in this pass)

- Email verification / password reset flows
- Full admin UI for invite management
- Auth0 / Clerk / third-party auth
- Migrating n8n workflows (optional follow-up doc only)
- CSP hardening (nice-to-have, separate task)

---

## 3. Architecture

```text
User → https://mockly.<your-domain>
         │
         ├─ GET /gate          → enter hourly access code (React)
         ├─ POST /api/access/verify → validate code, set httpOnly cookie
         ├─ GET /              → Auth (signup/signin) if cookie valid
         ├─ /api/*             → existing API (JWT for protected routes)
         └─ WS /voice          → existing voice WebSocket
```

**Cookie after gate success**

- Name: `mockly_access_granted` (or similar)
- `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`
- Max-Age: configurable, default **7 days** (`ACCESS_GATE_COOKIE_MAX_AGE_SECONDS`)
- Value: signed token (HMAC of expiry + random nonce) — **not** the raw hourly code

**Hourly code algorithm**

- Env: `ACCESS_GATE_SECRET` (32+ random bytes, base32 or hex)
- Period: 3600 seconds
- Accept codes for **current hour** and **previous hour** (clock skew / “I just sent this”)
- Format shown to operator: 8 chars, grouped `XXXX-XXXX` (normalize input: strip dashes, case-insensitive)
- Implementation: new module `backend/server/accessGate.ts`

```ts
// Pseudocode — implement in accessGate.ts
function getHourlyCode(secret: string, unixMs: number): string {
  const hour = Math.floor(unixMs / 1000 / 3600);
  const hmac = createHmac('sha256', secret).update(String(hour)).digest('base64url');
  return hmac.slice(0, 8).toUpperCase(); // display as XXXX-XXXX
}

function verifyAccessCode(input: string, secret: string, now = Date.now()): boolean {
  const normalized = input.replace(/-/g, '').trim().toUpperCase();
  for (const offset of [0, -1]) {
    const t = now + offset * 3600 * 1000;
    if (getHourlyCode(secret, t) === normalized) return true;
  }
  return false;
}
```

**Operator endpoint (for n8n / manual use)**

- `GET /api/access/current` — returns `{ code, validUntil, timezone: 'UTC' }`
- Protected by header `X-Admin-Key: <ACCESS_GATE_ADMIN_KEY>` (separate env var)
- Rate limit: 60/hour per IP
- **Never** expose `ACCESS_GATE_SECRET` in response

---

## 4. Backend tasks

### 4.1 Create `backend/server/accessGate.ts`

Exports:

- `isAccessGateEnabled(): boolean` — false when `ACCESS_GATE_SECRET` unset (dev convenience)
- `getCurrentAccessCode(): { code, validUntilIso }`
- `verifyAccessCode(input: string): boolean`
- `signAccessCookie(): string` — HMAC-signed payload with expiry
- `verifyAccessCookie(cookie: string): boolean`

Use `cookie-parser` if not already present, or read `req.headers.cookie` manually.

### 4.2 Create access routes in `backend/server/routes.ts`

Add **before** or near auth routes:

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `POST` | `/api/access/verify` | None | Body `{ code: string }`. Rate limit 20/15min/IP. On success: set cookie, `{ ok: true }`. On fail: 401 generic message. |
| `GET` | `/api/access/status` | None | `{ required: boolean, granted: boolean }` — lets frontend check without exposing code |
| `GET` | `/api/access/current` | `X-Admin-Key` | Operator only — current code + expiry |

Reuse existing rate limiter pattern from `authRateLimiter` in `routes.ts` (~line 624).

### 4.3 Access gate middleware

Create `backend/server/requireAccessGate.ts`:

- If `!isAccessGateEnabled()` → `next()`
- If path is exempt → `next()`
- Else if valid access cookie → `next()`
- Else → 401 JSON `{ error: 'ACCESS_GATE_REQUIRED' }` for `/api/*` (except exempt list)

**Exempt paths (no gate cookie required):**

- `POST /api/access/verify`
- `GET /api/access/status`
- `GET /api/access/current` (still needs admin key)
- `GET /health`, `GET /api/health`
- `POST /api/auth/signin`, `POST /api/auth/signup` — **only if** you want login form reachable before gate (see §5 — prefer gate on frontend first, but still protect signup on backend)
- `POST /webhooks/elevenlabs`
- `POST /api/get-resume-profile`, `POST /api/get-resume-fulltext`, `POST /api/mark-interview-complete` (ElevenLabs server tools — use existing `x-api-secret`)
- `GET /favicon.ico`

**Apply middleware** in `backend/server/index.ts` after CORS, before `registerRoutes`, OR at start of `registerRoutes`.

**Important:** When gate is enabled, **`POST /api/auth/signup` must require valid access cookie** (or re-verify code in body). Signin can require cookie too for consistency.

### 4.4 Signup lock env var

Add to signup handler (`routes.ts` ~791):

```ts
const allowSignup = process.env.ALLOW_SIGNUP !== 'false';
if (!allowSignup) {
  return res.status(403).json({ error: 'Sign up is disabled. Contact the administrator.' });
}
```

When gate enabled, also require access cookie on signup (even if `ALLOW_SIGNUP=true`).

### 4.5 Fix production root route conflict

**Bug:** `backend/server/index.ts` registers `app.get('/', json)` **before** `serveStatic(app)`, which blocks the React app on unified deploy.

**Fix:**

- Remove the JSON `app.get('/')` block (~lines 212–227) when `frontend/dist/public` exists, OR
- Only register JSON root when `serveStatic` detects missing dist (move logic into `vite.ts` / conditional)

Preferred: delete standalone JSON `/` route; health is already at `/health`.

### 4.6 CORS update for Coolify domain

In `backend/server/index.ts` `isOriginAllowed`:

- Keep `FRONTEND_URL` explicit allowlist
- Remove or gate `*.vercel.app` wildcard behind env `ALLOW_VERCEL_ORIGINS=true` (default false in production)
- Add note in env docs: set `FRONTEND_URL=https://mockly.yourdomain.com`

### 4.7 Environment variables

Document in `backend/ENVIRONMENT_VARIABLES.md` and `.env.example`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACCESS_GATE_SECRET` | Prod: yes | — | Hourly code HMAC secret |
| `ACCESS_GATE_ADMIN_KEY` | Recommended | — | Protects `GET /api/access/current` |
| `ACCESS_GATE_COOKIE_MAX_AGE_SECONDS` | No | `604800` (7d) | Gate cookie lifetime |
| `ALLOW_SIGNUP` | No | `true` | Set `false` to disable registration |
| `ALLOW_VERCEL_ORIGINS` | No | `false` | Re-enable `*.vercel.app` CORS if needed |
| `FRONTEND_URL` | Prod: yes | — | Coolify app URL for CORS |

Add to `backend/server/assertProductionEnv.ts` when gate is required:

- If `ACCESS_GATE_SECRET` missing in production → warn or fail (product decision: **fail in production**)

### 4.8 Production user script (optional)

Extend `backend/scripts/create-test-user.ts` OR add `backend/scripts/create-prod-user.ts`:

- Allowed when `CREATE_USER_CONFIRM=1` env set (prevent accidental runs)
- Reads `PROD_USER_EMAIL`, `PROD_USER_PASSWORD`, `PROD_USER_FULL_NAME`
- Upserts profile with bcrypt hash
- Document in plan/README — operator creates accounts manually for invitees

---

## 5. Frontend tasks

### 5.1 New page: `frontend/src/pages/AccessGate.tsx`

- Match visual style of `Auth.tsx` / `LoginPreview.tsx` (AnimatedBackground + Card)
- Single input: “Access code” (accepts with or without dash)
- Submit → `POST /api/access/verify`
- On success → redirect to `/` (login)
- On error → toast
- Link to `/terms` if desired

### 5.2 Access gate routing

**Option A (recommended):** `frontend/src/components/AccessGateGuard.tsx`

- Wrap app routes in `App.tsx`
- On mount: `GET /api/access/status`
- If `required && !granted` and path not in allowlist → redirect to `/gate`
- Allowlist: `/gate`, `/terms`, `/results` with `mock=true` only (sample previews)

**Option B:** Check in `Index.tsx` before rendering `Auth` — insufficient alone (other routes exist). Use App-level guard.

Add route in `App.tsx`:

```tsx
<Route path="/gate" component={AccessGate} />
```

### 5.3 Update `Auth.tsx`

- When `ALLOW_SIGNUP` is false (expose via `GET /api/access/status` or new `GET /api/auth/config` returning `{ signupEnabled: boolean }`), hide “Need an account? Sign up” toggle
- Keep existing “Preview sample report” buttons (mock results) — no gate bypass needed if `/results?mock=true` stays public

Add minimal endpoint if needed:

```ts
app.get('/api/auth/config', (_req, res) => {
  res.json({ signupEnabled: process.env.ALLOW_SIGNUP !== 'false' });
});
```

### 5.4 Remove demo routes (user request)

Remove from `App.tsx`:

- `/demo`, `/demo/agent`, `/demo/resume-questions`

**Do not delete files yet in one atomic PR** — either:

1. Remove routes + add redirects `/demo` → `/gate` or `/`, OR  
2. Delete demo pages/components/mocks/public assets in a follow-up cleanup PR

Minimum for launch: **remove routes** so demo is unreachable. Deleting `frontend/public/demo/audio/*.mp3` (30 files) reduces image size — optional cleanup.

Update or archive `docs/RESUME_DEMO_INTEGRATION.md` with pointer to new access model.

### 5.5 API client

`frontend/src/lib/api.ts`:

- Ensure `POST /api/access/verify` sends `credentials: 'include'` (cookies)
- All `fetch`/`apiPost` calls should use `credentials: 'include'` when on same origin (Coolify)

Check `apiPost` — add `credentials: 'include'` globally for same-origin deployment.

---

## 6. Coolify / Hetzner deployment

### 6.1 Add `Dockerfile` at repo root

Multi-stage example:

```dockerfile
# Stage 1: build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci
COPY frontend ./frontend
RUN npm run build:frontend

# Stage 2: runtime
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --omit=dev
COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
WORKDIR /app/backend
EXPOSE 5000
CMD ["npm", "start"]
```

Verify `serveStatic` path resolves to `/app/frontend/dist/public` from backend working dir (adjust COPY paths if needed — `vite.ts` uses `../../frontend/dist/public` relative to `backend/server/`).

### 6.2 Add `.dockerignore`

```
node_modules
.git
.env
frontend/node_modules
backend/node_modules
*.md
.cursor
```

### 6.3 Coolify service configuration

| Setting | Value |
|---------|--------|
| Build pack | Dockerfile |
| Domain | `mockly.<your-domain>` |
| Port | 5000 |
| Health check | `GET /health` |
| WebSocket | Enable (Traefik passes Upgrade by default) |

**Database:** Create PostgreSQL in Coolify; set `DATABASE_URL` on the app service.

**Secrets (Coolify env):**

```
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<random 32+ bytes>
ACCESS_GATE_SECRET=<random 32+ bytes>
ACCESS_GATE_ADMIN_KEY=<random string>
ALLOW_SIGNUP=true
FRONTEND_URL=https://mockly.yourdomain.com
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
ELEVENLABS_WEBHOOK_SECRET=...
TRUST_PROXY_HOPS=1
```

Do **not** set `VITE_API_URL` — same-origin relative URLs.

### 6.4 Deploy verification checklist

- [ ] `https://mockly.domain/gate` loads
- [ ] Wrong code → 401; correct hourly code → cookie → redirect to login
- [ ] Signup works with valid gate cookie; fails without
- [ ] Signin → interview → WebSocket `wss://mockly.domain/voice` connects
- [ ] `/api/conversation-token` returns signed URL when authenticated
- [ ] User A cannot fetch User B's interview results (existing IDOR test)
- [ ] `GET /api/access/current` with admin key returns code matching local algorithm
- [ ] `/` serves React app (not JSON API message)
- [ ] `/demo` returns 404 or redirects

### 6.5 n8n workflow (document only — operator sets up)

```text
Cron: 0 * * * * (every hour)
  → HTTP GET https://mockly.domain/api/access/current
      Header: X-Admin-Key: {{ACCESS_GATE_ADMIN_KEY}}
  → Optional: notify operator via Slack/email/Telegram
```

Operator manually shares code with invitees when needed.

### 6.6 Decommission Vercel/Railway

After Coolify is stable:

- Remove Vercel project or point DNS away
- Update `README.md` deploy section to reference Coolify doc
- Add `docs/COOLIFY_DEPLOYMENT.md` (short operator guide)

---

## 7. Security checklist (implementing agent must verify)

- [ ] `ACCESS_GATE_SECRET` and `JWT_SECRET` never committed
- [ ] Access cookie is httpOnly + secure in production
- [ ] `/api/access/verify` rate limited
- [ ] Generic error messages on verify failure (“Invalid access code”)
- [ ] Signup blocked without gate cookie when gate enabled
- [ ] Admin endpoint requires `ACCESS_GATE_ADMIN_KEY`
- [ ] No hourly code in frontend bundle or client-side JS
- [ ] `ALLOW_SIGNUP=false` documented for stricter mode (operator creates users via script)

---

## 8. Testing

### 8.1 Unit tests (add in backend)

`backend/server/accessGate.test.ts`:

- Same hour → code stable
- Hour boundary → code changes
- Previous hour accepted
- Wrong code rejected
- Cookie sign/verify round trip

Run: `npm run test --workspace=backend` (extend test script if needed).

### 8.2 Manual local test

```bash
# backend/.env
ACCESS_GATE_SECRET=test-secret-at-least-32-characters-long
ACCESS_GATE_ADMIN_KEY=admin-dev-key

npm run dev:backend   # terminal 1
npm run dev:frontend  # terminal 2
```

1. Visit `/` → should redirect to `/gate`
2. Compute code or hit `GET /api/access/current` with admin key
3. Enter code → reach login
4. Sign up → complete flow

### 8.3 Disable gate for local dev (optional)

When `ACCESS_GATE_SECRET` is unset, gate middleware is no-op — preserves current dev UX.

---

## 9. File change manifest

| Action | Path |
|--------|------|
| **Create** | `backend/server/accessGate.ts` |
| **Create** | `backend/server/requireAccessGate.ts` |
| **Create** | `backend/server/accessGate.test.ts` |
| **Create** | `frontend/src/pages/AccessGate.tsx` |
| **Create** | `frontend/src/components/AccessGateGuard.tsx` |
| **Create** | `Dockerfile` |
| **Create** | `.dockerignore` |
| **Create** | `docs/COOLIFY_DEPLOYMENT.md` |
| **Modify** | `backend/server/routes.ts` — access routes, signup gate |
| **Modify** | `backend/server/index.ts` — middleware, fix `/`, CORS |
| **Modify** | `backend/server/assertProductionEnv.ts` — optional gate secret |
| **Modify** | `backend/ENVIRONMENT_VARIABLES.md` |
| **Modify** | `.env.example` |
| **Modify** | `frontend/src/App.tsx` — gate route, guard, remove demo routes |
| **Modify** | `frontend/src/lib/api.ts` — credentials include |
| **Modify** | `frontend/src/components/Auth.tsx` — hide signup when disabled |
| **Modify** | `README.md` — deploy pointer |
| **Optional delete** | `frontend/src/pages/Demo*.tsx`, demo components, `frontend/public/demo/**` |

---

## 10. Implementation order

1. **Backend access gate module + tests** (no UI yet)
2. **Access routes + middleware + signup protection**
3. **Fix `/` vs `serveStatic` conflict**
4. **Frontend `/gate` page + guard + api credentials**
5. **Auth signup toggle via config endpoint**
6. **Remove demo routes**
7. **Dockerfile + env docs**
8. **Deploy to Coolify + smoke test**
9. **n8n doc + operator runbook**

---

## 11. Acceptance criteria

Done when:

1. Without a valid hourly code, users cannot reach login or call protected APIs.
2. With a valid code, users can sign up, sign in, run a voice interview, and view results.
3. Hourly code rotates automatically; previous hour still works for ~1 hour overlap.
4. Operator can fetch current code via admin endpoint.
5. App runs on Coolify at custom domain with HTTPS and working WebSockets.
6. Public `/demo` hub is removed; sample mock results on login still work.
7. Env vars documented; no secrets in git.

---

## 12. Reference: existing auth (do not rewrite)

- Signin/signup: `backend/server/routes.ts` ~791–890
- JWT middleware: `authenticateToken` ~499
- Login UI: `frontend/src/components/Auth.tsx`
- Static serve: `backend/server/vite.ts` → `serveStatic()`
- User isolation example: `GET /api/interviews/:id/results` ~2420

---

## 13. Open decisions (defaults chosen above)

| Question | Default |
|----------|---------|
| Code timezone | UTC |
| Gate cookie duration | 7 days |
| Remove demo assets | Routes removed; file deletion optional |
| Fail startup without `ACCESS_GATE_SECRET` in prod | Yes |
| Signup | Enabled but requires gate cookie; use `ALLOW_SIGNUP=false` for invite-only |

If the product owner wants different defaults, adjust before implementation.
