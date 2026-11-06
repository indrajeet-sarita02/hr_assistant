"""Reminder/escalation scan worker (FR-012, FR-021, §8.10, §10.3).

``ReminderRule`` rows are tenant-scoped CRUD configuration
(``app/api/v1/workflow_admin.py``) but nothing ever materialised a
``ReminderInstance``. This scan job walks per-tenant rules and creates the
reminder instances for approaching due dates/SLA deadlines:

- ``leave_request``: pending / needs-clarification requests approaching the
  manager approval due date (the leave ``start_at`` is the effective due
  moment; the rule ``offset_hours`` is the advance notice window).
- ``onboarding_task``: open tasks (in_progress / blocked / not_started) with
  a non-null ``due_at`` inside the reminder window.
- ``service_request``: open/in-progress/waiting requests approaching their
  catalog-driven ``sla_due_at``.

The legacy ``ReminderRule.entity_type`` column is free-form text (it predates
the job catalogue), so the enumerations this job supports are declared here
and anything else is skipped and logged — no guessed event types.

Idempotency: one instance per rule/target/occurrence. ``dedupe_key`` is
``reminder:{rule_id}:{target_id}:{occurrence}`` and the unique column
constraint makes rerun double-inserts impossible; the occurrence count is
also derived from existing instances so repeats honor ``repeat_interval_hours``
and ``max_repeats``.

Delivery: instances are created ``scheduled``; the notification relay owns
actual sending (§8.10 — domain event → template → channel → provider). The
scan never sends directly.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger, tenant_id_ctx
from app.db.models import (
    EmployeeProfile,
    HRServiceRequest,
    LeaveRequest,
    OnboardingTask,
    ReminderInstance,
    ReminderRule,
)
from app.db.session import set_tenant_context
from app.domains.audit import write_audit

logger = get_logger(__name__)

BATCH_SIZE = 200

# Entity types handled by this scan job; anything else is skipped loudly so a
# mis-typed rule never silently generates nothing.
SUPPORTED_ENTITY_TYPES = frozenset({"leave_request", "onboarding_task", "service_request"})

_LEAVE_STATUSES = ("pending", "needs_clarification")
_TASK_STATUSES = ("not_started", "in_progress", "blocked")
_SERVICE_STATUSES = ("open", "in_progress", "waiting_on_requester")

# Recipient roles a rule's ``recipients`` JSONB may name; events the rule
# extras (for example escalation) are a future job concern.
_RECIPIENT_MODES = frozenset({"approver", "employee", "owner", "assignee", "requester"})


def _base(run_id: str) -> str:
    return f"reminder:{run_id}"


def _resolve_recipients(rule: ReminderRule, candidates: dict[str, uuid.UUID | None]) -> list[uuid.UUID]:
    """Resolve rule recipients to user IDs.

    ``recipients`` JSONB supports named roles (``approver``, ``employee``,
    ``owner``, ``assignee``, ``requester``) and explicit ``user_ids``. An
    empty dict defaults to every applicable role for the entity.
    """

    configured = rule.recipients or {}
    allowed_modes = set(configured) & _RECIPIENT_MODES
    if not allowed_modes and not configured.get("user_ids"):
        allowed_modes = {
            mode for mode, value in candidates.items() if value is not None
        }
    resolved: list[uuid.UUID] = []
    for mode in allowed_modes:
        if candidates.get(mode) is not None:
            resolved.append(candidates[mode])
    user_ids = configured.get("user_ids") or []
    if isinstance(user_ids, list):
        for value in user_ids:
            try:
                resolved.append(uuid.UUID(str(value)))
            except (TypeError, ValueError):
                continue
    # Order-preserving dedupe.
    seen: set[uuid.UUID] = set()
    unique = []
    for value in resolved:
        if value not in seen:
            seen.add(value)
            unique.append(value)
    return unique


def _count_instances(
    db: Session, rule_id: uuid.UUID, target_id: uuid.UUID
) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(ReminderInstance)
            .where(
                ReminderInstance.rule_id == rule_id,
                ReminderInstance.target_id == target_id,
            )
        )
        or 0
    )


def _create_instances(
    db: Session,
    rule: ReminderRule,
    entity_type: str,
    target_id: uuid.UUID,
    due_at: datetime,
    recipients: list[uuid.UUID],
    counts: dict[str, int],
) -> None:
    now = datetime.now(UTC)
    base = due_at - timedelta(hours=rule.offset_hours)
    if rule.max_repeats <= 0 or not recipients:
        return
    existing = _count_instances(db, rule.id, target_id)
    interval = rule.repeat_interval_hours or (4 * 30 * 24)
    while existing < rule.max_repeats:
        occurrence = existing
        scheduled_at = base + timedelta(hours=interval) * occurrence
        if scheduled_at > now:
            break  # the next occurrence is not due yet
        if scheduled_at < now:
            scheduled_at = now  # overdue reminder fires as soon as possible
        if scheduled_at > due_at:
            break  # the deadline passed; escalation is a separate concern
        for recipient in recipients:
            dedupe_key = f"{_base(str(rule.id))}:{target_id}:{occurrence}:{recipient}"
            exists = db.scalar(
                select(ReminderInstance.id).where(
                    ReminderInstance.dedupe_key == dedupe_key
                )
            )
            if exists is not None:
                continue
            db.add(
                ReminderInstance(
                    tenant_id=rule.tenant_id,
                    rule_id=rule.id,
                    target_type=entity_type,
                    target_id=target_id,
                    dedupe_key=dedupe_key,
                    status="scheduled",
                    scheduled_at=scheduled_at,
                )
            )
            counts["created"] += 1
        existing += 1


def _scan_leave_requests(
    db: Session, rule: ReminderRule, now: datetime, counts: dict[str, int]
) -> None:
    rows = db.execute(
        select(LeaveRequest, EmployeeProfile.user_id)
        .join(EmployeeProfile, EmployeeProfile.id == LeaveRequest.employee_id)
        .where(
            LeaveRequest.tenant_id == rule.tenant_id,
            LeaveRequest.status.in_(_LEAVE_STATUSES),
        )
        .limit(BATCH_SIZE)
    ).all()
    for leave, employee_user_id in rows:
        if leave.start_at is None or leave.start_at <= now:
            continue
        recipients = _resolve_recipients(
            rule,
            {
                "approver": leave.current_approver_user_id,
                "employee": employee_user_id,
            },
        )
        if not recipients:
            continue
        _create_instances(
            db, rule, "leave_request", leave.id, leave.start_at, recipients, counts
        )


def _scan_onboarding_tasks(
    db: Session, rule: ReminderRule, now: datetime, counts: dict[str, int]
) -> None:
    tasks = db.scalars(
        select(OnboardingTask)
        .where(
            OnboardingTask.tenant_id == rule.tenant_id,
            OnboardingTask.status.in_(_TASK_STATUSES),
            OnboardingTask.due_at.is_not(None),
        )
        .limit(BATCH_SIZE)
    )
    for task in tasks:
        if task.due_at is None or task.due_at <= now:
            continue
        recipients = _resolve_recipients(rule, {"owner": task.owner_user_id})
        if not recipients:
            continue
        _create_instances(
            db, rule, "onboarding_task", task.id, task.due_at, recipients, counts
        )


def _scan_service_requests(
    db: Session, rule: ReminderRule, now: datetime, counts: dict[str, int]
) -> None:
    requests = db.scalars(
        select(HRServiceRequest)
        .where(
            HRServiceRequest.tenant_id == rule.tenant_id,
            HRServiceRequest.status.in_(_SERVICE_STATUSES),
        )
        .limit(BATCH_SIZE)
    )
    for item in requests:
        if item.sla_due_at <= now:
            continue
        recipients = _resolve_recipients(
            rule,
            {
                "assignee": item.assignee_user_id,
                "requester": item.requester_user_id,
            },
        )
        if not recipients:
            continue
        _create_instances(
            db,
            rule,
            "service_request",
            item.id,
            item.sla_due_at,
            recipients,
            counts,
        )


def scan_reminders_for_tenant(db: Session, tenant_id: uuid.UUID) -> dict[str, int]:
    """Create reminder instances for every applicable tenant rule (one
    transaction per tenant so the RLS context stays consistent)."""

    counts = {"created": 0, "skipped_rules": 0}
    rules = list(
        db.scalars(
            select(ReminderRule).where(
                ReminderRule.tenant_id == tenant_id,
                ReminderRule.active.is_(True),
                ReminderRule.effective_from <= date.today(),
            )
        )
    )
    for rule in rules:
        if rule.entity_type not in SUPPORTED_ENTITY_TYPES:
            counts["skipped_rules"] += 1
            logger.warning(
                "reminder_rule_entity_type_unsupported",
                extra={
                    "event": "reminders",
                    "rule_id": str(rule.id),
                    "entity_type": rule.entity_type,
                },
            )
            continue
        if rule.entity_type == "leave_request":
            _scan_leave_requests(db, rule, datetime.now(UTC), counts)
        elif rule.entity_type == "onboarding_task":
            _scan_onboarding_tasks(db, rule, datetime.now(UTC), counts)
        else:
            _scan_service_requests(db, rule, datetime.now(UTC), counts)
    return counts


def run_reminder_scan(db: Session) -> dict[str, int]:
    """Scan every tenant with active rules, one scoped transaction each."""

    tenant_ids = list(
        db.scalars(select(ReminderRule.tenant_id).distinct())
    )
    totals = {"created": 0, "skipped_rules": 0, "tenants": 0}
    for tenant_id in tenant_ids:
        set_tenant_context(db, tenant_id)
        tenant_id_ctx.set(str(tenant_id))
        counts = {"created": 0, "skipped_rules": 0}
        try:
            counts = scan_reminders_for_tenant(db, tenant_id)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "reminder_scan_tenant_failed",
                extra={"event": "reminders", "tenant_id": str(tenant_id)},
            )
        finally:
            tenant_id_ctx.set("-")
        totals["tenants"] += 1
        totals["created"] += counts.get("created", 0)
        totals["skipped_rules"] += counts.get("skipped_rules", 0)
    event = write_audit(
        db,
        None,
        "reminder.scan.completed",
        actor_type="system",
        metadata={"instances_created": totals["created"]},
    )
    db.add(event)
    db.commit()
    return totals


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        result = run_reminder_scan(db)
    print(result)


if __name__ == "__main__":
    main()
