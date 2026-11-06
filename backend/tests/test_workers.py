from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.db.models import Notification, OutboxEvent, User
from app.workers.outbox import process_pending_events


def _leave_type(client, headers) -> str:
    response = client.get("/api/v1/leave/types", headers=headers)
    assert response.status_code == 200
    return next(item["id"] for item in response.json() if item["code"] == "CL")


def test_outbox_worker_creates_deduplicated_in_app_notification(client, login, db):
    employee = login("employee@example.com")
    created = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": "worker-leave-created"},
        json={
            "leave_type_id": _leave_type(client, employee),
            "start_at": "2026-12-14T00:00:00+05:30",
            "end_at": "2026-12-15T00:00:00+05:30",
        },
    )
    assert created.status_code == 201, created.text

    db.expire_all()
    first = process_pending_events(db)
    assert first["processed"] >= 1

    approver = db.scalar(select(User).where(User.email == "approver@example.com"))
    notification = db.scalar(
        select(Notification).where(
            Notification.recipient_user_id == approver.id,
            Notification.template_code == "leave.approval_requested",
        )
    )
    assert notification is not None
    assert notification.status == "sent"
    assert notification.dedupe_key is not None

    db.expire_all()
    second = process_pending_events(db)
    assert second["processed"] == 0
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.recipient_user_id == approver.id,
            Notification.template_code == "leave.approval_requested",
        )
    )
    assert count == 1

    event = db.scalar(
        select(OutboxEvent).where(
            OutboxEvent.event_type == "leave.request.created",
            OutboxEvent.aggregate_id == uuid.UUID(created.json()["id"]),
        )
    )
    assert event is not None and event.status == "published"
