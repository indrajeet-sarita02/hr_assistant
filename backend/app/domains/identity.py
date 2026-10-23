from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import forbidden, unauthenticated
from app.core.security import audience_for_user_type, decode_token
from app.db.models import (
    MembershipRole,
    Organization,
    Permission,
    Role,
    RolePermission,
    TenantMembership,
    User,
    UserSession,
)

PUBLIC_PERMISSIONS = frozenset(
    {
        "assessment.attempt_own",
        "resume.manage_own",
        "content_report.create",
        "notification.read_own",
        "hr_assistant.feedback",
    }
)


@dataclass(slots=True)
class Principal:
    user: User
    session: UserSession
    audience: str
    membership: TenantMembership | None = None
    tenant: Organization | None = None
    roles: tuple[str, ...] = field(default_factory=tuple)
    permissions: frozenset[str] = field(default_factory=frozenset)

    @property
    def user_id(self) -> uuid.UUID:
        return self.user.id

    @property
    def tenant_id(self) -> uuid.UUID | None:
        return self.membership.tenant_id if self.membership else None

    @property
    def is_internal(self) -> bool:
        return self.user.user_type == "internal"

    @property
    def is_public(self) -> bool:
        return self.user.user_type == "public"

    def require_permission(self, code: str) -> None:
        if code not in self.permissions:
            raise forbidden(f"Missing permission: {code}.")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def load_principal(
    db: Session, token: str, requested_tenant_id: str | None = None
) -> Principal:
    payload = decode_token(token, expected_type="access")
    try:
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (KeyError, ValueError) as exc:
        raise unauthenticated("The supplied token is malformed.") from exc

    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise unauthenticated("The account is not active.")

    session = db.get(UserSession, session_id)
    now = datetime.now(UTC)
    if session is None or session.user_id != user.id:
        raise unauthenticated("The session no longer exists.")
    if session.revoked_at is not None or session.expires_at <= now:
        raise unauthenticated("The session has expired or was revoked.")
    if payload.get("aud") != audience_for_user_type(user.user_type):
        raise unauthenticated("The token audience does not match this account type.")

    if user.user_type == "public":
        return Principal(
            user=user,
            session=session,
            audience=payload["aud"],
            permissions=PUBLIC_PERMISSIONS,
        )

    statement = select(TenantMembership).where(
        TenantMembership.user_id == user.id,
        TenantMembership.status == "active",
    )
    memberships = list(db.scalars(statement))
    if not memberships:
        raise forbidden("No active organization membership was found.")

    membership: TenantMembership | None = None
    if requested_tenant_id:
        try:
            requested_uuid = uuid.UUID(requested_tenant_id)
        except ValueError as exc:
            raise forbidden("The requested tenant is invalid.") from exc
        membership = next(
            (item for item in memberships if item.tenant_id == requested_uuid), None
        )
        if membership is None:
            raise forbidden("You are not a member of the requested organization.")
    else:
        membership = memberships[0]

    tenant = db.get(Organization, membership.tenant_id)
    if tenant is None or tenant.status != "active":
        raise forbidden("The organization is not active.")

    role_rows = db.execute(
        select(Role.code)
        .join(MembershipRole, MembershipRole.role_id == Role.id)
        .where(MembershipRole.membership_id == membership.id)
    ).scalars()
    permission_rows = db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(MembershipRole, MembershipRole.role_id == RolePermission.role_id)
        .where(MembershipRole.membership_id == membership.id)
    ).scalars()

    return Principal(
        user=user,
        session=session,
        audience=payload["aud"],
        membership=membership,
        tenant=tenant,
        roles=tuple(sorted(set(role_rows))),
        permissions=frozenset(permission_rows),
    )


def effective_permissions(db: Session, membership_id: uuid.UUID) -> frozenset[str]:
    rows = db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(MembershipRole, MembershipRole.role_id == RolePermission.role_id)
        .where(MembershipRole.membership_id == membership_id)
    ).scalars()
    return frozenset(rows)


def get_membership_for_tenant(
    db: Session, user_id: uuid.UUID, tenant_id: uuid.UUID
) -> TenantMembership | None:
    return db.scalar(
        select(TenantMembership).where(
            TenantMembership.user_id == user_id,
            TenantMembership.tenant_id == tenant_id,
            TenantMembership.status == "active",
        )
    )


def assert_internal(principal: Principal) -> None:
    if not principal.is_internal or principal.membership is None:
        raise forbidden("This endpoint is only available to organization members.")
    if settings.app_env == "test" and principal.tenant is None:
        raise forbidden("Tenant context is unavailable.")
