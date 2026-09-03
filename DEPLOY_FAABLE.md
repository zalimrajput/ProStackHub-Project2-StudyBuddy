# ☁️ Deploying StudyBuddy to Faable (production)

This guide takes the app live on [Faable Deploy](https://faable.com/deploy) as a **single container**
that runs both the Next.js frontend and the FastAPI backend, backed by a hosted **PostgreSQL
(Supabase)** database.

> **Why a hosted database?** Faable's container filesystem is *ephemeral* — anything written to
> disk (including the SQLite `studybuddy.db`) is deleted on every deploy, restart, or when the app
> wakes from sleep. All real data must live outside the container. StudyBuddy auto-creates its
> tables on startup, so no SQL needs to be run manually.

## Architecture

```
Browser
  │  https://<app>.faable.link  (all requests same-origin)
  ▼
Next.js standalone server  :$PORT (3000)      ← Faable routes traffic here
  │  /api/* proxied by next.config.js rewrites
  ▼
uvicorn (FastAPI backend)  :8000 (container-internal only)
  │
  ▼
Supabase PostgreSQL  ← DATABASE_URL (tables auto-created on boot)
```

No CORS is needed in production: the browser only ever talks to the Next.js origin, and Next.js
proxies `/api/*` to the backend on `localhost:8000` — which is valid because both processes run in
the **same container** (the same arrangement as local dev).

## Files that make this work

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: Next.js standalone output + Python virtualenv, both in one image |
| `docker-entrypoint.sh` | Starts uvicorn on `:8000` and Next.js on `:$PORT`; exits if either dies so Faable restarts it |
| `.dockerignore` | Keeps `node_modules`, `.env`, `.db` files, etc. out of the image |
| `frontend/next.config.js` | `output: 'standalone'` + the `/api` → `localhost:8000` rewrites |
| `frontend/src/lib/api.ts` | All API calls (incl. generate/uploads) are same-origin `/api` — no hardcoded host |

---

## Step 1 — Create the PostgreSQL database (Supabase)

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

## Step 2 — Generate a SECRET_KEY

The backend signs JWTs with `SECRET_KEY`. Generate a strong random value (it's how sessions stay
secure — don't ship the dev fallback):

```bash
python -c "import secrets; print(secrets.token_hex(32))"
# or
openssl rand -hex 32
```

## Step 3 — Make sure the code is pushed

The deployable files (`Dockerfile`, `docker-entrypoint.sh`, `.dockerignore`, and the frontend
changes) must be committed and pushed to GitHub:

```bash
git add Dockerfile docker-entrypoint.sh .dockerignore frontend/next.config.js frontend/src/lib/api.ts
git commit -m "Make the app deployable as a single Faable container"
git push origin main
```

## Step 4 — Create the app on Faable

1. Create an account at the [Faable Dashboard](https://faable.com/dashboard).
2. Create a **Project**, then an **App**.
3. **Link the repository**: `zalimrajput/ProStackHub-Project2-StudyBuddy`.
4. **Root Directory**: leave at the repository root (`/`) — the `Dockerfile` lives there.
5. Faable detects the `Dockerfile` and builds the image (the repo root has no `package.json` or
   `main.py` of its own, so Docker is the fallback). If a different builder is selected, switch
   the app's **Builder** to Dockerfile.

## Step 5 — Set the environment variables

Add these as **secrets** on the app (Dashboard → App → Environment, or the CLI below). They are
read at runtime by the backend:

| Variable | Required | Value |
|----------|----------|-------|
| `DATABASE_URL` | **Yes** | Supabase connection string from Step 1 (with `?sslmode=require`) |
| `SECRET_KEY` | **Yes** | Random string from Step 2 — changing it later logs everyone out |
| `GEMINI_API_KEY` | **Yes** | Google AI Studio key — without it, flashcard generation fails |

CLI equivalent:

```bash
npm i -g @faable/faable
faable login
faable deploy secrets set \
  DATABASE_URL='postgresql://...?...sslmode=require' \
  SECRET_KEY='...' \
  GEMINI_API_KEY='...'
```

No frontend variables are needed — the frontend talks to the backend through the same-origin
`/api` proxy, so no public URL/CORS configuration is required.

## Step 6 — Deploy and verify

1. Push to the release branch (or click **Deploy** in the dashboard). The first build is the
   slowest — it runs `npm ci` + `next build` and `pip install`.
2. Open your live URL `https://<app>.faable.link` (automatic SSL).
3. Verify end-to-end:
   - Sign up at `/signup`, log out and back in at `/login`.
   - Create a deck, then generate flashcards from text or a PDF (exercises Gemini — watch the
     backend logs if generation fails).
4. Sanity-check data persistence: create a deck, trigger a redeploy, and confirm the deck is still
   there (it lives in Supabase, so it must be).

## Step 7 — Shipping updates

Push new commits to your release branch — Faable rebuilds and redeploys automatically. The old
instance is replaced, but **no data is lost** because everything lives in Supabase.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| App deploys but data "resets" on redeploy | `DATABASE_URL` is missing or wrong, so the backend silently fell back to SQLite on the ephemeral disk. Set `DATABASE_URL` (Step 1/5) and redeploy. |
| API calls return errors / "backend not reachable" | Check the app logs: uvicorn must be listening on `:8000` and Next.js on `:$PORT`. Both are started by `docker-entrypoint.sh`. |
| Gemini generation fails with 4xx | `GEMINI_API_KEY` missing/expired, or quota. See README → Troubleshooting. |
| Everyone logged out after a deploy | `SECRET_KEY` changed — JWTs signed with the old key are rejected. Keep it stable. |
| First request is slow | Free/light instances sleep after inactivity and wake on the next request. |
| Build uses the wrong builder | Make sure the app's Root Directory is the repo root and the Builder is **Dockerfile**. |
| Big PDF upload fails | Uploads stream through Next.js to the backend (100 MB cap enforced by the backend). If you hit platform limits, use a larger instance size. |

## Local test of the exact production image

```bash
docker build -t studybuddy .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://...?...sslmode=require' \
  -e SECRET_KEY='...' \
  -e GEMINI_API_KEY='...' \
  studybuddy
# open http://localhost:3000
```
