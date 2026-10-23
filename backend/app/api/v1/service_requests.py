from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import (
    DbSession,
    get_principal,
    require_internal_permission,
)
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, conflict, forbidden, invalid_state, not_found
from app.db.models import (
    Document,
    HRServiceRequest,
    HRServiceRequestAttachment,
    HRServiceRequestComment,
    ServiceCatalogItem,
    TenantMembership,
)
from app.domains.audit import write_audit, write_outbox
from app.domains.idempotency import begin, complete
from app.domains.identity import Principal

router = APIRouter(tags=["HR service requests"])
IdempotencyHeader = Annotated[str, Header(alias="Idempotency-Key")]

VALID_STATUS = {
    "open",
    "in_progress",
    "waiting_on_requester",
    "resolved",
    "closed",
    "cancelled",
}
ALLOWED_TRANSITIONS = {
    "open": {"in_progress", "waiting_on_requester", "resolved", "cancelled"},
    "in_progress": {"waiting_on_requester", "resolved", "cancelled"},
    "waiting_on_requester": {"in_progress", "resolved", "cancelled"},
    "resolved": {"closed", "in_progress"},
    "closed": set(),
    "cancelled": set(),
}


class CatalogOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_hi: str | None
    description: str | None
    form_schema: dict
    sla_hours: int
    queue_code: str


class ServiceRequestCreate(BaseModel):
    catalog_item_id: uuid.UUID
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=10_000)
    form_data: dict = Field(default_factory=dict)
    priority: str = "normal"


class ServiceRequestUpdate(BaseModel):
    status: str | None = None
    assignee_user_id: uuid.UUID | None = None
    priority: str | None = None


class ServiceRequestOut(ORMModel):
    id: uuid.UUID
    catalog_item_id: uuid.UUID
    requester_user_id: uuid.UUID
    assignee_user_id: uuid.UUID | None
    subject: str
    description: str
    form_data: dict
    priority: str
    status: str
    sla_due_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    visibility: str = "requester"


class CommentOut(ORMModel):
    id: uuid.UUID
    request_id: uuid.UUID
    author_user_id: uuid.UUID
    body: str
    visibility: str
    created_at: datetime


class AttachmentIn(BaseModel):
    document_id: uuid.UUID


class AttachmentOut(ORMModel):
    id: uuid.UUID
    request_id: uuid.UUID
    document_id: uuid.UUID
    created_at: datetime


