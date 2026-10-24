from __future__ import annotations

import re
import threading
import time
import uuid
from collections import Counter
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    error_payload,
    http_error_handler,
    integrity_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.core.logging import configure_logging, get_logger, request_id_ctx
from app.db.session import SessionLocal

configure_logging(settings.debug)
logger = get_logger(__name__)

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")
_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

_metrics_lock = threading.Lock()
_metrics_started_at = time.time()
_metrics_requests: Counter[tuple[str, str, int]] = Counter()
_metrics_total = 0


def _metric_path(path: str) -> str:
    """Bound metric cardinality by replacing identifiers with placeholders."""
    normalized = _UUID_RE.sub("{id}", path)
    return normalized if len(normalized) <= 120 else normalized[:120]


def record_request_metric(method: str, path: str, status_code: int) -> None:
    global _metrics_total
    with _metrics_lock:
        _metrics_total += 1
        _metrics_requests[(method, _metric_path(path), status_code)] += 1


def metrics_snapshot() -> dict:
    with _metrics_lock:
        total = _metrics_total
        rows = [
            {"method": method, "path": path, "status": status, "count": count}
            for (method, path, status), count in sorted(_metrics_requests.items())
        ]
    return {
        "uptime_seconds": round(time.time() - _metrics_started_at, 2),
        "requests_total": total,
        "requests": rows,
    }



@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info(
        "application_started",
        extra={"event": "startup", "method": "-", "path": "-"},
    )
    yield
    logger.info("application_stopped", extra={"event": "shutdown"})


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("x-request-id")
        request_id = (
            incoming
            if incoming and _REQUEST_ID_RE.fullmatch(incoming)
            else uuid.uuid4().hex
        )
        token = request_id_ctx.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            response.headers["X-Request-Id"] = request_id
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["Permissions-Policy"] = (
                "camera=(), microphone=(), geolocation=()"
            )
            public_cacheable = (
                request.method == "GET"
                and (
                    request.url.path.startswith("/api/v1/career/")
                    or request.url.path.startswith("/api/v1/courses")
                    or request.url.path.startswith("/api/v1/mock-tests")
                )
            )
            if public_cacheable:
                response.headers.setdefault("Cache-Control", "public, max-age=60")
            else:
                response.headers.setdefault("Cache-Control", "no-store")
            if request.url.path.startswith("/api/v1"):
                response.headers.setdefault(
                    "Content-Language", settings.default_locale
                )
            logger.info(
                "request_completed",
                extra={
                    "event": "request",
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                },
            )
            record_request_metric(
                request.method, request.url.path, response.status_code
            )
            return response
        finally:
            request_id_ctx.reset(token)


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "HR Assistant API. Deny-by-default, permission-based authorization with "
        "tenant-scoped data. Browser clients should use secure, HttpOnly cookies "
        "at the deployment edge; bearer tokens are supported for API clients. "
        "Employment decisions remain human-in-the-loop."
    ),
    docs_url="/docs" if settings.debug or not settings.is_production else None,
    redoc_url="/redoc" if settings.debug or not settings.is_production else None,
    openapi_url="/openapi.json" if settings.debug or not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept-Language",
        "X-Tenant-ID",
        "X-Request-ID",
        "Idempotency-Key",
        "If-Match",
    ],
    expose_headers=["X-Request-Id", "Retry-After", "ETag", "Content-Language"],
    max_age=600,
)
if settings.trusted_host_list:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_host_list)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(IntegrityError, integrity_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
def readyz() -> JSONResponse:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        logger.exception("readiness_failed")
        return JSONResponse(
            status_code=503,
            content=error_payload(
                "dependency_unavailable",
                "errors.dependency_unavailable",
                "A required dependency is unavailable.",
                retryable=True,
            ),
        )
    return JSONResponse(status_code=200, content={"status": "ready"})


@app.get("/metrics", include_in_schema=False)
def metrics() -> JSONResponse:
    if settings.is_production and not settings.metrics_enabled:
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    return JSONResponse(status_code=200, content=metrics_snapshot())
