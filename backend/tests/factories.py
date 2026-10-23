from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import (
    EmployeeProfile,
    MembershipRole,
    Organization,
    Role,
    TenantMembership,
    User,
)
from app.db.session import SessionLocal

TEST_PASSWORD = "LocalDevOnly!123"
_PASSWORD_HASH = hash_password(TEST_PASSWORD)


def create_tenant_user(
    *,
    email: str,
    role_code: str = "employee",
    tenant_slug: str = "other",
    with_employee: bool = False,
) -> dict[str, uuid.UUID]:
    """Create an isolated tenant/user without going through privileged APIs."""
    with SessionLocal() as db:
        org = db.scalar(select(Organization).where(Organization.slug == tenant_slug))
        if org is None:
            org = Organization(
                name=f"Tenant {tenant_slug}",
                slug=tenant_slug,
                status="active",
                default_locale="en",
                timezone="Asia/Kolkata",
                settings={},
            )
            db.add(org)
            db.flush()
        user = User(
            email=email.lower(),
            full_name=email.split("@")[0],
            password_hash=_PASSWORD_HASH,
            user_type="internal",
            status="active",
            locale="en",
            timezone="Asia/Kolkata",
        )
        db.add(user)
        db.flush()
        membership = TenantMembership(
            tenant_id=org.id, user_id=user.id, status="active"
        )
        db.add(membership)
        db.flush()
        role = db.scalar(select(Role).where(Role.code == role_code))
        assert role is not None, f"Unknown role {role_code}"
        db.add(MembershipRole(membership_id=membership.id, role_id=role.id, scope={}))
        employee_id = None
        if with_employee:
            employee = EmployeeProfile(
                tenant_id=org.id,
                user_id=user.id,
                employee_number=f"TEST-{uuid.uuid4().hex[:8]}",
                join_date=date.today(),
                status="active",
                job_title="Test Employee",
            )
            db.add(employee)
            db.flush()
            employee_id = employee.id
        db.commit()
        return {
            "tenant_id": org.id,
            "user_id": user.id,
            "membership_id": membership.id,
            "employee_id": employee_id,
        }


def add_role_to_existing_member(email: str, role_code: str) -> uuid.UUID:
    """Add a role to a seeded demo user, optionally without an employee profile."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email.lower()))
        assert user is not None
        membership = db.scalar(
            select(TenantMembership).where(TenantMembership.user_id == user.id)
        )
        assert membership is not None
        role = db.scalar(select(Role).where(Role.code == role_code))
        assert role is not None
        existing = db.scalar(
            select(MembershipRole).where(
                MembershipRole.membership_id == membership.id,
                MembershipRole.role_id == role.id,
            )
        )
        if existing is None:
            db.add(
                MembershipRole(
                    membership_id=membership.id, role_id=role.id, scope={}
                )
            )
        db.commit()
        return membership.id
