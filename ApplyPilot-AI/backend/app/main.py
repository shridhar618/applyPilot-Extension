import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.api.v1.health import router as health_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import setup_logging

log = logging.getLogger("applypilot")


def create_app() -> FastAPI:
    setup_logging()
    s = get_settings()
    app = FastAPI(title="ApplyPilot AI API", version="0.1.0", docs_url=None if s.env == "production" else "/docs", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_origin_regex=s.cors_origin_regex,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"],
                       allow_credentials=False)  # bearer tokens, not cookies -> no credentialed CORS needed

    @app.middleware("http")
    async def request_log(request: Request, call_next):
        rid, start = uuid.uuid4().hex[:12], time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"  # responses contain private career data
        log.info("request", extra={"request_id": rid, "method": request.method, "path": request.url.path,
                                   "status": response.status_code, "duration_ms": round((time.perf_counter() - start) * 1000, 1)})
        return response

    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
