# ☁️ Deploying StudyBuddy to Faable (production)

> **Note: superseded** — the recommended deployment is now **Vercel (frontend) +
> Railway (backend)**; see [`DEPLOY_VERCEL_RAILWAY.md`](DEPLOY_VERCEL_RAILWAY.md).
> This guide is kept for reference.

There are **two ways** to put StudyBuddy live on [Faable Deploy](https://faable.com/deploy) — they
differ in cost and structure:

| | **Option A — Free plan, no Docker** (recommended) | **Option B — single Docker container** |
|---|---|---|
| Cost | **€0** (Free plan) | Hobby **€15/mo + usage** or Pro €99/mo |
| How | Two Faable apps (Next.js + FastAPI), built with Faable's **managed buildpacks** | One app built from the repo-root `Dockerfile` (both processes in one container) |
| Files used | `frontend/` + `backend/` (buildpacks auto-detect) | `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore` |
| Why pick | Stay on the free tier | One URL/app, exact local-container behavior |

> **Why does the Dockerfile need a paid plan?** Docker and Dockerfile builds are a **Hobby/Pro
> entitlement** — the Free plan only runs the managed buildpacks (Node.js/Next.js, Python, PHP).
> Faable refuses the build with that message if a Free app resolves to Docker. The managed
> buildpacks support **Next.js and FastAPI out of the box on every plan, Free included** — that's
> the whole trick behind Option A.

Both options share the same database and secrets, and in both cases **all real data must live in a
hosted PostgreSQL** — Faable's filesystem is *ephemeral* (the SQLite `studybuddy.db` would be wiped
on every deploy/restart/sleep). StudyBuddy auto-creates its tables on startup, so no SQL is needed.

---

## Architecture per option

**Option A (Free, two apps)** — the browser only ever talks to the frontend app; the frontend's
Next.js server proxies `/api/*` to the backend app server-side (so no CORS anywhere):

```
Browser
  │  https://<frontend-app>.faable.link   (all requests same-origin)
  ▼
Faable app 1 — Next.js buildpack   Root Directory: frontend
  │  /api/* proxied by next.config.js → BACKEND_URL
  ▼
Faable app 2 — Python buildpack    Root Directory: backend   (uvicorn main:app --port $PORT)
  │
  ▼
Supabase PostgreSQL  ← DATABASE_URL (tables auto-created on boot)
```

**Option B (Hobby/Pro, one container)** — as it ran in your local Docker tests:

```
Browser → https://<app>.faable.link → Next.js standalone :$PORT
  → /api/* proxied to uvicorn :8000 (inside the same container) → Supabase PostgreSQL
```

## Files that make this work

| File | Purpose | Used by |
|------|---------|---------|
| `frontend/` + `frontend/package.json` | The Next.js app; buildpack detects `next` in dependencies | Option A |
| `backend/` + `backend/requirements.txt` | The FastAPI app; buildpack detects `requirements.txt` + `main.py` (`app = FastAPI(...)`) | Option A |
| `frontend/next.config.js` | `/api` → backend rewrites; target from `BACKEND_URL` env (falls back to `localhost:8000` for dev/Docker) + 10-min proxy timeout | Both |
| `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore` | Single-container build that runs uvicorn + Next.js together | Option B only |
| `frontend/src/lib/api.ts` | All API calls (incl. PDF uploads) are same-origin `/api` — no hardcoded host | Both |

> ⚠️ The `Dockerfile` sits at the repo root, but Option A's apps point their Root Directory at
> `frontend/` or `backend/` (subfolders with no Dockerfile), so the managed buildpacks are used.

---

## Step 1 — Create the PostgreSQL database (Supabase) [both options]

