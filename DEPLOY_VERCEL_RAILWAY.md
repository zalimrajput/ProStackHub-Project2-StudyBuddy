# ☁️ Deploying StudyBuddy — Vercel (frontend) + Railway (backend)

The recommended production setup runs the two halves of StudyBuddy on separate
platforms, because each half fits its platform:

| Service | Platform | Cost | What runs |
|---------|----------|------|-----------|
| **Frontend** | [Vercel](https://vercel.com) | **Free** (Hobby) | The Next.js app in `frontend/` — static pages + server rendering |
| **Backend** | [Railway](https://railway.app) | Hobby, usage-based (~$5/mo; new accounts get trial credit) | The FastAPI app in `backend/` — full container, uvicorn on `$PORT` |

Both services are deployed from the **same GitHub repository**, each pointing at
its own folder as the Root Directory. Data lives in **Supabase PostgreSQL**, so
redeploys never lose anything.

## Why the browser talks to the backend directly (not through Vercel)

```
Browser (your user)
  │
  ├── static pages + JS ───────────────► Vercel (Next.js, frontend/)
  │                                     https://<app>.vercel.app
  │
  └── HTTPS calls to /api/* ──────────► Railway (FastAPI, backend/)
    (including multi-MB PDF uploads      https://<service>.up.railway.app
     and generations that run minutes)        │  DATABASE_URL
                                             ▼
                                      Supabase PostgreSQL
```

The Next.js app is configured with `NEXT_PUBLIC_BACKEND_URL`
(`frontend/src/lib/api.ts`), so **the browser calls the Railway backend directly**.
Deliberately **not** proxied through Vercel, because Vercel hard-caps proxied
requests at **120 seconds** and **~4.5 MB request bodies** — while StudyBuddy's
flashcard generation (PDF extraction + Gemini retries) routinely runs for minutes
and uploads whole PDFs. Direct calls avoid both limits entirely.

Consequences of direct calls:

- Railway must allow the browser origin: set **`CORS_ORIGINS`** on Railway to your
  Vercel origin (e.g. `https://studybuddy.vercel.app`). Local dev origins are
  always allowed, so nothing changes locally.
- The `/api` rewrite in `next.config.js` is **only used for local dev and the
  Docker container** now; on Vercel it is never hit.
- The Railway backend URL is public — that's fine, every endpoint except
  `/api/health` and `/api/auth/*` requires the JWT.

---

## Step 0 — Prerequisites (once)

1. Everything is committed and pushed to GitHub (`origin/main`).
2. A Supabase project exists and you have its **`DATABASE_URL`**
   (see README → "Optional: Use PostgreSQL instead of SQLite"). Tables
   auto-create on backend boot — no SQL needed.
3. You have your **`SECRET_KEY`** (generate one:
   `python -c "import secrets; print(secrets.token_hex(32))"`) and
   **`GEMINI_API_KEY`** (Google AI Studio). These already live in your local
   `backend/.env` — copy the values, never commit that file.

---

## Step 1 — Deploy the backend on Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from
   GitHub repo** → pick `zalimrajput/ProStackHub-Project2-StudyBuddy`
   (install the Railway GitHub app if asked).
2. **Settings → Root Directory** → set to `backend`.
   - The repo ships **`backend/railway.json`** (Railpack builder + start command
     `uvicorn main:app --host 0.0.0.0 --port $PORT` + `/api/health` healthcheck),
     so no start command needs to be typed. Railway auto-detects it from the
     `backend` root.
3. **Variables** on the service (Railway redeploys automatically when you change
   them):

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Supabase connection string (with `?sslmode=require`) |
   | `SECRET_KEY` | Your random secret — changing it later logs everyone out |
   | `GEMINI_API_KEY` | Your Google AI Studio key — without it generation fails |
   | `CORS_ORIGINS` | `https://<app>.vercel.app` — set **after** Step 2 gives you the URL (or `*` temporarily) |

4. Deploy and confirm it's healthy: open **Settings → Networking → Generate
   Domain** (Railway usually creates `https://<service>.up.railway.app`
   automatically for an HTTP service), then visit
   `https://<service>.up.railway.app/api/health` → expect
   `{"status":"ok","service":"studybuddy-api"}`.
5. **Copy this backend URL** — you need it for Step 2 (no trailing slash).

## Step 2 — Deploy the frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the
   same GitHub repo.
2. Vercel auto-detects **Next.js**. Set the project's **Root Directory** to
   `frontend` (if it isn't picked automatically).
3. **Environment Variables** (this one is **build-time**, so add it before the
   first build):

   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_BACKEND_URL` | `https://<service>.up.railway.app` from Step 1 — **no trailing slash** |

   `NEXT_PUBLIC_` variables are inlined into the browser bundle at build time —
   a server-only `BACKEND_URL` variable would **not** work for this.
4. Click **Deploy**. Open `https://<app>.vercel.app`.

## Step 3 — Close the loop (CORS) and verify

1. Back on Railway, set `CORS_ORIGINS` to `https://<app>.vercel.app` (Railway
   redeploys). If you use Vercel **preview deployments**, add those origins too
   (each preview has its own `https://<project>-git-<branch>-<user>.vercel.app`
   URL), or temporarily use `*` while testing.
2. On the live site, verify end-to-end:
   - `https://<app>.vercel.app/api/health` should *not* be needed — instead
     check the real flow below.
   - Sign up at `/signup`, log out and back in at `/login`.
   - Create a deck → generate flashcards from **text**.
   - Upload a **PDF** and generate — allow minutes; there is no 120s cap on this
     path (watch Railway logs via the Deployments → Logs tab if curious).
   - Persistence check: create a deck, redeploy the backend on Railway, confirm
     the deck is still there (it lives in Supabase).

---

## Updating the app later

Push to `main` → both platforms redeploy automatically from the connected repo
(Railway from the `backend` root, Vercel from `frontend`). If you change the
frontend origin (custom domain, new preview URL), update `CORS_ORIGINS` on
Railway. Keep `SECRET_KEY` stable across deploys or all users are logged out.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Browser console shows CORS errors on API calls | The Railway `CORS_ORIGINS` doesn't include your exact Vercel origin. Add `https://<app>.vercel.app` (each preview origin too) and let Railway redeploy. |
| API calls 404/500 and hit `https://<app>.vercel.app/api/...` | `NEXT_PUBLIC_BACKEND_URL` wasn't set (or was set after the build). It's baked into the client at **build time** — set it and redeploy. If it were set, requests go straight to `*.up.railway.app`. |
| Railway deploy fails or never becomes healthy | Check the deploy logs. `railway.json` in `backend/` sets the start command; if you removed it, set Settings → Start Command to `uvicorn main:app --host 0.0.0.0 --port $PORT` and the healthcheck path to `/api/health`. |
| App works but data "resets" | `DATABASE_URL` missing/wrong on Railway → backend fell back to the ephemeral SQLite file in the container. Set it and redeploy. |
| Login works locally, fails in prod | `SECRET_KEY` differs from the one that signed your local JWTs, or `DATABASE_URL` points at a different database. Keep both identical to your `backend/.env` values. |
| PDF upload / generation fails mid-way | Check Railway logs. Direct calls have no Vercel caps, so it's usually a Gemini quota/key issue or an oversized PDF (100 MB backend limit). If you still see `socket hang up`, you're hitting an **old cached frontend build** that proxies through Vercel — redeploy the frontend. |
| `GET /api/health` on Railway returns 404 | Railpack started with a different command than expected (or the healthcheck ran before boot finished). Confirm `railway.json` is present in `backend/` and the Root Directory is `backend`. |

## Local test that mirrors this topology

Exactly the two-terminal dev setup from the README *is* this topology —
browser → Next.js on `:3000`, backend on `:8000` (or with
`NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev` to force direct
browser→backend calls, which is what production does):

```bash
# terminal 1 — backend (with backend/.env providing DATABASE_URL etc.)
cd backend && python main.py

# terminal 2 — frontend
cd frontend && npm run dev   # open http://localhost:3000
```
