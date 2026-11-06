"""Report export processor.

Export requests are created with ``status="queued"`` plus a transactional
``report.export.requested`` outbox event (``app/api/v1/reports.py``). This
worker claims queued, tenant-scoped exports with ``FOR UPDATE SKIP LOCKED``,
generates the CSV honoring the ``ALLOWED_REPORT_FIELDS`` allowlist, and marks
the export ``ready`` with an artifact reference and expiry. The default
``local_metadata`` object-storage adapter stores no bytes, so the artifact is
represented by its storage key plus checksum/row-count metadata; a real
deployment swaps in an adapter that persists the bytes privately.

Outbox events for this type are deferred by the notification relay
(``DEFERRED_EVENT_TYPES``) and completed here once the export reaches a
terminal state, including the failure path.
"""

from __future__ import annotations

import csv
import hashlib
import io
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.v1.reports import ALLOWED_REPORT_FIELDS
from app.core.config import settings
from app.core.logging import get_logger, tenant_id_ctx
from app.db.models import (
    HRServiceRequest,
    LeaveRequest,
    LeaveType,
    OutboxEvent,
    ReportExport,
)
from app.db.session import set_tenant_context
from app.domains.audit import write_audit

logger = get_logger(__name__)

# Bounded batch, per §10.3: workers use bounded concurrency and are safe to
# run twice.
BATCH_SIZE = 10
MAX_EXPORT_ROWS = 10_000
# Artifact lifetime mirror of the signed-download window; expired exports are
# cleaned up by report type retention rather than being downloadable forever.
EXPORT_TTL_HOURS = 24


def _filter_values(filters: dict, key: str) -> list[str] | None:
    """Normalise a scalar-or-list filter into a validated list."""

    value = filters.get(key)
    if value is None:
        return None
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return None
    return value


def _leave_rows(
    db: Session, tenant_id: uuid.UUID, export: ReportExport
) -> list[dict[str, str]]:
    filters = export.filters or {}
    stmt = (
        select(LeaveRequest, LeaveType.code)
        .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
        .where(LeaveRequest.tenant_id == tenant_id)
    )
    statuses = _filter_values(filters, "status")
    if statuses:
        stmt = stmt.where(LeaveRequest.status.in_(statuses))
    employee_ids = _filter_values(filters, "employee_id")
    if employee_ids:
        parsed = [uuid.UUID(item) for item in employee_ids]
        stmt = stmt.where(LeaveRequest.employee_id.in_(parsed))

    rows: list[dict[str, str]] = []
    for leave, leave_type in db.execute(stmt.limit(MAX_EXPORT_ROWS)):
        rows.append(
            {
                "leave_request_id": str(leave.id),
                "employee_id": str(leave.employee_id),
                "leave_type": leave_type,
                "status": leave.status,
                "start_at": leave.start_at.isoformat() if leave.start_at else "",
                "end_at": leave.end_at.isoformat() if leave.end_at else "",
            }
        )
    return rows


def _service_rows(
    db: Session, tenant_id: uuid.UUID, export: ReportExport
) -> list[dict[str, str]]:
    filters = export.filters or {}
    stmt = select(HRServiceRequest).where(HRServiceRequest.tenant_id == tenant_id)
    statuses = _filter_values(filters, "status")
    if statuses:
        stmt = stmt.where(HRServiceRequest.status.in_(statuses))
    rows = []
    for item in db.scalars(stmt.limit(MAX_EXPORT_ROWS)):
        rows.append(
            {
                "request_id": str(item.id),
                "subject": item.subject,
                "priority": item.priority,
                "status": item.status,
                "sla_due_at": item.sla_due_at.isoformat() if item.sla_due_at else "",
                "assignee_user_id": (
                    str(item.assignee_user_id) if item.assignee_user_id else ""
                ),
            }
        )
    return rows


