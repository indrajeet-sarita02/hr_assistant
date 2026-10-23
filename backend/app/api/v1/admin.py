from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession, require_internal_permission
from app.api.pagination import count_rows
from app.api.v1.schemas.auth import UserOut
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, conflict, forbidden, not_found
from app.core.security import hash_password
from app.db.models import (
    AuditEvent,
    ContentReport,
    LeaveType,
    MembershipRole,
    Organization,
    Permission,
    Role,
    RolePermission,
    ServiceCatalogItem,
    TenantMembership,
    User,
)
from app.domains.audit import write_audit
from app.domains.identity import Principal

router = APIRouter(prefix="/admin", tags=["Administration"])


class RoleOut(ORMModel):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    is_system: bool


class RoleDetailOut(RoleOut):
    permissions: list[str] = Field(default_factory=list)


class MembershipOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    created_at: datetime
    user: UserOut | None = None
    roles: list[str] = Field(default_factory=list)


class MembershipIn(BaseModel):
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=200)
    temporary_password: str | None = Field(default=None, min_length=12, max_length=128)
    role_ids: list[uuid.UUID] = Field(default_factory=list)


class MembershipPatch(BaseModel):
    status: str


class RolesIn(BaseModel):
    role_ids: list[uuid.UUID]


class SettingsOut(BaseModel):
    name: str
    default_locale: str
    timezone: str
    settings: dict
    version: int


class SettingsIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    default_locale: str | None = None
    timezone: str | None = None
    settings: dict | None = None


class LeaveTypeIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name_en: str = Field(min_length=1, max_length=120)
    name_hi: str | None = Field(default=None, max_length=120)
    unit: str = "days"
    requires_approval: bool = True
    allow_half_day: bool = False
    active: bool = True


class LeaveTypeAdminOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_hi: str | None
    unit: str
    requires_approval: bool
    allow_half_day: bool
    active: bool
    version: int


class CatalogIn(BaseModel):
    code: str = Field(min_length=2, max_length=60)
    name_en: str = Field(min_length=1, max_length=160)
    name_hi: str | None = Field(default=None, max_length=160)
    description: str | None = None
    form_schema: dict = Field(default_factory=dict)
    sla_hours: int = Field(default=24, ge=1, le=720)
    queue_code: str = "hr"
    active: bool = True


