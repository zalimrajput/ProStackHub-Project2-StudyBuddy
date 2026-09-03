from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from database import init_db
from routers import auth, decks, cards, generate, review, stats

MAX_BODY_SIZE = 100 * 1024 * 1024  # 100 MB


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


class RequestBodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.headers.get("content-length"):
            if int(request.headers["content-length"]) > MAX_BODY_SIZE:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large (max 100 MB)"},
                )
        return await call_next(request)


class CloseConnectionMiddleware(BaseHTTPMiddleware):
    """Tell clients not to keep the connection alive.

    The Next.js /api proxy pools keep-alive sockets to this backend and can
    reuse one that uvicorn already closed after its keep-alive timeout,
    which surfaces as 'socket hang up' / ECONNRESET on proxied requests
    (e.g. /api/generate). Closing each connection prevents stale-socket reuse
    entirely — every request gets a fresh connection.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["connection"] = "close"
        return response


app = FastAPI(
    title="StudyBuddy API",
    description="AI-powered flashcard generation with spaced repetition",
    version="1.0.0",
    redirect_slashes=False,
    lifespan=lifespan,
)

app.add_middleware(CloseConnectionMiddleware)
app.add_middleware(RequestBodySizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(decks.router)
app.include_router(cards.router)
app.include_router(generate.router)
app.include_router(review.router)
app.include_router(stats.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "studybuddy-api"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        timeout_keep_alive=300,
    )
