#!/bin/sh
# StudyBuddy container entrypoint.
# - FastAPI backend  → 0.0.0.0:8000 (internal, reached via Next.js rewrites)
# - Next.js frontend → 0.0.0.0:$PORT (the port Faable routes traffic to)
#
# If either process exits, the container exits so the platform restarts it.

set -e

PORT="${PORT:-3000}"

echo "[entrypoint] Starting StudyBuddy backend (uvicorn) on :8000 ..."
cd /app/backend
# --timeout-keep-alive 300 keeps backend connections alive so the Next.js
# /api proxy never picks up a stale socket (uvicorn's 5s default caused
# 'socket hang up' / ECONNRESET on requests arriving after a pause).
/opt/venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 300 &
BACKEND_PID=$!

echo "[entrypoint] Starting StudyBuddy frontend (Next.js standalone) on :${PORT} ..."
cd /app/frontend
PORT="${PORT}" node server.js &
FRONTEND_PID=$!

# Stop everything cleanly on SIGTERM/SIGINT (Faable sends SIGTERM on release/stop)
trap 'kill -TERM ${BACKEND_PID} ${FRONTEND_PID} 2>/dev/null || true' INT TERM

# Exit if either process dies so the platform restarts the container
while kill -0 "${BACKEND_PID}" 2>/dev/null && kill -0 "${FRONTEND_PID}" 2>/dev/null; do
    sleep 2
done

echo "[entrypoint] A process exited — shutting down container."
kill -TERM "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
wait
exit 1