class CatalogAdminOut(ORMModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_hi: str | None
    description: str | None
    form_schema: dict
    sla_hours: int
    queue_code: str
    active: bool
    version: int


class AuditOut(ORMModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    actor_type: str
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    outcome: str
    request_id: str | None
    metadata_json: dict
    occurred_at: datetime


class ContentReportAdminOut(ORMModel):
    id: uuid.UUID
    content_type: str
    content_id: uuid.UUID
    reason_category: str
    comment: str | None
    status: str
    resolution: str | None
    created_at: datetime


class ContentReportPatch(BaseModel):
    status: str
    resolution: str | None = Field(default=None, max_length=2000)


def _role_permissions(db: Session, role_id: uuid.UUID) -> frozenset[str]:
    return frozenset(
        db.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
        )
    )


@router.get("/roles", response_model=list[RoleDetailOut])
def list_roles(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.membership.manage")),
) -> list[RoleDetailOut]:
    roles = list(db.scalars(select(Role).order_by(Role.code)))
    return [
        RoleDetailOut(
            **RoleOut.model_validate(role).model_dump(),
            permissions=sorted(_role_permissions(db, role.id)),
        )
        for role in roles
    ]


@router.get("/memberships", response_model=Page[MembershipOut])
def list_memberships(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.membership.manage")),
    limit: int = 20,
    offset: int = 0,
) -> Page[MembershipOut]:
    stmt = select(TenantMembership).where(
        TenantMembership.tenant_id == principal.tenant_id
    )
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(TenantMembership.created_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    items = []
    for membership in rows:
        user = db.get(User, membership.user_id)
        role_codes = list(
            db.scalars(
                select(Role.code)
                .join(MembershipRole, MembershipRole.role_id == Role.id)
                .where(MembershipRole.membership_id == membership.id)
            )
        )
        items.append(
            MembershipOut(
                **MembershipOut.model_validate(membership).model_dump(
                    exclude={"user", "roles"}
                ),
                user=UserOut.model_validate(user) if user else None,
                roles=role_codes,
            )
        )
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/memberships", response_model=MembershipOut, status_code=status.HTTP_201_CREATED
)
def add_membership(
    payload: MembershipIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.membership.manage")),
) -> MembershipOut:
    roles = list(db.scalars(select(Role).where(Role.id.in_(payload.role_ids))))
    if len(roles) != len(set(payload.role_ids)):
        raise not_found("role")
    for role in roles:
        missing = _role_permissions(db, role.id) - principal.permissions
        if missing:
            raise forbidden("You cannot grant a role with permissions you do not hold.")
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None:
        if not payload.temporary_password:
            raise AppError(
                422,
                "business_rule_violation",
                "admin.errors.user_provisioning_required",
                (
                    "Existing users can be added. New internal users require the "
                    "approved provisioning flow."
                ),
            )
        user = User(
            email=str(payload.email).lower(),
            full_name=payload.full_name or str(payload.email).split("@")[0],
            password_hash=hash_password(payload.temporary_password),
            user_type="internal",
            status="active",
            locale=principal.tenant.default_locale,
            timezone=principal.tenant.timezone,
        )
        db.add(user)
        db.flush()
    elif user.user_type != "internal":
        raise AppError(
            409,
            "conflict",
            "admin.errors.account_separation",
            (
                "A public career account cannot be linked to an employee membership "
                "without the audited provisioning flow."
            ),
        )
    existing = db.scalar(
        select(TenantMembership).where(
            TenantMembership.tenant_id == principal.tenant_id,
            TenantMembership.user_id == user.id,
        )
    )
    if existing is not None:
        raise conflict("conflict", "The user is already a member of this organization.")
    membership = TenantMembership(
        tenant_id=principal.tenant_id,
        user_id=user.id,
        status="active",
    )
    db.add(membership)
    db.flush()
    for role in roles:
        db.add(MembershipRole(membership_id=membership.id, role_id=role.id, scope={}))
    write_audit(
        db,
        principal,
        "membership.created",
        target_type="tenant_membership",
        target_id=membership.id,
        metadata={"role_ids": [str(role.id) for role in roles]},
    )
    db.commit()
    return MembershipOut(
        **MembershipOut.model_validate(membership).model_dump(exclude={"user", "roles"}),
        user=UserOut.model_validate(user),
        roles=[role.code for role in roles],
    )


@router.patch("/memberships/{membership_id}", response_model=MembershipOut)
def update_membership(
    membership_id: uuid.UUID,
    payload: MembershipPatch,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.membership.manage")),
) -> MembershipOut:
    if payload.status not in {"active", "disabled"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid status.")
    membership = db.scalar(
        select(TenantMembership).where(
            TenantMembership.id == membership_id,
            TenantMembership.tenant_id == principal.tenant_id,
        )
    )
    if membership is None:
        raise not_found("membership")
    if membership.id == principal.membership.id and payload.status == "disabled":
        raise forbidden("You cannot disable your own membership.")
    membership.status = payload.status
    db.add(membership)
    write_audit(
        db,
        principal,
        "membership.disabled" if payload.status == "disabled" else "membership.enabled",
        target_type="tenant_membership",
        target_id=membership.id,
    )
    db.commit()
    user = db.get(User, membership.user_id)
    role_codes = list(
        db.scalars(
            select(Role.code)
            .join(MembershipRole, MembershipRole.role_id == Role.id)
            .where(MembershipRole.membership_id == membership.id)
        )
    )
    return MembershipOut(
        **MembershipOut.model_validate(membership).model_dump(exclude={"user", "roles"}),
        user=UserOut.model_validate(user) if user else None,
        roles=role_codes,
    )


@router.put("/memberships/{membership_id}/roles", response_model=MembershipOut)
def set_roles(
    membership_id: uuid.UUID,
    payload: RolesIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.membership.manage")),
) -> MembershipOut:
    membership = db.scalar(
        select(TenantMembership).where(
            TenantMembership.id == membership_id,
            TenantMembership.tenant_id == principal.tenant_id,
        )
    )
    if membership is None:
        raise not_found("membership")
    roles = list(db.scalars(select(Role).where(Role.id.in_(payload.role_ids))))
    if len(roles) != len(set(payload.role_ids)):
        raise not_found("role")
    for role in roles:
        missing = _role_permissions(db, role.id) - principal.permissions
        if missing:
            raise forbidden("You cannot grant a role with permissions you do not hold.")
    current_role_ids = set(
        db.scalars(
            select(MembershipRole.role_id).where(
                MembershipRole.membership_id == membership.id
            )
        )
    )
    if membership.id == principal.membership.id:
        admin_role = db.scalar(select(Role).where(Role.code == "tenant_admin"))
        if admin_role and admin_role.id in current_role_ids and admin_role.id not in set(
            payload.role_ids
        ):
            other_admins = db.scalar(
                select(TenantMembership.id)
                .join(MembershipRole, MembershipRole.membership_id == TenantMembership.id)
                .where(
                    TenantMembership.tenant_id == principal.tenant_id,
                    TenantMembership.id != membership.id,
                    TenantMembership.status == "active",
                    MembershipRole.role_id == admin_role.id,
                )
                .limit(1)
            )
            if other_admins is None:
                raise forbidden("The organization must retain at least one active administrator.")
    for role_id in current_role_ids - set(payload.role_ids):
        row = db.get(MembershipRole, (membership.id, role_id))
        if row:
            db.delete(row)
    for role_id in set(payload.role_ids) - current_role_ids:
        db.add(MembershipRole(membership_id=membership.id, role_id=role_id, scope={}))
    write_audit(
        db,
        principal,
        "role.granted",
        target_type="tenant_membership",
        target_id=membership.id,
        metadata={
            "before": [str(item) for item in current_role_ids],
            "after": [str(item) for item in payload.role_ids],
        },
    )
    db.commit()
    user = db.get(User, membership.user_id)
    return MembershipOut(
        **MembershipOut.model_validate(membership).model_dump(exclude={"user", "roles"}),
        user=UserOut.model_validate(user) if user else None,
        roles=[role.code for role in roles],
    )


@router.get("/settings", response_model=SettingsOut)
def get_settings(
    principal: Principal = Depends(require_internal_permission("admin.settings.manage")),
) -> SettingsOut:
    tenant = principal.tenant
    return SettingsOut(
        name=tenant.name,
        default_locale=tenant.default_locale,
        timezone=tenant.timezone,
        settings=tenant.settings,
        version=1,
    )


@router.patch("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.settings.manage")),
) -> SettingsOut:
    tenant = db.get(Organization, principal.tenant_id)
    if tenant is None:
        raise not_found("organization")
    if payload.default_locale is not None:
        if payload.default_locale not in {"en", "hi"}:
            raise AppError(422, "validation_error", "errors.validation", "Invalid locale.")
        tenant.default_locale = payload.default_locale
    if payload.name is not None:
        tenant.name = payload.name
    if payload.timezone is not None:
        tenant.timezone = payload.timezone
    if payload.settings is not None:
        tenant.settings = payload.settings
    db.add(tenant)
    write_audit(
        db,
        principal,
        "settings.updated",
        target_type="organization",
        target_id=tenant.id,
    )
    db.commit()
    return SettingsOut(
        name=tenant.name,
        default_locale=tenant.default_locale,
        timezone=tenant.timezone,
        settings=tenant.settings,
        version=1,
    )


