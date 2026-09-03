# ─────────────────────────────────────────────────────────────────────────────
# StudyBuddy — single-container image (Next.js frontend + FastAPI backend)
# Used for the production deploy on Faable Deploy.
#
# Layout inside the container:
#   :$PORT  (3000)  Next.js standalone server  →  rewrites /api/*  →  :8000
#   :8000  (internal)  uvicorn (FastAPI backend, main:app)
# Data lives in an external PostgreSQL (Supabase) via DATABASE_URL.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the Next.js frontend ─────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Standalone output is only produced when NEXT_STANDALONE=1. It is enabled
# here because this image runs the Next.js standalone server (docker-entrypoint
# starts .next/standalone/server.js). Vercel builds do not set it and get the
# default output instead.
ENV NEXT_STANDALONE=1
RUN npm run build

# ── Stage 2: build the Python backend virtualenv ────────────────────────────
FROM python:3.11-slim AS backend-build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY backend/requirements.txt /build/backend/requirements.txt
RUN pip install --no-cache-dir -r /build/backend/requirements.txt

# ── Stage 3: runtime image ──────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# PyMuPDF (PDF text/image extraction) runtime libraries + tini for signal handling
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        libgl1 \
        libglib2.0-0 \
        tini \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js runtime — copied from the same image family used to build the frontend
# (Debian bookworm, so glibc is compatible with python:3.11-slim)
COPY --from=frontend-build /usr/local/bin/node /usr/local/bin/node

# Python backend: virtualenv + source
ENV PATH="/opt/venv/bin:$PATH"
COPY --from=backend-build /opt/venv /opt/venv
COPY backend/ /app/backend/

# Next.js standalone server (server.js + traced node_modules)
COPY --from=frontend-build /build/frontend/.next/standalone/ /app/frontend/
# Static assets are not traced into the standalone output — copy them manually
COPY --from=frontend-build /build/frontend/.next/static/ /app/frontend/.next/static/

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
