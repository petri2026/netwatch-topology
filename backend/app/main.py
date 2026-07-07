"""
Netwatch — FastAPI application entry point.

Run in development:
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Run in production:
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
"""

from __future__ import annotations

import logging
import logging.config
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.routers.switches import router as switches_router

# ── Logging ───────────────────────────────────────────────────────────────

logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            "datefmt": "%H:%M:%S",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "netwatch": {"level": "DEBUG" if settings.is_development else "INFO"},
        "scrapli":  {"level": "WARNING"},
        "asyncssh": {"level": "WARNING"},
    },
})


# ── Lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger = logging.getLogger("netwatch")
    logger.info(
        "Netwatch starting — env=%s, max_sessions=%d",
        settings.app_env,
        settings.max_concurrent_sessions,
    )
    yield
    logger.info("Netwatch shutdown complete.")


# ── App factory ───────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="Netwatch",
        summary="Real-time network data collection from Cisco IOS / Allen-Bradley Stratix switches",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Exception handlers
    register_exception_handlers(app)

    # Routers
    app.include_router(switches_router)

    # Serve the frontend SPA
    frontend_dir = Path(__file__).parent.parent / "frontend"
    if frontend_dir.exists():
        app.mount(
            "/static",
            StaticFiles(directory=str(frontend_dir / "static")),
            name="static",
        )

        @app.get("/", response_class=HTMLResponse, include_in_schema=False)
        async def serve_index():
            index_path = frontend_dir / "index.html"
            if index_path.exists():
                return FileResponse(str(index_path))
            return HTMLResponse("<h1>Netwatch</h1><p>Frontend not built.</p>")

    # Health check
    @app.get("/api/health", tags=["system"])
    async def health():
        return {"status": "ok", "env": settings.app_env}

    return app


app = create_app()