def _generate_csv(
    db: Session, export: ReportExport
) -> tuple[list[str], list[dict[str, str]]]:
    """Build the CSV body honoring the per-report field allowlist.

    Only allowlisted *and* requested fields are emitted (data minimization,
    §8.7); an empty ``requested_fields`` defaults to the full allowlist so a
    generic export request does not silently produce empty columns.
    """

    allowed = sorted(ALLOWED_REPORT_FIELDS[export.report_type])
    requested = sorted(set(export.requested_fields or []) & set(allowed))
    fields = requested or allowed
    if export.report_type == "hr_summary":
        rows = _leave_rows(db, export.tenant_id, export)
    elif export.report_type == "service_queue":
        rows = _service_rows(db, export.tenant_id, export)
    else:  # pragma: no cover - guarded at request time by the router
        rows = []
    return fields, rows


def _close_export_outbox_events(export_id: uuid.UUID):
    """Update shape completing the deferred outbox events for one export."""

    return (
        update(OutboxEvent)
        .where(
            OutboxEvent.event_type == "report.export.requested",
            OutboxEvent.aggregate_id == export_id,
            OutboxEvent.status == "pending",
        )
        .values(
            status="published",
            published_at=datetime.now(UTC),
        )
    )


def _process_export(db: Session, export: ReportExport) -> None:
    """Generate and mark one export in the caller's transaction.

    The outbox relay defers ``report.export.requested`` to this worker;
    completing those events here closes the loop idempotently (pending-only).
    """

    if export.report_type not in ALLOWED_REPORT_FIELDS:
        raise ValueError("unknown report_type")
    fields, rows = _generate_csv(db, export)
    if len(rows) >= MAX_EXPORT_ROWS:
        logger.warning(
            "report_export_row_limit_reached",
            extra={"event": "report_export", "export_id": str(export.id)},
        )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(fields)
    writer.writerows([row.get(field, "") for field in fields] for row in rows)
    body = buffer.getvalue()
    now = datetime.now(UTC)
    export.status = "ready"
    export.storage_key = f"{settings.object_storage_provider}://{export.id}.csv"
    export.expires_at = now + timedelta(hours=EXPORT_TTL_HOURS)
    export.completed_at = now
    event = write_audit(
        db,
        None,
        "report.export.completed",
        target_type="report_export",
        target_id=export.id,
        actor_type="system",
        metadata={
            "report_type": export.report_type,
            "row_count": len(rows),
            "field_count": len(fields),
            "checksum": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        },
    )
    event.tenant_id = export.tenant_id
    db.execute(_close_export_outbox_events(export.id))


def process_pending_exports(db: Session, limit: int = BATCH_SIZE) -> dict[str, int]:
    """Claim and process one bounded batch of queued exports."""

    exports = list(
        db.scalars(
            select(ReportExport)
            .where(ReportExport.status == "queued")
            .order_by(ReportExport.created_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    ready = 0
    failed = 0
    for export in exports:
        tenant_id_ctx.set(str(export.tenant_id))
        set_tenant_context(db, export.tenant_id)
        try:
            _process_export(db, export)
        except Exception:
            # A database-level error aborts the transaction; complete the
            # failure path in a fresh one so the export cannot loop as
            # queued forever and later exports stay processable.
            db.rollback()
            failed += 1
            logger.exception(
                "report_export_failed",
                extra={"event": "report_export", "export_id": str(export.id)},
            )
            try:
                item = db.get(ReportExport, export.id)
                if item is not None:
                    item.status = "failed"
                    item.error_code = "export_generation_failed"
                    item.completed_at = datetime.now(UTC)
                    write_audit(
                        db,
                        None,
                        "report.export.failed",
                        target_type="report_export",
                        target_id=item.id,
                        actor_type="system",
                        outcome="failure",
                        metadata={"report_type": item.report_type},
                    ).tenant_id = item.tenant_id
                    db.execute(
                        _close_export_outbox_events(item.id)
                    )
                    db.commit()
            except Exception:
                db.rollback()
        else:
            if export.status == "ready":
                ready += 1
            db.commit()
        finally:
            tenant_id_ctx.set("-")
    return {"claimed": len(exports), "ready": ready, "failed": failed}


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        result = process_pending_exports(db)
    print(result)


if __name__ == "__main__":
    main()