@router.get("/leave-types", response_model=list[LeaveTypeAdminOut])
def admin_leave_types(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.type.manage")),
) -> list[LeaveTypeAdminOut]:
    return [
        LeaveTypeAdminOut.model_validate(item)
        for item in db.scalars(
            select(LeaveType).where(LeaveType.tenant_id == principal.tenant_id)
        )
    ]


@router.post(
    "/leave-types", response_model=LeaveTypeAdminOut, status_code=status.HTTP_201_CREATED
)
def create_leave_type(
    payload: LeaveTypeIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.type.manage")),
) -> LeaveTypeAdminOut:
    if payload.unit not in {"days", "hours"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid unit.")
    item = LeaveType(
        tenant_id=principal.tenant_id,
        code=payload.code,
        name_en=payload.name_en,
        name_hi=payload.name_hi,
        unit=payload.unit,
        requires_approval=payload.requires_approval,
        allow_half_day=payload.allow_half_day,
        active=payload.active,
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        principal,
        "workflow_rule.updated",
        target_type="leave_type",
        target_id=item.id,
    )
    db.commit()
    return LeaveTypeAdminOut.model_validate(item)


@router.patch("/leave-types/{leave_type_id}", response_model=LeaveTypeAdminOut)
def update_leave_type(
    leave_type_id: uuid.UUID,
    payload: LeaveTypeIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("leave.type.manage")),
) -> LeaveTypeAdminOut:
    item = db.scalar(
        select(LeaveType).where(
            LeaveType.id == leave_type_id,
            LeaveType.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("leave type")
    if payload.unit not in {"days", "hours"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid unit.")
    item.code = payload.code
    item.name_en = payload.name_en
    item.name_hi = payload.name_hi
    item.unit = payload.unit
    item.requires_approval = payload.requires_approval
    item.allow_half_day = payload.allow_half_day
    item.active = payload.active
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "workflow_rule.updated",
        target_type="leave_type",
        target_id=item.id,
    )
    db.commit()
    return LeaveTypeAdminOut.model_validate(item)


@router.get("/service-catalog", response_model=list[CatalogAdminOut])
def admin_catalog(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> list[CatalogAdminOut]:
    return [
        CatalogAdminOut.model_validate(item)
        for item in db.scalars(
            select(ServiceCatalogItem).where(
                ServiceCatalogItem.tenant_id == principal.tenant_id
            )
        )
    ]


@router.post(
    "/service-catalog", response_model=CatalogAdminOut, status_code=status.HTTP_201_CREATED
)
def create_catalog_item(
    payload: CatalogIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> CatalogAdminOut:
    item = ServiceCatalogItem(
        tenant_id=principal.tenant_id,
        code=payload.code,
        name_en=payload.name_en,
        name_hi=payload.name_hi,
        description=payload.description,
        form_schema=payload.form_schema,
        sla_hours=payload.sla_hours,
        queue_code=payload.queue_code,
        active=payload.active,
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        principal,
        "workflow_rule.updated",
        target_type="service_catalog_item",
        target_id=item.id,
    )
    db.commit()
    return CatalogAdminOut.model_validate(item)


@router.patch("/service-catalog/{item_id}", response_model=CatalogAdminOut)
def update_catalog_item(
    item_id: uuid.UUID,
    payload: CatalogIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("admin.workflow.manage")),
) -> CatalogAdminOut:
    item = db.scalar(
        select(ServiceCatalogItem).where(
            ServiceCatalogItem.id == item_id,
            ServiceCatalogItem.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("service catalog item")
    item.code = payload.code
    item.name_en = payload.name_en
    item.name_hi = payload.name_hi
    item.description = payload.description
    item.form_schema = payload.form_schema
    item.sla_hours = payload.sla_hours
    item.queue_code = payload.queue_code
    item.active = payload.active
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "workflow_rule.updated",
        target_type="service_catalog_item",
        target_id=item.id,
    )
    db.commit()
    return CatalogAdminOut.model_validate(item)


@router.get("/audit-events", response_model=Page[AuditOut])
def audit_events(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("audit.read")),
    action: str | None = None,
    target_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> Page[AuditOut]:
    stmt = select(AuditEvent).where(AuditEvent.tenant_id == principal.tenant_id)
    if action:
        stmt = stmt.where(AuditEvent.action == action)
    if target_type:
        stmt = stmt.where(AuditEvent.target_type == target_type)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(AuditEvent.occurred_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    write_audit(
        db,
        principal,
        "audit.read",
        target_type="audit_event",
        metadata={"filters": {"action": action, "target_type": target_type}},
    )
    db.commit()
    return Page(
        items=[AuditOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/content-reports", response_model=Page[ContentReportAdminOut])
def content_reports(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("content_report.triage")),
    limit: int = 20,
    offset: int = 0,
) -> Page[ContentReportAdminOut]:
    stmt = select(ContentReport)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(ContentReport.created_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[ContentReportAdminOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch("/content-reports/{report_id}", response_model=ContentReportAdminOut)
def triage_content_report(
    report_id: uuid.UUID,
    payload: ContentReportPatch,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("content_report.triage")),
) -> ContentReportAdminOut:
    if payload.status not in {"open", "triaged", "resolved", "rejected"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid status.")
    report = db.get(ContentReport, report_id)
    if report is None:
        raise not_found("content report")
    report.status = payload.status
    report.resolution = payload.resolution
    db.add(report)
    write_audit(
        db,
        principal,
        "content_report.resolved",
        target_type="content_report",
        target_id=report.id,
    )
    db.commit()
    return ContentReportAdminOut.model_validate(report)
