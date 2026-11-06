"""Transactional-outbox relay and in-app notification generation.

The API writes domain events to ``outbox_events`` in the same transaction as
the business change. This worker claims pending events with
``FOR UPDATE SKIP LOCKED``, creates localized, deduplicated in-app
notifications, and records delivery state. Unsupported event types are left
pending for their owning worker rather than being marked published.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import (
    EmployeeProfile,
    Notification,
    NotificationPreference,
    NotificationTemplate,
    OutboxEvent,
    User,
)

logger = get_logger(__name__)

MAX_ATTEMPTS = 5
# Report exports are completed by the dedicated export worker
# (app/workers.report_exports), which also closes the deferred outbox events
# once the export reaches a terminal state. The relay must not consume them.
DEFERRED_EVENT_TYPES = {"report.export.requested"}


def _template(
    db: Session, code: str, locale: str
) -> NotificationTemplate | None:
    for candidate in (locale, "en"):
        template = db.scalar(
            select(NotificationTemplate)
            .where(
                NotificationTemplate.code == code,
                NotificationTemplate.locale == candidate,
                NotificationTemplate.review_status == "approved",
            )
            .order_by(NotificationTemplate.version.desc())
            .limit(1)
        )
        if template is not None:
            return template
    return None


def _render(value: str, context: dict[str, Any]) -> str:
    for key, replacement in context.items():
        value = value.replace("{{" + key + "}}", str(replacement))
    return value


def _notify(
    db: Session,
    *,
    tenant_id: uuid.UUID | None,
    recipient_user_id: uuid.UUID | None,
    template_code: str,
    dedupe_key: str,
    context: dict[str, Any] | None = None,
) -> bool:
    if recipient_user_id is None:
        return False
    preference = db.scalar(
        select(NotificationPreference).where(
            NotificationPreference.user_id == recipient_user_id,
            NotificationPreference.channel == "in_app",
        )
    )
    if preference is not None and not preference.enabled:
        return False
    existing = db.scalar(
        select(Notification.id).where(
            Notification.recipient_user_id == recipient_user_id,
            Notification.dedupe_key == dedupe_key,
        )
    )
    if existing is not None:
        return False
    user = db.get(User, recipient_user_id)
    if user is None or user.status != "active":
        return False
    template = _template(db, template_code, user.locale or "en")
    if template is None:
        logger.warning(
            "notification_template_missing",
            extra={"event": "notification", "code": template_code},
        )
        return False
    now = datetime.now(UTC)
    db.add(
        Notification(
            tenant_id=tenant_id,
            recipient_user_id=recipient_user_id,
            channel="in_app",
            template_code=template.code,
            locale=template.locale,
            subject=_render(template.subject, context or {}),
            body=_render(template.body, context or {}),
            status="sent",
            dedupe_key=dedupe_key[:200],
            sent_at=now,
            created_at=now,
        )
    )
    return True


def _employee_user_id(db: Session, employee_id: str | None) -> uuid.UUID | None:
    if not employee_id:
        return None
    try:
        employee = db.get(EmployeeProfile, uuid.UUID(employee_id))
    except (TypeError, ValueError):
        return None
    return employee.user_id if employee else None


def _handle_event(db: Session, event: OutboxEvent) -> bool:
    """Create notifications for one event. Returns True if handled."""

    payload = event.payload or {}
    dedupe = f"outbox:{event.id}"
    event_type = event.event_type
    if event_type == "leave.request.created":
        approver = payload.get("approver_user_id")
        return _notify(
            db,
            tenant_id=event.tenant_id,
            recipient_user_id=uuid.UUID(approver) if approver else None,
            template_code="leave.approval_requested",
            dedupe_key=f"{dedupe}:approver",
        )
    if event_type == "leave.request.decided":
        employee_user_id = _employee_user_id(db, payload.get("employee_id"))
        return _notify(
            db,
            tenant_id=event.tenant_id,
            recipient_user_id=employee_user_id,
            template_code="leave.status_changed",
            dedupe_key=f"{dedupe}:employee",
            context={"status": payload.get("decision", "updated")},
        )
    if event_type == "service_request.updated":
        requester = payload.get("requester_user_id")
        return _notify(
            db,
            tenant_id=event.tenant_id,
            recipient_user_id=uuid.UUID(requester) if requester else None,
            template_code="service_request.status_changed",
            dedupe_key=f"{dedupe}:requester",
            context={"status": payload.get("status", "updated")},
        )
    if event_type == "onboarding.case.created":
        employee = payload.get("employee_user_id")
        return _notify(
            db,
            tenant_id=event.tenant_id,
            recipient_user_id=uuid.UUID(employee) if employee else None,
            template_code="onboarding.case_created",
            dedupe_key=f"{dedupe}:employee",
        )
    if event_type == "interview.scheduled":
        handled = False
        for participant in payload.get("participant_user_ids") or []:
            try:
                user_id = uuid.UUID(participant)
            except (TypeError, ValueError):
                continue
            handled = (
                _notify(
                    db,
                    tenant_id=event.tenant_id,
                    recipient_user_id=user_id,
                    template_code="interview.scheduled",
                    dedupe_key=f"{dedupe}:{user_id}",
                )
                or handled
            )
        return handled
    # No notification recipient is defined, but the event itself is consumed.
    return True


def process_pending_events(db: Session, limit: int = 50) -> dict[str, int]:
    """Claim and process one batch of outbox events."""

    now = datetime.now(UTC)
    events = list(
        db.scalars(
            select(OutboxEvent)
            .where(
                OutboxEvent.status == "pending",
                OutboxEvent.available_at <= now,
            )
            .order_by(OutboxEvent.created_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    processed = 0
    deferred = 0
    failed = 0
    for event in events:
        if event.event_type in DEFERRED_EVENT_TYPES:
            deferred += 1
            continue
        try:
            _handle_event(db, event)
            event.status = "published"
            event.published_at = now
            processed += 1
        except Exception:
            failed += 1
            event.attempts += 1
            if event.attempts >= MAX_ATTEMPTS:
                event.status = "dead_letter"
            else:
                event.available_at = now + timedelta(
                    seconds=min(3600, 30 * (2 ** (event.attempts - 1)))
                )
            logger.exception(
                "outbox_event_failed",
                extra={"event": "outbox", "code": event.event_type},
            )
        db.flush()
    db.commit()
    return {
        "processed": processed,
        "deferred": deferred,
        "failed": failed,
        "claimed": len(events),
    }


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        result = process_pending_events(db)
    logger.info("outbox_batch_complete", extra={"event": "outbox", **result})
    print(result)


if __name__ == "__main__":
    main()
