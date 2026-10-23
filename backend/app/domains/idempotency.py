from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, conflict
from app.db.models import IdempotencyKey
from app.domains.identity import Principal


@dataclass(slots=True)
class IdempotencyState:
    record: IdempotencyKey
    replay: bool = False


def _request_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def begin(
    db: Session,
    principal: Principal,
    endpoint: str,
    key: str,
    payload: Any,
) -> IdempotencyState:
    if not key or len(key) > 200:
        raise AppError(
            422,
            "validation_error",
            "errors.idempotency_key",
            "A valid Idempotency-Key header is required.",
            details=[
                {
                    "field": "Idempotency-Key",
                    "code": "required",
                    "message_key": "errors.idempotency_key",
                }
            ],
        )
    scope_key = f"tenant:{principal.tenant_id}" if principal.tenant_id else "public"
    digest = _request_hash(payload)
    now = datetime.now(UTC)
    existing = db.scalar(
        select(IdempotencyKey)
        .where(
            IdempotencyKey.scope_key == scope_key,
            IdempotencyKey.user_id == principal.user_id,
            IdempotencyKey.endpoint == endpoint,
            IdempotencyKey.key == key,
        )
        .with_for_update()
    )
    if existing is not None:
        if existing.expires_at > now:
            if existing.request_hash != digest:
                raise conflict(
                    "idempotency_conflict",
                    "This Idempotency-Key was already used with a different payload.",
                )
            if existing.status == "completed":
                return IdempotencyState(record=existing, replay=True)
            raise AppError(
                425,
                "operation_in_progress",
                "errors.operation_in_progress",
                "This operation is still in progress. Retry shortly.",
                retryable=True,
                headers={"Retry-After": "2"},
            )
        existing.request_hash = digest
        existing.status = "in_progress"
        existing.response_status = None
        existing.response_body = None
        existing.resource_type = None
        existing.resource_id = None
        existing.created_at = now
        existing.expires_at = now + timedelta(hours=settings.idempotency_ttl_hours)
        db.add(existing)
        db.flush()
        return IdempotencyState(record=existing)

    record = IdempotencyKey(
        scope_key=scope_key,
        tenant_id=principal.tenant_id,
        user_id=principal.user_id,
        endpoint=endpoint,
        key=key,
        request_hash=digest,
        status="in_progress",
        created_at=now,
        expires_at=now + timedelta(hours=settings.idempotency_ttl_hours),
    )
    db.add(record)
    db.flush()
    return IdempotencyState(record=record)


def complete(
    db: Session,
    state: IdempotencyState,
    *,
    status_code: int,
    body: dict[str, Any],
    resource_type: str,
    resource_id: uuid.UUID,
) -> None:
    record = state.record
    record.status = "completed"
    record.response_status = status_code
    record.response_body = body
    record.resource_type = resource_type
    record.resource_id = resource_id
    db.add(record)
