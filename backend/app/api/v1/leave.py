from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.deps import DbSession, get_principal, require_internal_permission
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, conflict, forbidden, invalid_state, not_found
from app.db.models import (
    EmployeeProfile,
    Holiday,
    HolidayCalendar,
    LeaveBalance,
    LeaveDecision,
    LeaveLedger,
    LeaveRequest,
    LeaveType,
    MembershipRole,
    Role,
    TenantMembership,
)
from app.domains.audit import write_audit, write_outbox
from app.domains.idempotency import begin, complete
from app.domains.identity import Principal

router = APIRouter(prefix="/leave", tags=["Leave"])
IdempotencyHeader = Annotated[str, Header(alias="Idempotency-Key")]


class LeaveTypeOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_hi: str | None
    unit: str
    requires_approval: bool
    allow_half_day: bool


class BalanceOut(ORMModel):
    id: uuid.UUID
    leave_type_id: uuid.UUID
    period_start: date
    period_end: date
    entitled: Decimal
    consumed: Decimal
    pending: Decimal
    carried_forward: Decimal


class CalendarOut(BaseModel):
    calendar_id: uuid.UUID
    name: str
    timezone: str
    holidays: list[dict]


class LeaveRequestCreate(BaseModel):
    leave_type_id: uuid.UUID
    start_at: datetime
    end_at: datetime
    reason: str | None = Field(default=None, max_length=2000)
    partial_day: bool = False

    @field_validator("start_at", "end_at")
    @classmethod
    def timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("start_at and end_at must include a timezone offset")
        return value

    @field_validator("end_at")
    @classmethod
    def after_start(cls, value: datetime, info):
        start = info.data.get("start_at")
        if start and value <= start:
            raise ValueError("end_at must be after start_at")
        return value


