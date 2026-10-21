"""
ExamProctor.ai — Main FastAPI application entry point.
"""

from contextlib import asynccontextmanager
import uuid

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError

from app.core.config import settings
from app.core.errors import (
    AppError, app_error_handler,
    http_exception_handler, validation_exception_handler,
)
from app.api.v1 import (
    auth, users, exams, questions, attempts, sync, snapshots, monitoring,
    reports, retakes, settings as settings_router, video_analysis,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    # Ensure storage directory exists
    from pathlib import Path
    Path(settings.SNAPSHOT_LOCAL_DIR).mkdir(parents=True, exist_ok=True)
    yield
    # Cleanup on shutdown


app = FastAPI(
    title="ExamProctor.ai",
    description="AI-powered examination management and computer-vision proctoring platform.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV == "development" else None,
    redoc_url="/api/redoc" if settings.APP_ENV == "development" else None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────────────────────
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

# ── API routers ───────────────────────────────────────────────────────────────
PREFIX = "/api/v1"

app.include_router(auth.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(exams.router, prefix=PREFIX)
app.include_router(questions.router, prefix=PREFIX)
app.include_router(attempts.router, prefix=PREFIX)
app.include_router(sync.router, prefix=PREFIX)
app.include_router(snapshots.router, prefix=PREFIX)
app.include_router(monitoring.router, prefix=PREFIX)
app.include_router(reports.router, prefix=PREFIX)
app.include_router(retakes.router, prefix=PREFIX)
app.include_router(settings_router.router, prefix=PREFIX)
app.include_router(video_analysis.router, prefix=PREFIX)


# ── Health / readiness ────────────────────────────────────────────────────────

@app.get("/api/v1/health", tags=["health"])
async def health():
    return {"status": "ok"}


@app.get("/api/v1/ready", tags=["health"])
async def ready():
    from app.db.session import engine
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_status = "available"
    except Exception:
        db_status = "unavailable"

    status_code = 200 if db_status == "available" else 503
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=status_code,
        content={"status": "ready" if db_status == "available" else "not_ready",
                 "dependencies": {"database": db_status}},
    )


# ── Root redirect ─────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/api/docs")
