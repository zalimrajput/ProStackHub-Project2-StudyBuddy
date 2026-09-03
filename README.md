# 🧠 StudyBuddy

**AI-powered flashcard generation with spaced repetition learning**

StudyBuddy extracts content from PDF documents (text, images, formulas, tables) using PyMuPDF, generates flashcards via Google Gemini AI, and helps you learn through an SM-2 spaced repetition algorithm.

Every user gets their own account backed by **JWT authentication**, so decks, flashcards, and study stats stay private and isolated per user.

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Run with Docker (PostgreSQL)](#run-with-docker-postgresql)
- [Environment Variables](#environment-variables)
- [Production Deployment (Faable)](#production-deployment-faable)
- [Starting the Application](#starting-the-application)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)

---

## ✨ Features

- **User Accounts & JWT Auth** — Sign up or log in; decks, cards, and progress are isolated per user
- **PDF Upload & Extraction** — Extracts text, images, formulas (LaTeX), tables, and headings from any PDF using PyMuPDF
- **AI Flashcard Generation** — Sends extracted content to Gemini AI with a detailed prompt to generate high-quality Q&A flashcards
- **Image Support** — Embeds extracted images (diagrams, graphs, charts) directly into flashcards
- **Formula Rendering** — LaTeX formulas rendered with KaTeX in the browser
- **Spaced Repetition (SM-2)** — Adapts review intervals based on your performance (Again/Hard/Good/Easy)
- **"Again" Cards** — Cards you didn't know get re-shown after 10 minutes with a countdown timer
- **Dashboard** — Overview of total cards, due cards, mastery, study streak, and decks
- **Dark/Light Mode** — Toggle between themes
- **Keyboard Shortcuts** — Space/Enter to reveal, 1-4 to rate during review
- **Batch Processing** — Large PDFs (50+ pages) are automatically split into 25-page batches

---

## 🛠 Tech Stack

### Backend

| Component | Technology |
|-----------|-----------|
| Framework | FastAPI (Python 3.11+) |
| Database | SQLite or PostgreSQL via SQLAlchemy ORM |
| PDF Extraction | PyMuPDF (fitz) + Pillow |
| AI Provider | Google Gemini API (REST) |
| Validation | Pydantic v2 |
| Auth | JWT (python-jose) + bcrypt |
| Server | Uvicorn with auto-reload |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Formula Rendering | KaTeX |
| Icons | Lucide React |

---

## 📁 Project Structure

```
ProStackHub-Project2-StudyBuddy/
├── backend/
│   ├── main.py              # FastAPI app, middleware, CORS, lifespan
│   ├── database.py          # SQLAlchemy engine, session, auto-migration
│   ├── models.py            # ORM models: User, Deck, Flashcard, ReviewHistory
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── auth.py              # JWT creation/validation + bcrypt hashing
│   ├── gemini_client.py     # Gemini API calls, prompt, model fallback
│   ├── pdf_extractor.py     # PDF parsing: text, images, formulas, tables
│   ├── json_fix.py          # Fix malformed JSON from Gemini (LaTeX backslashes)
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # Environment variables (not committed)
│   ├── .env.example         # Template for .env
│   ├── studybuddy.db        # SQLite database (auto-created)
│   └── routers/
│       ├── __init__.py
│       ├── auth.py          # Signup / login / me endpoints
│       ├── decks.py         # CRUD for decks
│       ├── cards.py         # List/get/delete cards in a deck
│       ├── generate.py      # Upload PDF/text → generate flashcards
│       ├── review.py        # SM-2 review session + rating submission
│       └── stats.py         # Dashboard statistics
│
├── frontend/
│   ├── package.json
│   ├── next.config.js       # API proxy: /api/* → localhost:8000
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx       # Root layout, nav bar, theme + auth providers
│       │   ├── globals.css      # Tailwind + custom component classes
│       │   ├── page.tsx         # Dashboard page (requires login)
│       │   ├── login/
│       │   │   └── page.tsx     # Log in with email + password
│       │   ├── signup/
│       │   │   └── page.tsx     # Create a new account
│       │   ├── generate/
│       │   │   └── page.tsx     # Upload PDF or paste text → generate
│       │   ├── decks/
│       │   │   ├── page.tsx     # List all decks
│       │   │   └── [id]/
│       │   │       └── page.tsx # Deck detail: list cards, expand Q&A
│       │   └── review/
│       │       └── [id]/
│       │           └── page.tsx # Review session with SM-2 rating
│       └── lib/
│           ├── api.ts           # API client functions (attaches JWT)
│           ├── AuthContext.tsx  # Auth state: login, signup, logout, token
│           ├── types.ts         # TypeScript interfaces
│           ├── ThemeContext.tsx  # Dark/light mode context
│           ├── Formula.tsx      # KaTeX formula renderer
│           ├── FormattedText.tsx # Markdown-like text renderer
│           └── ImageLightbox.tsx # Fullscreen image viewer
│
├── .gitignore
└── README.md
```

---

## ✅ Prerequisites

- **Python 3.11+** — [python.org](https://python.org)
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Google Gemini API Key** — [Get one here](https://aistudio.google.com/apikey)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/zalimrajput/ProStackHub-Project2-StudyBuddy.git
cd ProStackHub-Project2-StudyBuddy
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
```

Edit `backend/.env` and add your Gemini API key:

```
GEMINI_API_KEY=your_api_key_here
DATABASE_URL=sqlite:///./studybuddy.db   # or any PostgreSQL URL, e.g. Supabase
SECRET_KEY=your_random_secret            # optional — a dev default is built in
```

#### Optional: Use PostgreSQL instead of SQLite

Out of the box StudyBuddy runs on **SQLite** — the `studybuddy.db` file and all tables (`users`, `decks`, `flashcards`, `review_history`) are created **automatically on first backend start**, so no database setup is needed. If you'd rather use PostgreSQL (e.g., a free Supabase project):

1. Create a project at [supabase.com](https://supabase.com) or use any other PostgreSQL host
2. Copy the project's connection string (SQLAlchemy/Postgres URI format, e.g. from **Project Settings → Database**):

   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```

3. Add it to `backend/.env` as `DATABASE_URL` (replacing the SQLite default)
4. Start the backend — the tables are created and migrated **automatically on startup**, same as SQLite; you don't need to run any SQL

Notes:

- `psycopg2-binary` is already in `requirements.txt`, so no extra `pip install` is needed
- If your password contains special characters, URL-encode them (e.g. `@` → `%40`)
- Switching to PostgreSQL only changes where data is stored — the API and app behave identically

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
```

### 4. Start the Application

Open **two terminals** — one for backend, one for frontend.

#### Terminal 1 — Backend (port 8000)

```bash
cd backend
venv\Scripts\activate    # if not already active
python main.py
```

Or with uvicorn directly:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --timeout-keep-alive 300
```

The backend starts at `http://localhost:8000`. You'll see:

```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

#### Terminal 2 — Frontend (port 3000)

```bash
cd frontend
npm run dev
```

The frontend starts at `http://localhost:3000`.

### 5. Open the App

Navigate to **http://localhost:3000** in your browser. The app redirects unauthenticated visitors to `/login` — create an account at `/signup` first, or log in if you already have one.

### 6. Run with Docker (PostgreSQL)

Prefer a single container over two terminals? The repo ships a `Dockerfile` that runs the backend (uvicorn on `:8000`) and frontend (Next.js on `:3000`) together in one image.

```bash
# 1. Make sure Docker Desktop is running, then build the image (from the repo root)
docker build -t studybuddy .

# 2. Run it — --env-file passes backend/.env into the container, so it uses the SAME
#    PostgreSQL (Supabase) database as `python main.py` (accounts/decks are shared)
docker run -d --name studybuddy -p 3000:3000 --env-file backend/.env studybuddy
```

Then open **http://localhost:3000** — the same app as local dev. Useful commands:

```bash
docker logs -f studybuddy    # frontend + backend logs together
docker stop studybuddy       # stop the container
docker start studybuddy      # start it again (data lives in PostgreSQL, so it persists)
docker rm -f studybuddy      # remove the container
```

> **PostgreSQL vs SQLite in Docker** — the container only uses PostgreSQL if it receives
> `DATABASE_URL`. `--env-file backend/.env` provides it (that file already points at your
> Supabase PostgreSQL). Run *without* it and the backend silently falls back to a throwaway
> SQLite file inside the container: accounts you create there won't show up in your PostgreSQL
> database and disappear when the container is removed.
>
> To confirm which database the container is using, check the boot logs: PostgreSQL prints
> `[db] Ensured column …` (`ALTER TABLE … IF NOT EXISTS`), SQLite prints `[db] Added column: …`.

If port **3000 is already in use** (e.g. `npm run dev` is running), stop that process or publish a different host port: `docker run -d --name studybuddy -p 3100:3000 --env-file backend/.env studybuddy` → open http://localhost:3100.

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key |
| `DATABASE_URL` | No | `sqlite:///./studybuddy.db` | Database connection string (SQLite or PostgreSQL — see `backend/.env.example` for a Supabase template) |
| `SECRET_KEY` | No | dev fallback | Secret used to sign JWTs; set a strong random value in production |

### Frontend

The frontend has **no required environment variables** (optional `BACKEND_URL` points the `/api` proxy at a deployed backend instead of `localhost:8000` — used only on the Faable Free two-app setup). Every API call (including generate and
file uploads) stays same-origin under `/api` and is proxied to the backend via `next.config.js`
rewrites (`/api/*` → `localhost:8000/api/*`). All API calls include the
`Authorization: Bearer <token>` header.

---

## ☁️ Production Deployment (Faable)

Ready to share the app live? Two ways to deploy on [Faable Deploy](https://faable.com/deploy): **free (€0)** as two buildpack apps (Next.js + FastAPI, no Docker) or on a **paid Hobby/Pro plan** as one Docker container running both. Either way:

- The frontend proxies `/api/*` to the backend (same container in Docker, or the backend app's URL via `BACKEND_URL` on the Free path) — no CORS setup needed
- Data lives in Supabase PostgreSQL (`DATABASE_URL`); tables auto-create on first boot
- Set `DATABASE_URL`, `SECRET_KEY`, `GEMINI_API_KEY` (plus `BACKEND_URL` on the frontend app for the Free path) as Faable secrets
- Push to your release branch and Faable rebuilds + redeploys automatically

**See [`DEPLOY_FAABLE.md`](DEPLOY_FAABLE.md) for the complete step-by-step guide.**

---

## 📡 API Endpoints

> All endpoints except `/api/health` and `/api/auth/*` require an `Authorization: Bearer <access_token>` header (the token returned by login/signup). Decks, cards, and stats are scoped to the authenticated user.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/signup` | Create account `{email, username, password}` → `{access_token, user}` |
| `POST` | `/api/auth/login` | Log in `{email, password}` → `{access_token, user}` |
| `GET` | `/api/auth/me` | Get the current user from the token |

### Health Check

```
GET /api/health
```

### Stats

```
GET /api/stats/
```

Returns dashboard stats: total cards, due today, mastered, reviews today, streak, all decks.

### Decks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/decks/` | List all decks |
| `GET` | `/api/decks/{id}` | Get deck by ID |
| `POST` | `/api/decks/` | Create deck `{name, description}` |
| `PUT` | `/api/decks/{id}` | Update deck |
| `DELETE` | `/api/decks/{id}` | Delete deck and all its cards |

### Cards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/decks/{id}/cards/` | List cards in deck |
| `GET` | `/api/decks/{id}/cards/{card_id}` | Get single card |
| `DELETE` | `/api/decks/{id}/cards/{card_id}` | Delete card |

### Generate

```
POST /api/generate/
Content-Type: multipart/form-data
```

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | PDF, TXT, DOC, or DOCX file upload |
| `text_content` | String | Or paste text directly |
| `deck_name` | String | Optional: name for new deck |
| `deck_id` | Number | Optional: add cards to existing deck |

Returns: `{ deck_id, cards_generated, cards: [...] }`

### Review

```
GET  /api/decks/{id}/review/session    → Returns due cards
POST /api/decks/{id}/review/{card_id}  → Submit rating
```

Rating field (form data): `rating` = `again` | `hard` | `good` | `easy`

---

## 🗄 Database Schema

### `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `email` | VARCHAR(255) | Unique email used to log in |
| `username` | VARCHAR(100) | Unique display name |
| `hashed_password` | VARCHAR(255) | bcrypt password hash |
| `created_at` | DATETIME | UTC creation time |

### `decks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `user_id` | INTEGER FK | References `users.id` — the owner of the deck |
| `name` | VARCHAR(200) | Deck name |
| `description` | TEXT | Deck description |
| `created_at` | DATETIME | UTC creation time |
| `updated_at` | DATETIME | UTC last update time |

### `flashcards`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `deck_id` | INTEGER FK | References `decks.id` |
| `question` | TEXT | Question text |
| `answer` | TEXT | Answer text (markdown-formatted) |
| `question_image` | TEXT | Base64 image for question side |
| `answer_image` | TEXT | Base64 image for answer side |
| `image_mime` | VARCHAR(20) | Image MIME type (image/png, image/jpeg) |
| `image_page` | INTEGER | Page number the image came from |
| `formula` | TEXT | LaTeX formula string |
| `content_type` | VARCHAR(50) | text, formula, graph, diagram, chart, table, image, mixed |
| `source_page` | INTEGER | Original page number in PDF |
| `ease_factor` | FLOAT | SM-2 easiness factor (≥1.3, default 2.5) |
| `review_count` | INTEGER | Total times reviewed |
| `consecutive_correct` | INTEGER | Consecutive correct answers |
| `interval_days` | INTEGER | Current review interval in days |
| `next_review` | DATETIME | When the card is next due |
| `is_mastered` | BOOLEAN | True when interval ≥ 30 days |
| `last_reviewed` | DATETIME | Last review timestamp |
| `created_at` | DATETIME | When the card was created |

### `review_history`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment ID |
| `card_id` | INTEGER FK | References `flashcards.id` |
| `rating` | VARCHAR(20) | again, hard, good, easy |
| `ease_factor_before` | FLOAT | Ease factor before this review |
| `ease_factor_after` | FLOAT | Ease factor after this review |
| `interval_before` | INTEGER | Interval before this review |
| `interval_after` | INTEGER | Interval after this review |
| `reviewed_at` | DATETIME | When the review happened |

---

## ⚙️ How It Works

### 0. Accounts & Authentication (`auth.py`, `routers/auth.py`)

1. Users sign up with email, username, and password — the password is hashed with **bcrypt** before storing
2. On login, the backend returns a **JWT** signed with `SECRET_KEY` (valid for 7 days)
3. The frontend stores the token in `localStorage` (`studybuddy_token`) and sends it as `Authorization: Bearer <token>` on every API call
4. Every deck/card/review/generate/stats route resolves the user from the token, so users only ever see their own data

### 1. PDF Extraction (`pdf_extractor.py`)

When you upload a PDF, the backend:

1. Opens the PDF with **PyMuPDF** (fitz)
2. **Extracts text** page-by-page, detecting headings (large font sizes)
3. **Extracts images** — skips tiny icons (<2KB), deduplicates by content hash, converts to PNG/JPEG, resizes to max 1024px, classifies as graph/diagram/chart/image
4. **Extracts formulas** — detects math symbols, equation patterns, and math fonts; converts to LaTeX
5. **Extracts tables** — finds tabular structures and extracts row/column data
6. Builds a structured context with `[PAGE X]`, `[IMAGE img_pX_Y]`, `[FORMULA form_pX_Y]` markers

### 2. Flashcard Generation (`gemini_client.py`)

1. For documents >25 pages, splits into **25-page batches**
2. Sends each batch to **Gemini API** with a detailed prompt
3. The prompt instructs Gemini to generate 10-15 flashcards per 5 pages
4. Responses are parsed from JSON with multiple fallback strategies (handles malformed LaTeX backslashes, trailing commas, etc.)
5. Cards are validated — metadata cards (author, copyright, etc.) are filtered out
6. Duplicate cards are deduplicated by normalized question + source page
7. Results are merged across all batches

### 3. Model Fallback

The code tries multiple Gemini models in order:

1. `gemini-3.5-flash` (primary)
2. `gemini-3.5-flash-lite`
3. `gemini-3.1-flash-lite`
4. `gemini-3-flash-preview`
5. `gemini-flash-lite-latest`
6. `gemini-3.6-flash`
7. `gemini-3.7-flash`

If a model returns 404, 403, or 429, it automatically tries the next one. The first working model is cached for subsequent batches.

### 4. Spaced Repetition (`review.py`)

Uses a **modified SM-2 algorithm** with user-friendly intervals:

| Rating | Effect |
|--------|--------|
| 🔴 Again | Re-show in 10 minutes, reduce ease factor |
| 🟠 Hard | Next review in 1 day, reduce ease factor |
| 🟢 Good | Next review in 3→7→(interval × EF) days |
| 🔵 Easy | Next review in 7→14→(interval × EF × 1.3) days |

A card is marked **mastered** when its interval reaches 30+ days.

---

## 🔧 Troubleshooting

### "Failed to extract content" or 500 error

- Make sure `PyMuPDF` and `Pillow` are installed: `pip install PyMuPDF Pillow`
- Check the PDF is not corrupted or password-protected

### Gemini API errors

- **404**: Model not available — the fallback list should handle this automatically
- **403**: Project denied access — enable "Generative Language API" in [Google Cloud Console](https://console.cloud.google.com/apis/dashboard)
- **429**: Quota exceeded — enable billing on your Google Cloud project or wait for quota reset
- **Connection error**: Check your internet connection and API key validity

### Frontend shows "Make sure the backend is running on port 8000"

- Make sure the backend is running: `python main.py`
- Check port 8000 is not blocked by another process

### Large PDF generation times out

- Large PDFs (500+ pages) are processed in 25-page batches with 5-second delays between batches
- Each batch may take 30-60 seconds depending on content
- Each Gemini call times out after 180 seconds; the Next.js `/api` proxy allows up to 10 minutes for the whole request (no more 30s cutoff)

### "401 Not authenticated" / "Invalid token"

- The JWT expires after 7 days — log in again at `/login`
- Make sure API requests include the `Authorization: Bearer <token>` header
- If you just deployed fresh, clear old tokens from `localStorage` and log in again

### Database issues

- The SQLite database (`studybuddy.db`) is auto-created on first run
- Auto-migration adds missing columns to existing databases
- To reset: delete `backend/studybuddy.db` and restart the backend

---

## 📄 License

MIT