class LeaveRequestUpdate(BaseModel):
    """Permitted edits to an undecided request.

    Omitted fields are unchanged. ``reason`` can be cleared explicitly by
    sending ``null``. ``version`` enables optimistic concurrency; a stale value
    returns ``409 stale_version`` rather than silently overwriting a change made
    by the employee or an approver.
    """

    leave_type_id: uuid.UUID | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=2000)
    partial_day: bool | None = None
    version: int | None = Field(default=None, ge=1)

    @field_validator("start_at", "end_at")
    @classmethod
    def timezone_aware(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("start_at and end_at must include a timezone offset")
        return value


class LeaveRequestOut(ORMModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    leave_type_id: uuid.UUID
    start_at: datetime
    end_at: datetime
    partial_day: bool
    reason: str | None
    status: str
    submitted_at: datetime | None
    decided_at: datetime | None
    current_approver_user_id: uuid.UUID | None
    version: int
    created_at: datetime
    updated_at: datetime


class DecisionIn(BaseModel):
    decision: str
    comment: str | None = Field(default=None, max_length=2000)


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class DecisionOut(ORMModel):
    id: uuid.UUID
    request_id: uuid.UUID
    actor_user_id: uuid.UUID
    decision: str
    comment: str | None
    created_at: datetime


def _employee_for_principal(db: Session, principal: Principal) -> EmployeeProfile:
    employee = db.scalar(
        select(EmployeeProfile).where(
            EmployeeProfile.tenant_id == principal.tenant_id,
            EmployeeProfile.user_id == principal.user_id,
        )
    )
    if employee is None:
        raise AppError(
            422,
            "business_rule_violation",
            "leave.errors.no_employee_profile",
            "No employee profile is linked to this account.",
        )
    return employee


def _duration_days(payload: LeaveRequestCreate) -> Decimal:
    seconds = (payload.end_at - payload.start_at).total_seconds()
    days = Decimal(str(seconds / 86400)).quantize(Decimal("0.01"))
    if payload.partial_day:
        return Decimal("0.50")
    return days


def _request_days(start_at: datetime, end_at: datetime, partial_day: bool) -> Decimal:
    if partial_day:
        return Decimal("0.50")
    seconds = (end_at - start_at).total_seconds()
    return Decimal(str(seconds / 86400)).quantize(Decimal("0.01"))


def _load_own_request(
    db: Session, principal: Principal, request_id: uuid.UUID
) -> LeaveRequest:
    item = db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.id == request_id,
            LeaveRequest.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("leave request")
    can_scope = "leave.request.read_scope" in principal.permissions
    if can_scope:
        return item
    employee = _employee_for_principal(db, principal)
    if item.employee_id != employee.id:
        raise not_found("leave request")
    return item


def _balance_for(
    db: Session, tenant_id: uuid.UUID, employee_id: uuid.UUID, leave_type_id: uuid.UUID
) -> LeaveBalance | None:
    return db.scalar(
        select(LeaveBalance)
        .where(
            LeaveBalance.tenant_id == tenant_id,
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.leave_type_id == leave_type_id,
            LeaveBalance.period_start <= datetime.now(UTC).date(),
            LeaveBalance.period_end >= datetime.now(UTC).date(),
        )
        .with_for_update()
    )


@router.get("/types", response_model=list[LeaveTypeOut])
def leave_types(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.request.create")),
) -> list[LeaveTypeOut]:
    rows = list(
        db.scalars(
            select(LeaveType)
            .where(LeaveType.tenant_id == principal.tenant_id, LeaveType.active.is_(True))
            .order_by(LeaveType.code)
        )
    )
    return [LeaveTypeOut.model_validate(row) for row in rows]


@router.get("/balances", response_model=list[BalanceOut])
def balances(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.request.read_own")),
) -> list[BalanceOut]:
    employee = _employee_for_principal(db, principal)
    rows = list(
        db.scalars(
            select(LeaveBalance)
            .where(
                LeaveBalance.tenant_id == principal.tenant_id,
                LeaveBalance.employee_id == employee.id,
            )
            .order_by(LeaveBalance.period_end.desc())
        )
    )
    return [BalanceOut.model_validate(row) for row in rows]


@router.get("/calendar", response_model=list[CalendarOut])
def calendars(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.request.create")),
) -> list[CalendarOut]:
    rows = list(
        db.scalars(
            select(HolidayCalendar).where(
                HolidayCalendar.tenant_id == principal.tenant_id
            )
        )
    )
    result = []
    for calendar in rows:
        holidays = list(
            db.scalars(
                select(Holiday).where(
                    Holiday.tenant_id == principal.tenant_id,
                    Holiday.calendar_id == calendar.id,
                )
            )
        )
        result.append(
            CalendarOut(
                calendar_id=calendar.id,
                name=calendar.name,
                timezone=calendar.timezone,
                holidays=[
                    {
                        "date": item.holiday_date.isoformat(),
                        "name": item.name,
                        "working_day_override": item.is_working_day_override,
                    }
                    for item in holidays
                ],
            )
        )
    return result


@router.get("/requests", response_model=Page[LeaveRequestOut])
def list_requests(
    db: DbSession,
    principal: Principal = Depends(get_principal),
    limit: int = 20,
    offset: int = 0,
    request_status: str | None = None,
    scope: str | None = None,
) -> Page[LeaveRequestOut]:
    if principal.membership is None:
        raise forbidden("Organization member access is required.")
    if scope is not None and scope not in {"own", "approvals", "all"}:
        raise AppError(
            422, "validation_error", "errors.validation", "Invalid scope."
        )
    limit = max(1, min(limit, 100))
    stmt = select(LeaveRequest).where(
        LeaveRequest.tenant_id == principal.tenant_id
    )
    can_scope = "leave.request.read_scope" in principal.permissions
    can_decide = "leave.request.decide" in principal.permissions
    if scope == "own":
        employee = _employee_for_principal(db, principal)
        stmt = stmt.where(LeaveRequest.employee_id == employee.id)
    elif scope == "approvals":
        if not can_decide:
            raise forbidden("Missing permission: leave.request.decide.")
        stmt = stmt.where(
            LeaveRequest.current_approver_user_id == principal.user_id,
            LeaveRequest.status.in_(["pending", "needs_clarification"]),
        )
    elif scope == "all":
        if not can_scope:
            raise forbidden("Missing permission: leave.request.read_scope.")
    elif can_scope:
        if can_decide:
            stmt = stmt.where(
                or_(
                    LeaveRequest.current_approver_user_id == principal.user_id,
                    LeaveRequest.status.in_(["pending", "needs_clarification"]),
                )
            )
    else:
        employee = _employee_for_principal(db, principal)
        stmt = stmt.where(LeaveRequest.employee_id == employee.id)
    if request_status:
        stmt = stmt.where(LeaveRequest.status == request_status)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(LeaveRequest.created_at.desc()).limit(limit).offset(offset)
        )
    )
    return Page(
        items=[LeaveRequestOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/requests", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED
)
def create_request(
    payload: LeaveRequestCreate,
    response: Response,
    idempotency_key: IdempotencyHeader,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.request.create")),
) -> LeaveRequestOut:
    state = begin(
        db,
        principal,
        "POST /api/v1/leave/requests",
        idempotency_key,
        payload.model_dump(mode="json"),
    )
    if state.replay:
        response.status_code = state.record.response_status or 200
        return LeaveRequestOut.model_validate(state.record.response_body)

    employee = _employee_for_principal(db, principal)
    if employee.status != "active":
        raise AppError(
            422,
            "business_rule_violation",
            "leave.errors.employee_inactive",
            "Inactive employees cannot submit leave.",
        )
    leave_type = db.scalar(
        select(LeaveType).where(
            LeaveType.id == payload.leave_type_id,
            LeaveType.tenant_id == principal.tenant_id,
            LeaveType.active.is_(True),
        )
    )
    if leave_type is None:
        raise not_found("leave type")
    if payload.partial_day and not leave_type.allow_half_day:
        raise AppError(
            422,
            "business_rule_violation",
            "leave.errors.half_day_not_allowed",
            "Half-day leave is not enabled for this leave type.",
        )
    overlap = db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.tenant_id == principal.tenant_id,
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.status.in_(["pending", "approved", "needs_clarification"]),
            and_(
                LeaveRequest.start_at < payload.end_at,
                LeaveRequest.end_at > payload.start_at,
            ),
        )
    )
    if overlap is not None:
        raise conflict(
            "leave_overlap",
            "The selected dates overlap an existing leave request.",
        )
    days = _duration_days(payload)
    if days <= 0 or days > 60:
        raise AppError(
            422,
            "validation_error",
            "errors.validation",
            "Leave duration must be between 0 and 60 days.",
        )
    balance = _balance_for(
        db, principal.tenant_id, employee.id, payload.leave_type_id
    )
    if balance is None:
        raise AppError(
            422,
            "business_rule_violation",
            "leave.errors.no_balance",
            "No applicable leave balance is configured.",
        )
    available = balance.entitled + balance.carried_forward - balance.consumed - balance.pending
    if available < days:
        raise AppError(
            422,
            "business_rule_violation",
            "leave.errors.insufficient_balance",
            "The request exceeds the available leave balance.",
            details=[
                {
                    "field": "leave_type_id",
                    "code": "insufficient_balance",
                    "message_key": "leave.errors.insufficient_balance",
                }
            ],
        )

    approver_user_id: uuid.UUID | None = None
    if employee.manager_employee_id:
        manager = db.get(EmployeeProfile, employee.manager_employee_id)
        if manager:
            approver_user_id = manager.user_id
    if approver_user_id is None:
        approver_user_id = db.scalar(
            select(TenantMembership.user_id)
            .join(MembershipRole, MembershipRole.membership_id == TenantMembership.id)
            .join(Role, Role.id == MembershipRole.role_id)
            .where(
                TenantMembership.tenant_id == principal.tenant_id,
                TenantMembership.status == "active",
                Role.code == "approver",
            )
            .limit(1)
        )

    now = datetime.now(UTC)
    item = LeaveRequest(
        tenant_id=principal.tenant_id,
        employee_id=employee.id,
        leave_type_id=leave_type.id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        partial_day=payload.partial_day,
        reason=payload.reason,
        status="pending",
        submitted_at=now,
        current_approver_user_id=approver_user_id,
        created_by=principal.user_id,
    )
    db.add(item)
    db.flush()
    balance.pending += days
    balance.version += 1
    db.add(balance)
    db.add(
        LeaveLedger(
            tenant_id=principal.tenant_id,
            request_id=item.id,
            employee_id=employee.id,
            leave_type_id=leave_type.id,
            entry_type="reserve",
            days=days,
            created_at=now,
        )
    )
    write_audit(
        db,
        principal,
        "leave.request.created",
        target_type="leave_request",
        target_id=item.id,
        metadata={"days": str(days), "leave_type": leave_type.code},
    )
    write_outbox(
        db,
        principal.tenant_id,
        "leave.request.created",
        "leave_request",
        item.id,
        {
            "employee_user_id": str(principal.user_id),
            "approver_user_id": str(approver_user_id) if approver_user_id else None,
        },
    )
    body = LeaveRequestOut.model_validate(item).model_dump(mode="json")
    complete(
        db,
        state,
        status_code=201,
        body=body,
        resource_type="leave_request",
        resource_id=item.id,
    )
    db.commit()
    return LeaveRequestOut.model_validate(body)


