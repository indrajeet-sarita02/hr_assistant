from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession, require_internal_permission
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, not_found
from app.db.models import (
    ApprovalRule,
    ApprovalRuleStep,
    DeletionRequest,
    LegalHold,
    ReminderRule,
    Role,
    User,
)
from app.domains.audit import write_audit
from app.domains.identity import Principal

router = APIRouter(prefix="/admin", tags=["Workflow administration"])


class ApprovalStepIn(BaseModel):
    step_order: int = Field(ge=1, le=20)
    approver_type: str
    approver_role_id: uuid.UUID | None = None
    approver_user_id: uuid.UUID | None = None
    escalate_after_hours: int | None = Field(default=None, ge=1, le=720)


class ApprovalRuleIn(BaseModel):
    code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=120)
    entity_type: str = "leave_request"
    active: bool = True
    effective_from: date
    steps: list[ApprovalStepIn] = Field(min_length=1, max_length=20)


class ApprovalStepOut(ORMModel):
    id: uuid.UUID
    step_order: int
    approver_type: str
    approver_role_id: uuid.UUID | None
    approver_user_id: uuid.UUID | None
    escalate_after_hours: int | None


class ApprovalRuleOut(ORMModel):
    id: uuid.UUID
    code: str
    name: str
    entity_type: str
    active: bool
    effective_from: date
    version: int
    steps: list[ApprovalStepOut] = Field(default_factory=list)


class ReminderRuleIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    entity_type: str
    offset_hours: int = Field(ge=0, le=8760)
    repeat_interval_hours: int | None = Field(default=None, ge=1, le=8760)
    max_repeats: int = Field(default=1, ge=0, le=20)
    recipients: dict = Field(default_factory=dict)
    channel: str = "in_app"
    active: bool = True
    effective_from: date


class ReminderRuleOut(ORMModel):
    id: uuid.UUID
    name: str
    entity_type: str
    offset_hours: int
    repeat_interval_hours: int | None
    max_repeats: int
    recipients: dict
    channel: str
    active: bool
    effective_from: date
    version: int


class DeletionRequestIn(BaseModel):
    subject_type: str = Field(min_length=2, max_length=80)
    subject_id: uuid.UUID
    scope: dict = Field(default_factory=dict)


class DeletionRequestOut(ORMModel):
    id: uuid.UUID
    requester_user_id: uuid.UUID
    subject_type: str
    subject_id: uuid.UUID
    scope: dict
    status: str
    approved_by: uuid.UUID | None
    evidence: dict
    created_at: datetime
    completed_at: datetime | None


class DeletionDecisionIn(BaseModel):
    decision: str
    reason: str | None = Field(default=None, max_length=2000)


class LegalHoldIn(BaseModel):
    target_type: str
    target_id: uuid.UUID
    reason: str = Field(min_length=2, max_length=2000)


class LegalHoldOut(ORMModel):
    id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    reason: str
    status: str
    applied_by: uuid.UUID
    applied_at: datetime
    released_at: datetime | None


def _rule_steps(db: Session, rule_id: uuid.UUID) -> list[ApprovalRuleStep]:
    return list(
        db.scalars(
            select(ApprovalRuleStep)
            .where(ApprovalRuleStep.rule_id == rule_id)
            .order_by(ApprovalRuleStep.step_order)
        )
    )


def _validate_steps(db: Session, tenant_id: uuid.UUID, steps: list[ApprovalStepIn]) -> None:
    orders = [step.step_order for step in steps]
    if len(orders) != len(set(orders)):
        raise AppError(
            422,
            "validation_error",
            "errors.validation",
            "Approval step order must be unique.",
        )
    for step in steps:
        if step.approver_type not in {"manager", "role", "user"}:
            raise AppError(422, "validation_error", "errors.validation", "Invalid approver type.")
        if step.approver_type == "role":
            role = db.get(Role, step.approver_role_id) if step.approver_role_id else None
            if role is None:
                raise not_found("approver role")
        if step.approver_type == "user":
            user = db.get(User, step.approver_user_id) if step.approver_user_id else None
            if user is None:
                raise not_found("approver user")


def _materialise_rule(
    db: Session,
    principal: Principal,
    payload: ApprovalRuleIn,
    *,
    existing_code: str | None = None,
) -> ApprovalRule:
    _validate_steps(db, principal.tenant_id, payload.steps)
    rule = ApprovalRule(
        tenant_id=principal.tenant_id,
        code=existing_code or payload.code,
        name=payload.name,
        entity_type=payload.entity_type,
        active=payload.active,
        effective_from=payload.effective_from,
        created_by=principal.user_id,
    )
    db.add(rule)
    db.flush()
    for step in sorted(payload.steps, key=lambda item: item.step_order):
        db.add(
            ApprovalRuleStep(
                rule_id=rule.id,
                step_order=step.step_order,
                approver_type=step.approver_type,
                approver_role_id=step.approver_role_id,
                approver_user_id=step.approver_user_id,
                escalate_after_hours=step.escalate_after_hours,
                metadata_json={},
            )
        )
    write_audit(
        db,
        principal,
        "workflow_rule.updated",
        target_type="approval_rule",
        target_id=rule.id,
    )
    return rule


