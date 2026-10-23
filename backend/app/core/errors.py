from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger, request_id_ctx

logger = get_logger(__name__)


class AppError(Exception):
    """Domain/API error with a stable machine code and localisable message key."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message_key: str,
        message: str,
        *,
        details: list[dict[str, Any]] | None = None,
        retryable: bool = False,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message_key = message_key
        self.message = message
        self.details = details or []
        self.retryable = retryable
        self.headers = headers or {}


def error_payload(
    code: str,
    message_key: str,
    message: str,
    *,
    details: list[dict[str, Any]] | None = None,
    retryable: bool = False,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message_key": message_key,
            "message": message,
            "details": details or [],
            "request_id": request_id_ctx.get(),
            "retryable": retryable,
        }
    }


def _json_error(
    status_code: int,
    code: str,
    message_key: str,
    message: str,
    *,
    details: list[dict[str, Any]] | None = None,
    retryable: bool = False,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=error_payload(
            code, message_key, message, details=details, retryable=retryable
        ),
        headers=headers,
    )


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return _json_error(
        exc.status_code,
        exc.code,
        exc.message_key,
        exc.message,
        details=exc.details,
        retryable=exc.retryable,
        headers=exc.headers,
    )


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for item in exc.errors():
        field = ".".join(str(part) for part in item.get("loc", []) if part != "body")
        details.append(
            {
                "field": field,
                "code": item.get("type", "invalid"),
                "message_key": "errors.validation",
            }
        )
    return _json_error(
        422,
        "validation_error",
        "errors.validation",
        "One or more fields are invalid.",
        details=details,
    )


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    mapped = {
        401: ("unauthenticated", "errors.unauthenticated"),
        403: ("forbidden", "errors.forbidden"),
        404: ("not_found", "errors.not_found"),
        405: ("method_not_allowed", "errors.method_not_allowed"),
        409: ("conflict", "errors.conflict"),
        429: ("rate_limited", "errors.rate_limited"),
    }.get(exc.status_code, ("http_error", "errors.http_error"))
    return _json_error(
        exc.status_code,
        mapped[0],
        mapped[1],
        str(exc.detail) if exc.detail else "Request failed.",
        headers=exc.headers if hasattr(exc, "headers") else None,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_error", extra={"path": request.url.path})
    return _json_error(
        500,
        "internal_error",
        "errors.internal",
        "An internal error occurred. Contact support with the request ID.",
    )


async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    # Never expose driver details or constraint names; they can disclose schema
    # shape and tenant data. The request ID is sufficient for support correlation.
    logger.warning(
        "database_conflict",
        extra={"path": request.url.path, "event": "database_conflict"},
    )
    return _json_error(
        409,
        "conflict",
        "errors.conflict",
        "The request conflicts with an existing record or business rule.",
    )


# Convenience constructors used by services/routers.
def not_found(resource: str = "resource") -> AppError:
    return AppError(404, "not_found", "errors.not_found", f"{resource.title()} not found.")


def forbidden(message: str = "You do not have access to this resource.") -> AppError:
    return AppError(403, "forbidden", "errors.forbidden", message)


def unauthenticated(message: str = "Authentication is required.") -> AppError:
    return AppError(401, "unauthenticated", "errors.unauthenticated", message)


def conflict(code: str, message: str, message_key: str | None = None) -> AppError:
    return AppError(409, code, message_key or f"errors.{code}", message)


def invalid_state(message: str = "The requested state transition is not allowed.") -> AppError:
    return AppError(409, "invalid_state_transition", "errors.invalid_state", message)


def rate_limited(retry_after: int = 60) -> AppError:
    return AppError(
        429,
        "rate_limited",
        "errors.rate_limited",
        "Too many requests. Retry later.",
        retryable=True,
        headers={"Retry-After": str(retry_after)},
    )
