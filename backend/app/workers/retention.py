"""Retention and deletion-request execution worker (FR-031, §8.11).

Deletion requests stop at ``status="approved"`` in
``app/api/v1/workflow_admin.py``; only the execution job moves them through
``executing`` to the terminal ``completed``/``failed`` states (both allowed by
the ``deletion_requests.status`` CHECK constraint).

For each claimed request the worker:

1. Re-verifies any active legal hold against the subject *immediately before*
   every destructive batch. If a hold appears, the request is put back to
   ``pending`` (the CHECK constraint does not allow a ``blocked`` status, and
   the workflow-admin decision endpoint re-gates on active holds, so a
   released hold can be re-approved cleanly). The evidence JSONB records the
   block and per-record evidence for what had already been deleted.
2. Executes the entity targets defined for the subject in bounded, idempotent
   batches — hard deletion for operational data owned by the subject,
   anonymization where referential/audit history must remain (§6.8).
3. Records per-record evidence (entity → deleted count + capped record IDs)
   in the existing ``deletion_requests.evidence`` JSONB column; there is no
   separate per-record evidence table in the schema.
4. Emits ``deletion.executed`` / ``deletion.blocked_by_legal_hold`` /
   ``deletion.failed`` audit events in the same transaction.

Supported subject types: ``user`` (hard-delete owned data, hard-delete or
anonymize the account, DSAR path) and ``employee`` (hard-delete operational
HR data, anonymize the employee profile) plus vocabulary aliases.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger, tenant_id_ctx
from app.db.models import (
    DeletionRequest,
    Document,
    EmployeeProfile,
    HRServiceRequest,
    IdempotencyKey,
    LegalHold,
    LeaveBalance,
    LeaveRequest,
    Notification,
    OnboardingCase,
    ResumeProfile,
    TenantMembership,
    TestAttempt,
    User,
    UserSession,
)
from app.db.session import set_tenant_context
from app.domains.audit import write_audit

logger = get_logger(__name__)

BATCH_SIZE = 100
# Cap the number of rows a single run deletes so a large subject never blocks
# other jobs. A partially executed request resumes from ``executing`` on the
# next run; the whole loop is idempotent by Subject deletion state.
MAX_ROWS_PER_RUN = 2_000
# Evidence detail cap: deleted counts are complete, record-ID lists are
# truncated to keep the JSONB payload bounded.
EVIDENCE_ID_CAP = 100

SUBJECT_ALIASES = {
    "employee_profile": "employee",
    "employee_profiles": "employee",
}
HOLD_TARGET_TYPES = {
    "user": {"user"},
    "employee": {"employee", "employee_profile", "employee_profiles"},
}


def _active_holds(
    db: Session, tenant_id: uuid.UUID, subject_type: str, subject_id: uuid.UUID
) -> list[LegalHold]:
    return list(
        db.scalars(
            select(LegalHold).where(
                LegalHold.tenant_id == tenant_id,
                LegalHold.target_type.in_(
                    HOLD_TARGET_TYPES.get(subject_type, {subject_type})
                ),
                LegalHold.target_id == subject_id,
                LegalHold.status == "active",
            )
        )
    )


def _delete_rows(
    db: Session, model: Any, condition: Any
) -> tuple[int, list[str], bool]:
    """Delete matching rows in bounded, restartable batches.

    Uses ``id IN (SELECT id ... LIMIT n)`` (PostgreSQL has no ``DELETE
    LIMIT``) to keep each statement's lock footprint small. Returns the total
    deleted count, a capped sample of record IDs for evidence, and whether
    the per-run cap was reached (i.e. more rows remain).
    """

    deleted = 0
    sample: list[str] = []
    while True:
        ids = list(db.scalars(select(model.id).where(condition).limit(BATCH_SIZE)))
        if not ids:
            break
        sample.extend(str(value) for value in ids[: max(0, EVIDENCE_ID_CAP - len(sample))])
        db.execute(delete(model).where(model.id.in_(ids)))
        deleted += len(ids)
        if deleted >= MAX_ROWS_PER_RUN:
            return deleted, sample, True
    return deleted, sample, False


def _user_targets(user_id: uuid.UUID) -> list[tuple[str, Any, Any]]:
    """Entity targets for a ``user`` subject (DSAR erasure path).

    Order matters: RESTRICTED parents (documents, test attempts) must be
    deleted before the user row itself.
    """

    return [
        ("documents", Document, Document.uploaded_by == user_id),
        ("test_attempts", TestAttempt, TestAttempt.user_id == user_id),
        ("resume_profiles", ResumeProfile, ResumeProfile.user_id == user_id),
        ("notifications", Notification, Notification.recipient_user_id == user_id),
        ("user_sessions", UserSession, UserSession.user_id == user_id),
        ("idempotency_keys", IdempotencyKey, IdempotencyKey.user_id == user_id),
    ]


def _employee_targets(
    tenant_id: uuid.UUID, employee: EmployeeProfile
) -> list[tuple[str, Any, Any]]:
    """Entity targets for an ``employee`` subject.

    Operational data (leave requests/decisions via cascade, balances,
    onboarding cases/tasks via cascade, own service requests) is hard
    deleted; ``employee_profiles`` is anonymized because audit history
    references the employee ID.
    """

    return [
        (
            "service_requests",
            HRServiceRequest,
            (HRServiceRequest.tenant_id == tenant_id)
            & (HRServiceRequest.requester_user_id == employee.user_id),
        ),
        (
            "leave_requests",
            LeaveRequest,
            (LeaveRequest.tenant_id == tenant_id)
            & (LeaveRequest.employee_id == employee.id),
        ),
        (
            "leave_balances",
            LeaveBalance,
            (LeaveBalance.tenant_id == tenant_id)
            & (LeaveBalance.employee_id == employee.id),
        ),
        (
            "onboarding_cases",
            OnboardingCase,
            (OnboardingCase.tenant_id == tenant_id)
            & (OnboardingCase.employee_id == employee.id),
        ),
    ]


def _anonymize_employee(db: Session, employee: EmployeeProfile) -> None:
    """Remove identifying data while keeping the row for audit references."""

    employee.employee_number = f"anon-{employee.id.hex[:12]}"
    employee.job_title = None
    employee.join_date = None
    employee.department_id = None
    employee.manager_employee_id = None
    employee.status = "inactive"
    db.add(employee)


def _anonymize_user(db: Session, user: User) -> None:
    """Internal users with memberships cannot be hard deleted (RESTRICTed
    references such as employee profiles); strip credentials and identity."""

    user.full_name = "Deleted User"
    user.email = f"deleted-{user.id.hex[:16]}@invalid.local"
    user.password_hash = "!deactivated"
    user.status = "disabled"
    db.add(user)


def _ensure_profile(
    db: Session,
    tenant_id: uuid.UUID,
    subject_id: uuid.UUID,
) -> tuple[User | None, EmployeeProfile | None]:
    """Resolve the subject against the tenant scope."""

    user = db.get(User, subject_id)
    employee = db.scalar(
        select(EmployeeProfile).where(
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.id == subject_id,
        )
    )
    return user, employee


def _execute_request(db: Session, item: DeletionRequest) -> None:
    tenant_id = item.tenant_id
    subject_id = item.subject_id
    subject_type = SUBJECT_ALIASES.get(item.subject_type, item.subject_type)
    scope = item.scope or {}
    evidence: dict[str, Any] = dict(item.evidence or {})
    entities_run: dict[str, Any] = {}

    set_tenant_context(db, tenant_id)
    user, employee = _ensure_profile(db, tenant_id, subject_id)

    if subject_type == "user" and user is not None:
        targets = _user_targets(user.id)
    elif subject_type == "employee" and employee is not None:
        targets = _employee_targets(tenant_id, employee)
    else:
        item.status = "failed"
        item.completed_at = datetime.now(UTC)
        item.evidence = {**evidence, "error": "unsupported_subject_type"}
        db.add(item)
        event = write_audit(
            db,
            None,
            "deletion.failed",
            target_type="deletion_request",
            target_id=item.id,
            outcome="failure",
            metadata={
                "subject_type": item.subject_type,
                "reason": "unsupported_subject_type",
            },
        )
        event.tenant_id = tenant_id
        return

    for name, model, condition in targets:
        # Re-verify the legal hold immediately before every destructive batch.
        holds = _active_holds(db, tenant_id, subject_type, subject_id)
        if holds:
            item.status = "pending"
            item.evidence = {
                **evidence,
                "entities_executed": entities_run,
                "blocked": True,
                "legal_hold_ids": [str(hold.id) for hold in holds],
            }
            db.add(item)
            event = write_audit(
                db,
                None,
                "deletion.blocked_by_legal_hold",
                target_type="deletion_request",
                target_id=item.id,
                outcome="denied",
                metadata={
                    "subject_type": subject_type,
                    "legal_hold_ids": [str(hold.id) for hold in holds],
                    "entities_executed": sorted(entities_run.keys()),
                },
            )
            event.tenant_id = tenant_id
            return
        deleted, sample, capped = _delete_rows(db, model, condition)
        if deleted:
            entities_run[model.__tablename__] = {
                "deleted": deleted,
                "record_ids": sample,
                "capped": capped,
            }
        if capped:
            # Stop the run with work remaining; the next scheduled run resumes
            # from the still-terminal-safe "executing" status.
            item.status = "executing"
            item.evidence = {
                **evidence,
                "entities_executed": entities_run,
                "resumed": True,
            }
            db.add(item)
            logger.info(
                "deletion_execution_deferred",
                extra={
                    "event": "retention",
                    "deletion_request_id": str(item.id),
                    "entity": model.__tablename__,
                },
            )
            return

    if subject_type == "user":
        memberships = db.scalar(
            select(TenantMembership.id).where(TenantMembership.user_id == user.id)
        )
        if scope.get("hard_delete_user", True) and memberships is None:
            db.execute(delete(User).where(User.id == user.id))
        else:
            _anonymize_user(db, user)
    else:
        _anonymize_employee(db, employee)

    item.status = "completed"
    item.completed_at = datetime.now(UTC)
    item.evidence = {**evidence, "entities_executed": entities_run}
    db.add(item)
    event = write_audit(
        db,
        None,
        "deletion.executed",
        target_type="deletion_request",
        target_id=item.id,
        actor_type="system",
        metadata={
            "subject_type": subject_type,
            "entities_executed": {
                name: stats["deleted"] for name, stats in entities_run.items()
            },
        },
    )
    event.tenant_id = tenant_id


def _mark_failed(db: Session, request_id: uuid.UUID, exc: Exception) -> None:
    """Record a terminal failure in a fresh transaction (the failed one is
    rolled back so the session is usable again)."""

    item = db.get(DeletionRequest, request_id)
    if item is None:
        return
    item.status = "failed"
    item.completed_at = datetime.now(UTC)
    item.evidence = {**(item.evidence or {}), "error": type(exc).__name__}
    db.add(item)
    event = write_audit(
        db,
        None,
        "deletion.failed",
        target_type="deletion_request",
        target_id=item.id,
        outcome="failure",
        metadata={"reason": type(exc).__name__},
    )
    event.tenant_id = item.tenant_id
    db.commit()


def process_approved_deletion_requests(
    db: Session, limit: int = 5
) -> dict[str, int]:
    """Claim and execute one bounded batch of approved/resumable requests.

    ``approved`` requests start a fresh execution; ``executing`` requests are
    continuations of a previous run that hit the per-run row cap. Claims use
    ``FOR UPDATE SKIP LOCKED`` and the row locks are held for the whole per
    request transaction, so concurrent workers never double-process. A crash
    mid-request rolls back to the claimed state and the next run retries.
    """

    items = list(
        db.scalars(
            select(DeletionRequest)
            .where(DeletionRequest.status.in_(["approved", "executing"]))
            .order_by(DeletionRequest.created_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    completed = 0
    failed = 0
    for item in items:
        item.status = "executing"
        db.add(item)
        db.flush()
        tenant_id_ctx.set(str(item.tenant_id))
        try:
            _execute_request(db, item)
        except Exception as exc:  # noqa: BLE001 - terminal failure with evidence
            db.rollback()
            failed += 1
            logger.exception(
                "deletion_execution_failed",
                extra={"event": "retention", "deletion_request_id": str(item.id)},
            )
            _mark_failed(db, item.id, exc)
        else:
            if item.status == "completed":
                completed += 1
            db.commit()
        finally:
            tenant_id_ctx.set("-")
    return {
        "claimed": len(items),
        "completed": completed,
        "failed": failed,
    }


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        result = process_approved_deletion_requests(db)
    print(result)


if __name__ == "__main__":
    main()
