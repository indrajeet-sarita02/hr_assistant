from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.api.deps import DbSession, require_internal_permission
from app.api.v1.schemas.common import ORMModel
from app.core.errors import AppError, forbidden, not_found
from app.db.models import (
    Application,
    HRServiceRequest,
    LeaveRequest,
    OnboardingCase,
    ReportExport,
)
from app.domains.audit import write_audit
from app.domains.idempotency import begin, complete
from app.domains.identity import Principal

router = APIRouter(tags=["Reports"])
IdempotencyHeader = Annotated[str, Header(alias="Idempotency-Key")]

ALLOWED_REPORT_FIELDS = {
    "hr_summary": {
        "leave_request_id",
        "employee_id",
        "leave_type",
        "status",
        "start_at",
        "end_at",
    },
    "service_queue": {
        "request_id",
        "subject",
        "priority",
        "status",
        "sla_due_at",
        "assignee_user_id",
    },
}


class SummaryOut(BaseModel):
    leave_pending: int
    service_open: int
    onboarding_active: int
    applications_active: int
    generated_at: datetime


class ExportIn(BaseModel):
    report_type: str
    filters: dict = Field(default_factory=dict)
    fields: list[str] = Field(default_factory=list)


class ExportOut(ORMModel):
    id: uuid.UUID
    report_type: str
    filters: dict
    requested_fields: list
    status: str
    expires_at: datetime | None
    error_code: str | None
    created_at: datetime
    completed_at: datetime | None


@router.get("/reports/hr/summary", response_model=SummaryOut)
def hr_summary(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("report.read")),
) -> SummaryOut:
    tenant_id = principal.tenant_id
    leave_pending = db.scalar(
        select(func.count())
        .select_from(LeaveRequest)
        .where(
            LeaveRequest.tenant_id == tenant_id,
            LeaveRequest.status.in_(["pending", "needs_clarification"]),
        )
    )
    service_open = db.scalar(
        select(func.count())
        .select_from(HRServiceRequest)
        .where(
            HRServiceRequest.tenant_id == tenant_id,
            HRServiceRequest.status.in_(["open", "in_progress", "waiting_on_requester"]),
        )
    )
    onboarding_active = db.scalar(
        select(func.count())
        .select_from(OnboardingCase)
        .where(
            OnboardingCase.tenant_id == tenant_id,
            OnboardingCase.status == "active",
        )
    )
    applications_active = db.scalar(
        select(func.count())
        .select_from(Application)
        .where(Application.tenant_id == tenant_id, Application.status == "active")
    )
    return SummaryOut(
        leave_pending=leave_pending or 0,
        service_open=service_open or 0,
        onboarding_active=onboarding_active or 0,
        applications_active=applications_active or 0,
        generated_at=datetime.now(UTC),
    )


@router.post(
    "/reports/hr/exports", response_model=ExportOut, status_code=status.HTTP_202_ACCEPTED
)
def request_export(
    payload: ExportIn,
    response: Response,
    idempotency_key: IdempotencyHeader,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("report.export")),
) -> ExportOut:
    state = begin(
        db,
        principal,
        "POST /api/v1/reports/hr/exports",
        idempotency_key,
        payload.model_dump(mode="json"),
    )
    if state.replay:
        response.status_code = state.record.response_status or 202
        return ExportOut.model_validate(state.record.response_body)
    if payload.report_type not in ALLOWED_REPORT_FIELDS:
        raise AppError(422, "validation_error", "errors.validation", "Unknown report type.")
    allowed = ALLOWED_REPORT_FIELDS[payload.report_type]
    unknown = sorted(set(payload.fields) - allowed)
    if unknown:
        raise AppError(
            422,
            "business_rule_violation",
            "reports.errors.fields_not_allowed",
            "One or more requested fields are not exportable.",
            details=[
                {
                    "field": "fields",
                    "code": "not_allowed",
                    "message_key": "reports.errors.fields_not_allowed",
                }
            ],
        )
    active = db.scalar(
        select(func.count())
        .select_from(ReportExport)
        .where(
            ReportExport.tenant_id == principal.tenant_id,
            ReportExport.requester_user_id == principal.user_id,
            ReportExport.status.in_(["queued", "running"]),
        )
    )
    if (active or 0) >= 3:
        raise AppError(
            429,
            "rate_limited",
            "errors.rate_limited",
            "Too many active exports. Wait for one to finish.",
            retryable=True,
            headers={"Retry-After": "30"},
        )
    item = ReportExport(
        tenant_id=principal.tenant_id,
        requester_user_id=principal.user_id,
        report_type=payload.report_type,
        filters=payload.filters,
        requested_fields=payload.fields,
        status="queued",
        created_at=datetime.now(UTC),
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        principal,
        "report.export.requested",
        target_type="report_export",
        target_id=item.id,
        metadata={"report_type": payload.report_type},
    )
    body = ExportOut.model_validate(item).model_dump(mode="json")
    complete(
        db,
        state,
        status_code=202,
        body=body,
        resource_type="report_export",
        resource_id=item.id,
    )
    db.commit()
    return ExportOut.model_validate(body)


@router.get("/reports/exports/{export_id}", response_model=ExportOut)
def get_export(
    export_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("report.export")),
) -> ExportOut:
    item = db.scalar(
        select(ReportExport).where(
            ReportExport.id == export_id,
            ReportExport.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("export")
    if (
        item.requester_user_id != principal.user_id
        and "report.export" not in principal.permissions
    ):
        raise forbidden("You cannot access this export.")
    return ExportOut.model_validate(item)