@router.get("/requests/{request_id}", response_model=LeaveRequestOut)
def get_request(
    request_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> LeaveRequestOut:
    return LeaveRequestOut.model_validate(_load_own_request(db, principal, request_id))


@router.patch("/requests/{request_id}", response_model=LeaveRequestOut)
def update_request(
    request_id: uuid.UUID,
    payload: LeaveRequestUpdate,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("leave.request.cancel_own")
    ),
) -> LeaveRequestOut:
    item = db.scalar(
        select(LeaveRequest)
        .where(
            LeaveRequest.id == request_id,
            LeaveRequest.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        raise not_found("leave request")
    employee = _employee_for_principal(db, principal)
    if item.employee_id != employee.id:
        raise not_found("leave request")
    if employee.status != "active":
        raise AppError(
            422,
            "business_rule_violation",
            "leave.errors.employee_inactive",
            "Inactive employees cannot change leave.",
        )
    if item.status not in {"pending", "needs_clarification"}:
        raise invalid_state("Only undecided requests can be changed.")
    if payload.version is not None and payload.version != item.version:
        raise conflict(
            "stale_version",
            "This request changed since it was loaded. Refresh and try again.",
        )

    leave_type_id = payload.leave_type_id or item.leave_type_id
    leave_type = db.scalar(
        select(LeaveType).where(
            LeaveType.id == leave_type_id,
            LeaveType.tenant_id == principal.tenant_id,
            LeaveType.active.is_(True),
        )
    )
    if leave_type is None:
        raise not_found("leave type")

    start_at = payload.start_at or item.start_at
    end_at = payload.end_at or item.end_at
    partial_day = (
        payload.partial_day if payload.partial_day is not None else item.partial_day
    )
    if end_at <= start_at:
        raise AppError(
            422,
            "validation_error",
            "errors.validation",
            "end_at must be after start_at.",
        )
    if partial_day and not leave_type.allow_half_day:
        raise AppError(
            422,
            "business_rule_violation",
            "leave.errors.half_day_not_allowed",
            "Half-day leave is not enabled for this leave type.",
        )

    overlap = db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.tenant_id == principal.tenant_id,
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.id != item.id,
            LeaveRequest.status.in_(["pending", "approved", "needs_clarification"]),
            and_(
                LeaveRequest.start_at < end_at,
                LeaveRequest.end_at > start_at,
            ),
        )
    )
    if overlap is not None:
        raise conflict(
            "leave_overlap",
            "The selected dates overlap an existing leave request.",
        )

    old_days = _request_days(item.start_at, item.end_at, item.partial_day)
    new_days = _request_days(start_at, end_at, partial_day)
    if new_days <= 0 or new_days > 60:
        raise AppError(
            422,
            "validation_error",
            "errors.validation",
            "Leave duration must be between 0 and 60 days.",
        )

    old_balance = _balance_for(
        db, principal.tenant_id, item.employee_id, item.leave_type_id
    )
    if leave_type.id == item.leave_type_id:
        if old_balance is None:
            raise AppError(
                422,
                "business_rule_violation",
                "leave.errors.no_balance",
                "No applicable leave balance is configured.",
            )
        available = (
            old_balance.entitled
            + old_balance.carried_forward
            - old_balance.consumed
            - old_balance.pending
            + old_days
        )
        if available < new_days:
            raise AppError(
                422,
                "business_rule_violation",
                "leave.errors.insufficient_balance",
                "The request exceeds the available leave balance.",
                details=[
                    {
                        "field": "leave_type_id",
                        "code": "insufficient_balance",
                        "message_key": "leave.errors.insufficient_balance",
                    }
                ],
            )
        old_balance.pending = max(
            Decimal("0"), old_balance.pending - old_days + new_days
        )
        old_balance.version += 1
        db.add(old_balance)
    else:
        new_balance = _balance_for(
            db, principal.tenant_id, item.employee_id, leave_type.id
        )
        if new_balance is None:
            raise AppError(
                422,
                "business_rule_violation",
                "leave.errors.no_balance",
                "No applicable leave balance is configured.",
            )
        available = (
            new_balance.entitled
            + new_balance.carried_forward
            - new_balance.consumed
            - new_balance.pending
        )
        if available < new_days:
            raise AppError(
                422,
                "business_rule_violation",
                "leave.errors.insufficient_balance",
                "The request exceeds the available leave balance.",
                details=[
                    {
                        "field": "leave_type_id",
                        "code": "insufficient_balance",
                        "message_key": "leave.errors.insufficient_balance",
                    }
                ],
            )
        if old_balance is not None:
            old_balance.pending = max(Decimal("0"), old_balance.pending - old_days)
            old_balance.version += 1
            db.add(old_balance)
        new_balance.pending += new_days
        new_balance.version += 1
        db.add(new_balance)

    now = datetime.now(UTC)
    if leave_type.id != item.leave_type_id or old_days != new_days:
        db.add(
            LeaveLedger(
                tenant_id=principal.tenant_id,
                request_id=item.id,
                employee_id=item.employee_id,
                leave_type_id=item.leave_type_id,
                entry_type="release",
                days=old_days,
                created_at=now,
            )
        )
        db.add(
            LeaveLedger(
                tenant_id=principal.tenant_id,
                request_id=item.id,
                employee_id=item.employee_id,
                leave_type_id=leave_type.id,
                entry_type="reserve",
                days=new_days,
                created_at=now,
            )
        )

    before = {
        "leave_type_id": str(item.leave_type_id),
        "start_at": item.start_at.isoformat(),
        "end_at": item.end_at.isoformat(),
        "partial_day": item.partial_day,
        "reason": item.reason,
    }
    item.leave_type_id = leave_type.id
    item.start_at = start_at
    item.end_at = end_at
    item.partial_day = partial_day
    if "reason" in payload.model_fields_set:
        item.reason = payload.reason
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "leave.request.updated",
        target_type="leave_request",
        target_id=item.id,
        metadata={
            "before": before,
            "after": {
                "leave_type_id": str(item.leave_type_id),
                "start_at": item.start_at.isoformat(),
                "end_at": item.end_at.isoformat(),
                "partial_day": item.partial_day,
                "reason": item.reason,
            },
        },
    )
    write_outbox(
        db,
        principal.tenant_id,
        "leave.request.updated",
        "leave_request",
        item.id,
        {"employee_id": str(item.employee_id)},
    )
    db.commit()
    return LeaveRequestOut.model_validate(item)