def _rule_out(db: Session, rule: ApprovalRule) -> ApprovalRuleOut:
    return ApprovalRuleOut(
        **ApprovalRuleOut.model_validate(rule).model_dump(exclude={"steps"}),
        steps=[ApprovalStepOut.model_validate(step) for step in _rule_steps(db, rule.id)],
    )


@router.get("/approval-rules", response_model=list[ApprovalRuleOut])
def list_approval_rules(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
    active_only: bool = False,
) -> list[ApprovalRuleOut]:
    stmt = select(ApprovalRule).where(ApprovalRule.tenant_id == principal.tenant_id)
    if active_only:
        stmt = stmt.where(ApprovalRule.active.is_(True))
    rules = list(db.scalars(stmt.order_by(ApprovalRule.code, ApprovalRule.effective_from.desc())))
    return [_rule_out(db, rule) for rule in rules]


@router.post(
    "/approval-rules", response_model=ApprovalRuleOut, status_code=status.HTTP_201_CREATED
)
def create_approval_rule(
    payload: ApprovalRuleIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> ApprovalRuleOut:
    rule = _materialise_rule(db, principal, payload)
    db.commit()
    return _rule_out(db, rule)


@router.patch("/approval-rules/{rule_id}", response_model=ApprovalRuleOut)
def version_approval_rule(
    rule_id: uuid.UUID,
    payload: ApprovalRuleIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> ApprovalRuleOut:
    old = db.scalar(
        select(ApprovalRule).where(
            ApprovalRule.id == rule_id,
            ApprovalRule.tenant_id == principal.tenant_id,
        )
    )
    if old is None:
        raise not_found("approval rule")
    rule = _materialise_rule(
        db,
        principal,
        payload.model_copy(update={"code": old.code}),
        existing_code=old.code,
    )
    old.active = False
    old.version += 1
    db.add(old)
    db.commit()
    return _rule_out(db, rule)


@router.get("/reminder-rules", response_model=list[ReminderRuleOut])
def list_reminder_rules(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> list[ReminderRuleOut]:
    return [
        ReminderRuleOut.model_validate(rule)
        for rule in db.scalars(
            select(ReminderRule)
            .where(ReminderRule.tenant_id == principal.tenant_id)
            .order_by(ReminderRule.name)
        )
    ]


@router.post(
    "/reminder-rules", response_model=ReminderRuleOut, status_code=status.HTTP_201_CREATED
)
def create_reminder_rule(
    payload: ReminderRuleIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> ReminderRuleOut:
    if payload.channel not in {"in_app", "email", "sms"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid channel.")
    rule = ReminderRule(
        tenant_id=principal.tenant_id,
        name=payload.name,
        entity_type=payload.entity_type,
        offset_hours=payload.offset_hours,
        repeat_interval_hours=payload.repeat_interval_hours,
        max_repeats=payload.max_repeats,
        recipients=payload.recipients,
        channel=payload.channel,
        active=payload.active,
        effective_from=payload.effective_from,
    )
    db.add(rule)
    db.flush()
    write_audit(
        db,
        principal,
        "workflow_rule.updated",
        target_type="reminder_rule",
        target_id=rule.id,
    )
    db.commit()
    return ReminderRuleOut.model_validate(rule)


@router.patch("/reminder-rules/{rule_id}", response_model=ReminderRuleOut)
def update_reminder_rule(
    rule_id: uuid.UUID,
    payload: ReminderRuleIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> ReminderRuleOut:
    rule = db.scalar(
        select(ReminderRule).where(
            ReminderRule.id == rule_id,
            ReminderRule.tenant_id == principal.tenant_id,
        )
    )
    if rule is None:
        raise not_found("reminder rule")
    for field in (
        "name",
        "entity_type",
        "offset_hours",
        "repeat_interval_hours",
        "max_repeats",
        "recipients",
        "channel",
        "active",
        "effective_from",
    ):
        setattr(rule, field, getattr(payload, field))
    rule.version += 1
    db.add(rule)
    write_audit(
        db,
        principal,
        "workflow_rule.updated",
        target_type="reminder_rule",
        target_id=rule.id,
    )
    db.commit()
    return ReminderRuleOut.model_validate(rule)


@router.get("/deletion-requests", response_model=Page[DeletionRequestOut])
def list_deletion_requests(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("retention.manage")),
    limit: int = 20,
    offset: int = 0,
) -> Page[DeletionRequestOut]:
    stmt = select(DeletionRequest).where(
        DeletionRequest.tenant_id == principal.tenant_id
    )
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(DeletionRequest.created_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[DeletionRequestOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/deletion-requests",
    response_model=DeletionRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_deletion_request(
    payload: DeletionRequestIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("retention.manage")),
) -> DeletionRequestOut:
    holds = list(
        db.scalars(
            select(LegalHold).where(
                LegalHold.tenant_id == principal.tenant_id,
                LegalHold.target_type == payload.subject_type,
                LegalHold.target_id == payload.subject_id,
                LegalHold.status == "active",
            )
        )
    )
    if holds:
        raise AppError(
            409,
            "legal_hold_active",
            "retention.errors.legal_hold",
            "A legal hold blocks deletion for this record.",
        )
    item = DeletionRequest(
        tenant_id=principal.tenant_id,
        requester_user_id=principal.user_id,
        subject_type=payload.subject_type,
        subject_id=payload.subject_id,
        scope=payload.scope,
        status="pending",
        evidence={},
        created_at=datetime.now(UTC),
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        principal,
        "retention.deletion_requested",
        target_type="deletion_request",
        target_id=item.id,
        metadata={"subject_type": payload.subject_type},
    )
    db.commit()
    return DeletionRequestOut.model_validate(item)


@router.post("/deletion-requests/{request_id}/decision", response_model=DeletionRequestOut)
def decide_deletion_request(
    request_id: uuid.UUID,
    payload: DeletionDecisionIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("retention.manage")),
) -> DeletionRequestOut:
    if payload.decision not in {"approved", "rejected"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid decision.")
    item = db.scalar(
        select(DeletionRequest)
        .where(
            DeletionRequest.id == request_id,
            DeletionRequest.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        raise not_found("deletion request")
    if item.status != "pending":
        raise AppError(
            409,
            "invalid_state_transition",
            "errors.invalid_state",
            "This deletion request is no longer pending.",
        )
    holds = list(
        db.scalars(
            select(LegalHold).where(
                LegalHold.tenant_id == principal.tenant_id,
                LegalHold.target_type == item.subject_type,
                LegalHold.target_id == item.subject_id,
                LegalHold.status == "active",
            )
        )
    )
    if payload.decision == "approved" and holds:
        raise AppError(
            409,
            "legal_hold_active",
            "retention.errors.legal_hold",
            "A legal hold blocks this deletion request.",
        )
    item.status = "approved" if payload.decision == "approved" else "rejected"
    item.approved_by = principal.user_id if payload.decision == "approved" else None
    item.evidence = {"decision_reason": payload.reason}
    db.add(item)
    write_audit(
        db,
        principal,
        "retention.decision_recorded",
        target_type="deletion_request",
        target_id=item.id,
        metadata={"decision": payload.decision},
    )
    db.commit()
    return DeletionRequestOut.model_validate(item)


@router.post(
    "/legal-holds", response_model=LegalHoldOut, status_code=status.HTTP_201_CREATED
)
def apply_legal_hold(
    payload: LegalHoldIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("legal_hold.manage")),
) -> LegalHoldOut:
    hold = LegalHold(
        tenant_id=principal.tenant_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason,
        status="active",
        applied_by=principal.user_id,
        applied_at=datetime.now(UTC),
    )
    db.add(hold)
    db.flush()
    write_audit(
        db,
        principal,
        "legal_hold.applied",
        target_type=hold.target_type,
        target_id=hold.target_id,
        metadata={"legal_hold_id": str(hold.id)},
    )
    db.commit()
    return LegalHoldOut.model_validate(hold)


@router.post("/legal-holds/{hold_id}/release", response_model=LegalHoldOut)
def release_legal_hold(
    hold_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("legal_hold.manage")),
) -> LegalHoldOut:
    hold = db.scalar(
        select(LegalHold).where(
            LegalHold.id == hold_id,
            LegalHold.tenant_id == principal.tenant_id,
        )
    )
    if hold is None:
        raise not_found("legal hold")
    if hold.status == "released":
        raise AppError(409, "invalid_state_transition", "errors.invalid_state", "Already released.")
    hold.status = "released"
    hold.released_by = principal.user_id
    hold.released_at = datetime.now(UTC)
    db.add(hold)
    write_audit(
        db,
        principal,
        "legal_hold.released",
        target_type=hold.target_type,
        target_id=hold.target_id,
        metadata={"legal_hold_id": str(hold.id)},
    )
    db.commit()
    return LegalHoldOut.model_validate(hold)
