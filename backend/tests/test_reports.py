from __future__ import annotations

import uuid

from sqlalchemy import select

from app.db.models import AuditEvent, OutboxEvent


def test_report_export_uses_outbox_and_audits_access(client, login, db):
    headers = login("hr@example.com")
    response = client.post(
        "/api/v1/reports/hr/exports",
        headers={**headers, "Idempotency-Key": "report-export-outbox"},
        json={
            "report_type": "hr_summary",
            "fields": ["leave_request_id", "status"],
        },
    )
    assert response.status_code == 202, response.text
    export_id = uuid.UUID(response.json()["id"])

    db.expire_all()
    event = db.scalar(
        select(OutboxEvent).where(
            OutboxEvent.aggregate_type == "report_export",
            OutboxEvent.aggregate_id == export_id,
            OutboxEvent.event_type == "report.export.requested",
        )
    )
    assert event is not None
    assert event.status == "pending"

    accessed = client.get(f"/api/v1/reports/exports/{export_id}", headers=headers)
    assert accessed.status_code == 200, accessed.text

    db.expire_all()
    audit = db.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "report.export.accessed",
            AuditEvent.target_id == export_id,
        )
    )
    assert audit is not None
    assert audit.metadata_json == {"status": "queued"}