1. Create a free project at [supabase.com](https://supabase.com) (any region).
2. Open **Project Settings → Database → Connection string**.
3. Copy the **Session pooler** (or direct) connection string — it looks like:
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
4. Add `?sslmode=require` to the end (Supabase requires SSL):
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```
   If your password contains special characters, URL-encode them (`@` → `%40`, `#` → `%23`, …).
5. Keep this string — it becomes the `DATABASE_URL` secret. Tables are created automatically the
   first time the backend boots; **you don't run any SQL**.

## Step 2 — Generate a SECRET_KEY [both options]

The backend signs JWTs with `SECRET_KEY`. Generate a strong random value (don't ship the dev
fallback):

```bash
python -c "import secrets; print(secrets.token_hex(32))"
# or
openssl rand -hex 32
```

## Step 3 — Make sure the code is pushed [both options]

Commit and push everything (the repo already contains all Option A + Option B files):

```bash
git add .
git commit -m "Deployable on Faable (Free: two buildpack apps, or Hobby: single Docker container)"
git push origin main
```

---

# Option A — Free plan (no Docker)

You create **two projects → two apps** from the same repo. Free gives **1 free `bi.xs` instance per
project**, so putting each app in its own project keeps the whole stack at **€0**. (Two apps in one
project would bill the second instance.)

> **Why isn't there a `faable.json` in this repo?** Faable reads only **one** `faable.json` — at
> the **repository root** — and files inside `frontend/` or `backend/` are ignored. A single root
> file can only point at one app (`rootDir`), so when **two apps share one repository** the Root
> Directory is set **per app on the platform** (app settings), which takes precedence over any
> `faable.json`. No in-repo config is needed: pointing each app at its folder makes Faable
> auto-detect the stack (`frontend` → Next.js, `backend` → FastAPI) and generate the start command
> itself.

## A1. Backend app (FastAPI) — deploy first

1. Faable Dashboard → create **Project** `studybuddy-api` (starts on Free) → create an **App**.
2. **Link repository**: `zalimrajput/ProStackHub-Project2-StudyBuddy`.
3. In the app's **Settings**, set the **Root Directory** to `backend` — the Python buildpack then
   finds `requirements.txt` and `main.py` (`app = FastAPI(...)`) and runs
   `uvicorn main:app --host 0.0.0.0 --port $PORT` automatically. No start command to write.
4. **Environment/secrets** on this app:
   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Supabase string from Step 1 (with `?sslmode=require`) |
   | `SECRET_KEY` | Random string from Step 2 — changing it later logs everyone out |
   | `GEMINI_API_KEY` | Google AI Studio key — without it, flashcard generation fails |
5. **Deploy**. Your backend is live at `https://<backend-app>.faable.link` (check
   `https://<backend-app>.faable.link/api/health` → `{"status":"ok",...}`). Copy this URL for A2.

## A2. Frontend app (Next.js)

1. Create **Project** `studybuddy-web` (Free) → create an **App**.
2. **Link the same repository**.
3. In the app's **Settings**, set the **Root Directory** to `frontend` — the builder detects
   Next.js, runs `npm run build`, and serves with `next start` (standalone output is applied
   automatically).
4. **Environment/secrets** on this app:
   | Variable | Value |
   |----------|-------|
   | `BACKEND_URL` | `https://<backend-app>.faable.link` (from A1 — **no trailing slash**) |

   `BACKEND_URL` is read by `next.config.js` at runtime and drives the `/api/*` proxy. No CORS
   config is needed: the browser talks only to this app, and this app proxies to the backend.
5. **Deploy**. Open `https://<frontend-app>.faable.link` and verify:
   - Sign up at `/signup`, log out and back in at `/login`.
   - Create a deck, then generate flashcards from text **and** from a PDF upload (this exercises
     Gemini through the full proxy chain — allow a few minutes; the proxy timeout is 10 min).
   - Persistence check: create a deck, redeploy the backend, confirm the deck is still there (it
     lives in Supabase).

> CLI equivalent — after `faable login`, set each app's secrets (the app is picked interactively):
> ```bash
> faable deploy secrets set DATABASE_URL='postgresql://...' SECRET_KEY='...' GEMINI_API_KEY='...'
> faable deploy secrets set BACKEND_URL='https://<backend-app>.faable.link'
> ```
>
> Deploying from the CLI: because **two apps share this repository**, pass the app id explicitly —
> `faable deploy <app_id>` (list ids with `faable deploy list`). The Root Directory itself stays a
> dashboard/app-settings value; it can't be declared in a repo file for this setup.

---

# Option B — Hobby/Pro plan (single Docker container)

This is the "one URL" deployment that matches your local `docker run` exactly. Requires **Hobby
(€15/mo + usage)** because it builds the repo-root `Dockerfile`.

1. Create a **Project** (Hobby) → create an **App** → link the repository.
2. **Root Directory**: leave at `/` — the `Dockerfile` lives at the repo root, so Faable builds it
   with BuildKit. (If a different builder is picked, set the app's Builder to **Dockerfile**.)
3. **Environment/secrets**: `DATABASE_URL`, `SECRET_KEY`, `GEMINI_API_KEY` (Steps 1–2). No
   `BACKEND_URL` — in the container the backend is on `localhost:8000`, the config's default.
4. **Deploy** → open `https://<app>.faable.link` and run the same verification as A2.
5. To update: push to the release branch — Faable rebuilds the image and redeploys. Data survives
   because it lives in Supabase.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Deploy stopped with "Docker and Dockerfile builds require a paid plan" | You're on Free with the Docker path. Use **Option A** (two apps, buildpacks) or upgrade to Hobby. |
| Frontend is up but every `/api/*` call 500s / "backend not reachable" | `BACKEND_URL` missing on the frontend app (Option A), so it proxies to its own `localhost:8000`. Set it and redeploy. |
| App deploys but data "resets" on redeploy | `DATABASE_URL` missing/wrong, so the backend silently fell back to SQLite on the ephemeral disk. Set it (Step 1) and redeploy. |
| PDF upload → "socket hang up" / 500 after ~30s | Old build of the frontend: Next's `/api` proxy kills upstream requests after 30s. The current `next.config.js` raises it to 10 min (`experimental.proxyTimeout`) — redeploy. |
| Signup/login works in Docker but the email isn't in the DB you check | The container only shares your data if it gets the same `DATABASE_URL`. Without it, the backend uses a throwaway SQLite file inside the container. Run with `--env-file backend/.env` so it uses the same Supabase DB as `python main.py`. |
| Second app in the same project costs money | Free includes 1 `bi.xs` instance per project. Put each app in its own project (Option A) to stay free. |
| Gemini generation fails with 4xx | `GEMINI_API_KEY` missing/expired or quota. See README → Troubleshooting. |
| Everyone logged out after a deploy | `SECRET_KEY` changed — JWTs signed with the old key are rejected. Keep it stable. |
| First request is slow | Free apps sleep after ~30 min idle and cold-start on the next request (a few seconds). Uptime-monitor pings don't keep a Free app awake. |
| Build fails with "artifact too large" | Free caps build artifacts at 512 MB. Keep `node_modules`, `.env`, `*.db` out of git; if genuinely needed, upgrade. |
| Backend boot fails with "no start command" (Option A) | The Python buildpack searches `main.py → app.py → …` for `app = FastAPI(...)`. Ours is `backend/main.py`, found when Root Directory is `backend`. |

## Local test of the exact production image (Option B)

```bash
docker build -t studybuddy .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://...?...sslmode=require' \
  -e SECRET_KEY='...' \
  -e GEMINI_API_KEY='...' \
  studybuddy
# open http://localhost:3000

# Tip: to make the container share the SAME database and secret as local
# `python main.py` (which reads backend/.env), pass the file instead of -e flags:
docker run --rm -p 3000:3000 --env-file backend/.env studybuddy
```

To test **Option A** locally (two processes, backend URL instead of same-container):
set `BACKEND_URL=http://localhost:8000` when running `npm run dev` — that's already the default,
so plain `python main.py` + `npm run dev` IS the Option A topology.