@router.post("/requests/{request_id}/decision", response_model=DecisionOut)
def decide(
    request_id: uuid.UUID,
    payload: DecisionIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.request.decide")),
) -> DecisionOut:
    if payload.decision not in {"approved", "rejected", "needs_clarification"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid decision.")
    item = db.scalar(
        select(LeaveRequest)
        .where(
            LeaveRequest.id == request_id,
            LeaveRequest.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        raise not_found("leave request")
    if item.current_approver_user_id and item.current_approver_user_id != principal.user_id:
        raise forbidden("This request is assigned to another approver.")
    if item.status in {"approved", "rejected", "cancelled"}:
        raise conflict("already_decided", "This request has already been decided.")
    if item.status not in {"pending", "needs_clarification"}:
        raise invalid_state()
    if item.employee_id:
        employee = db.get(EmployeeProfile, item.employee_id)
        if employee and employee.user_id == principal.user_id:
            raise forbidden("Self-approval is not allowed.")

    now = datetime.now(UTC)
    balance = _balance_for(
        db, principal.tenant_id, item.employee_id, item.leave_type_id
    )
    days = Decimal(
        str((item.end_at - item.start_at).total_seconds() / 86400)
    ).quantize(Decimal("0.01"))
    if item.partial_day:
        days = Decimal("0.50")
    if balance is not None:
        if payload.decision == "approved":
            balance.pending = max(Decimal("0"), balance.pending - days)
            balance.consumed += days
            db.add(
                LeaveLedger(
                    tenant_id=principal.tenant_id,
                    request_id=item.id,
                    employee_id=item.employee_id,
                    leave_type_id=item.leave_type_id,
                    entry_type="consume",
                    days=days,
                    created_at=now,
                )
            )
        elif payload.decision == "rejected":
            balance.pending = max(Decimal("0"), balance.pending - days)
            db.add(
                LeaveLedger(
                    tenant_id=principal.tenant_id,
                    request_id=item.id,
                    employee_id=item.employee_id,
                    leave_type_id=item.leave_type_id,
                    entry_type="release",
                    days=days,
                    created_at=now,
                )
            )
        balance.version += 1
        db.add(balance)

    item.status = (
        "approved" if payload.decision == "approved" else
        "rejected" if payload.decision == "rejected" else
        "needs_clarification"
    )
    if payload.decision in {"approved", "rejected"}:
        item.decided_at = now
    item.version += 1
    db.add(item)
    decision = LeaveDecision(
        tenant_id=principal.tenant_id,
        request_id=item.id,
        actor_user_id=principal.user_id,
        decision=payload.decision,
        comment=payload.comment,
        created_at=now,
    )
    db.add(decision)
    db.flush()
    write_audit(
        db,
        principal,
        "leave.request.decided",
        target_type="leave_request",
        target_id=item.id,
        metadata={"decision": payload.decision},
    )
    write_outbox(
        db,
        principal.tenant_id,
        "leave.request.decided",
        "leave_request",
        item.id,
        {"decision": payload.decision, "employee_id": str(item.employee_id)},
    )
    db.commit()
    return DecisionOut.model_validate(decision)


@router.post("/requests/{request_id}/cancel", response_model=LeaveRequestOut)
def cancel(
    request_id: uuid.UUID,
    payload: CancelIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.request.cancel_own")),
) -> LeaveRequestOut:
    item = db.scalar(
        select(LeaveRequest)
        .where(
            LeaveRequest.id == request_id,
            LeaveRequest.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        raise not_found("leave request")
    employee = _employee_for_principal(db, principal)
    if item.employee_id != employee.id:
        raise not_found("leave request")
    if item.status not in {"pending", "approved", "needs_clarification"}:
        raise invalid_state()
    now = datetime.now(UTC)
    days = Decimal(
        str((item.end_at - item.start_at).total_seconds() / 86400)
    ).quantize(Decimal("0.01"))
    if item.partial_day:
        days = Decimal("0.50")
    balance = _balance_for(
        db, principal.tenant_id, item.employee_id, item.leave_type_id
    )
    if balance is not None:
        if item.status == "approved":
            balance.consumed = max(Decimal("0"), balance.consumed - days)
        else:
            balance.pending = max(Decimal("0"), balance.pending - days)
        balance.version += 1
        db.add(balance)
    db.add(
        LeaveLedger(
            tenant_id=principal.tenant_id,
            request_id=item.id,
            employee_id=item.employee_id,
            leave_type_id=item.leave_type_id,
            entry_type="release",
            days=days,
            created_at=now,
        )
    )
    item.status = "cancelled"
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "leave.request.cancelled",
        target_type="leave_request",
        target_id=item.id,
        metadata={"reason": payload.reason},
    )
    db.commit()
    return LeaveRequestOut.model_validate(item)