def _load_request(db: Session, principal: Principal, request_id: uuid.UUID) -> HRServiceRequest:
    item = db.scalar(
        select(HRServiceRequest).where(
            HRServiceRequest.id == request_id,
            HRServiceRequest.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("service request")
    can_see_queue = "service_request.read_queue" in principal.permissions
    can_see_own = "service_request.read_own" in principal.permissions
    if not can_see_queue:
        if not can_see_own or (
            item.requester_user_id != principal.user_id
            and item.assignee_user_id != principal.user_id
        ):
            raise not_found("service request")
    return item


@router.get("/service-catalog", response_model=list[CatalogOut])
def list_catalog(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("service_request.create")),
) -> list[CatalogOut]:
    items = list(
        db.scalars(
            select(ServiceCatalogItem)
            .where(
                ServiceCatalogItem.tenant_id == principal.tenant_id,
                ServiceCatalogItem.active.is_(True),
            )
            .order_by(ServiceCatalogItem.name_en)
        )
    )
    return [CatalogOut.model_validate(item) for item in items]


@router.get("/service-requests", response_model=Page[ServiceRequestOut])
def list_requests(
    db: DbSession,
    principal: Principal = Depends(get_principal),
    limit: int = 20,
    offset: int = 0,
    request_status: str | None = None,
) -> Page[ServiceRequestOut]:
    if principal.membership is None:
        raise forbidden("Organization member access is required.")
    limit = max(1, min(limit, 100))
    stmt = select(HRServiceRequest).where(
        HRServiceRequest.tenant_id == principal.tenant_id
    )
    if "service_request.read_queue" not in principal.permissions:
        if "service_request.read_own" not in principal.permissions:
            raise forbidden("Missing permission: service_request.read_own.")
        stmt = stmt.where(
            or_(
                HRServiceRequest.requester_user_id == principal.user_id,
                HRServiceRequest.assignee_user_id == principal.user_id,
            )
        )
    if request_status:
        stmt = stmt.where(HRServiceRequest.status == request_status)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(HRServiceRequest.created_at.desc()).limit(limit).offset(offset)
        )
    )
    return Page(
        items=[ServiceRequestOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/service-requests",
    response_model=ServiceRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_request(
    payload: ServiceRequestCreate,
    response: Response,
    idempotency_key: IdempotencyHeader,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("service_request.create")),
) -> ServiceRequestOut:
    state = begin(
        db,
        principal,
        "POST /api/v1/service-requests",
        idempotency_key,
        payload.model_dump(mode="json"),
    )
    if state.replay:
        response.status_code = state.record.response_status or 200
        return ServiceRequestOut.model_validate(state.record.response_body)

    catalog = db.scalar(
        select(ServiceCatalogItem).where(
            ServiceCatalogItem.id == payload.catalog_item_id,
            ServiceCatalogItem.tenant_id == principal.tenant_id,
            ServiceCatalogItem.active.is_(True),
        )
    )
    if catalog is None:
        raise not_found("service catalog item")
    if payload.priority not in {"low", "normal", "high", "urgent"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid priority.")
    required = catalog.form_schema.get("required", []) if catalog.form_schema else []
    missing = [field for field in required if field not in payload.form_data]
    if missing:
        raise AppError(
            422,
            "business_rule_violation",
            "service_request.errors.required_fields",
            "Required catalog fields are missing.",
            details=[
                {
                    "field": f"form_data.{field}",
                    "code": "required",
                    "message_key": "errors.required",
                }
                for field in missing
            ],
        )
    now = datetime.now(UTC)
    item = HRServiceRequest(
        tenant_id=principal.tenant_id,
        catalog_item_id=catalog.id,
        requester_user_id=principal.user_id,
        subject=payload.subject.strip(),
        description=payload.description.strip(),
        form_data=payload.form_data,
        priority=payload.priority,
        status="open",
        sla_due_at=now + timedelta(hours=catalog.sla_hours),
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        principal,
        "service_request.created",
        target_type="hr_service_request",
        target_id=item.id,
        metadata={"catalog_code": catalog.code},
    )
    write_outbox(
        db,
        principal.tenant_id,
        "service_request.created",
        "hr_service_request",
        item.id,
        {"requester_user_id": str(principal.user_id)},
    )
    body = ServiceRequestOut.model_validate(item).model_dump(mode="json")
    complete(
        db,
        state,
        status_code=201,
        body=body,
        resource_type="hr_service_request",
        resource_id=item.id,
    )
    db.commit()
    return ServiceRequestOut.model_validate(body)


@router.get("/service-requests/{request_id}", response_model=ServiceRequestOut)
def get_request(
    request_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> ServiceRequestOut:
    return ServiceRequestOut.model_validate(_load_request(db, principal, request_id))


@router.patch("/service-requests/{request_id}", response_model=ServiceRequestOut)
def update_request(
    request_id: uuid.UUID,
    payload: ServiceRequestUpdate,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("service_request.update_assigned")
    ),
) -> ServiceRequestOut:
    item = _load_request(db, principal, request_id)
    now = datetime.now(UTC)
    if payload.status is not None:
        if payload.status not in VALID_STATUS:
            raise AppError(422, "validation_error", "errors.validation", "Invalid status.")
        if payload.status not in ALLOWED_TRANSITIONS[item.status]:
            raise invalid_state()
        item.status = payload.status
        if payload.status == "resolved":
            item.resolved_at = now
        elif payload.status == "closed":
            item.closed_at = now
    if payload.assignee_user_id is not None:
        membership = db.scalar(
            select(TenantMembership).where(
                TenantMembership.tenant_id == principal.tenant_id,
                TenantMembership.user_id == payload.assignee_user_id,
                TenantMembership.status == "active",
            )
        )
        if membership is None:
            raise AppError(
                422,
                "business_rule_violation",
                "service_request.errors.assignee_not_member",
                "The assignee is not an active member of this organization.",
            )
        item.assignee_user_id = payload.assignee_user_id
        item.status = "in_progress" if item.status == "open" else item.status
    if payload.priority is not None:
        if payload.priority not in {"low", "normal", "high", "urgent"}:
            raise AppError(422, "validation_error", "errors.validation", "Invalid priority.")
        item.priority = payload.priority
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "service_request.status_changed",
        target_type="hr_service_request",
        target_id=item.id,
        metadata={"status": item.status},
    )
    write_outbox(
        db,
        principal.tenant_id,
        "service_request.updated",
        "hr_service_request",
        item.id,
        {"status": item.status, "requester_user_id": str(item.requester_user_id)},
    )
    db.commit()
    return ServiceRequestOut.model_validate(item)


@router.get("/service-requests/{request_id}/comments", response_model=list[CommentOut])
def list_comments(
    request_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> list[CommentOut]:
    item = _load_request(db, principal, request_id)
    stmt = select(HRServiceRequestComment).where(
        HRServiceRequestComment.request_id == item.id
    )
    if "service_request.update_assigned" not in principal.permissions:
        stmt = stmt.where(HRServiceRequestComment.visibility == "requester")
    rows = list(
        db.scalars(stmt.order_by(HRServiceRequestComment.created_at.asc()))
    )
    return [CommentOut.model_validate(row) for row in rows]


@router.post(
    "/service-requests/{request_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
)
def add_comment(
    request_id: uuid.UUID,
    payload: CommentIn,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> CommentOut:
    item = _load_request(db, principal, request_id)
    if payload.visibility not in {"requester", "internal"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid visibility.")
    if payload.visibility == "internal":
        if "service_request.update_assigned" not in principal.permissions:
            raise forbidden("Internal notes require an HR queue role.")
    elif item.requester_user_id != principal.user_id and (
        "service_request.update_assigned" not in principal.permissions
    ):
        raise forbidden("You cannot comment on this request.")
    comment = HRServiceRequestComment(
        tenant_id=principal.tenant_id,
        request_id=item.id,
        author_user_id=principal.user_id,
        body=payload.body.strip(),
        visibility=payload.visibility,
        created_at=datetime.now(UTC),
    )
    db.add(comment)
    write_audit(
        db,
        principal,
        "service_request.comment_added",
        target_type="hr_service_request",
        target_id=item.id,
        metadata={"visibility": payload.visibility},
    )
    db.commit()
    return CommentOut.model_validate(comment)


@router.post(
    "/service-requests/{request_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
def add_attachment(
    request_id: uuid.UUID,
    payload: AttachmentIn,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> AttachmentOut:
    item = _load_request(db, principal, request_id)
    if (
        item.requester_user_id != principal.user_id
        and "service_request.update_assigned" not in principal.permissions
    ):
        raise forbidden("You cannot attach documents to this request.")
    document = db.scalar(
        select(Document).where(
            Document.id == payload.document_id,
            Document.tenant_id == principal.tenant_id,
        )
    )
    if document is None:
        raise not_found("document")
    if document.uploaded_by != principal.user_id and (
        "service_request.update_assigned" not in principal.permissions
    ):
        raise forbidden("You cannot attach another user's document.")
    if document.scan_status in {"infected", "failed"}:
        raise AppError(
            422,
            "business_rule_violation",
            "documents.errors.scan_failed",
            "This document failed the security scan and cannot be attached.",
        )
    duplicate = db.scalar(
        select(HRServiceRequestAttachment).where(
            HRServiceRequestAttachment.request_id == item.id,
            HRServiceRequestAttachment.document_id == document.id,
        )
    )
    if duplicate is not None:
        raise conflict("duplicate_attachment", "This document is already attached.")
    attachment = HRServiceRequestAttachment(
        tenant_id=principal.tenant_id,
        request_id=item.id,
        document_id=document.id,
        created_at=datetime.now(UTC),
    )
    db.add(attachment)
    write_audit(
        db,
        principal,
        "service_request.attachment_added",
        target_type="hr_service_request",
        target_id=item.id,
        metadata={"document_id": str(payload.document_id)},
    )
    db.commit()
    return AttachmentOut.model_validate(attachment)
