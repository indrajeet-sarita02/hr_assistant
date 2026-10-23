from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.logging import request_id_ctx
from app.db.models import AuditEvent, OutboxEvent
from app.domains.identity import Principal


def write_audit(
    db: Session,
    principal: Principal | None,
    action: str,
    *,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    outcome: str = "success",
    metadata: dict[str, Any] | None = None,
    actor_type: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        tenant_id=principal.tenant_id if principal else None,
        actor_user_id=principal.user_id if principal else None,
        actor_type=actor_type or ("user" if principal else "system"),
        action=action,
        target_type=target_type,
        target_id=target_id,
        outcome=outcome,
        correlation_id=request_id_ctx.get(),
        request_id=request_id_ctx.get(),
        metadata_json=metadata or {},
        occurred_at=datetime.now(UTC),
    )
    db.add(event)
    return event


def write_outbox(
    db: Session,
    tenant_id: uuid.UUID | None,
    event_type: str,
    aggregate_type: str,
    aggregate_id: uuid.UUID,
    payload: dict[str, Any] | None = None,
) -> OutboxEvent:
    event = OutboxEvent(
        tenant_id=tenant_id,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload or {},
        status="pending",
        attempts=0,
        available_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db.add(event)
    return event
