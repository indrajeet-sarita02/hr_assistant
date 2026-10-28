from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from app.db.models import LeaveType, Organization, Role
from tests.factories import create_tenant_user


def _leave_type_id(client, headers) -> str:
    response = client.get("/api/v1/leave/types", headers=headers)
    assert response.status_code == 200
    return next(item["id"] for item in response.json() if item["code"] == "CL")


def test_tenant_scoped_access_returns_not_found(client, login, db):
    employee = login("employee@example.com")
    leave_type_id = _leave_type_id(client, employee)
    created = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": "tenant-scope-leave"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": "2026-12-10T00:00:00+05:30",
            "end_at": "2026-12-11T00:00:00+05:30",
            "reason": "Tenant isolation test",
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]

    create_tenant_user(email="outsider@example.com", role_code="employee", tenant_slug="other")
    outsider = login("outsider@example.com")
    denied = client.get(f"/api/v1/leave/requests/{request_id}", headers=outsider)
    assert denied.status_code == 404

    catalog = client.get("/api/v1/service-catalog", headers=outsider)
    assert catalog.status_code == 200
    assert catalog.json() == []

    demo = db.scalar(select(Organization).where(Organization.slug == "demo"))
    wrong_header = client.get(
        "/api/v1/leave/requests",
        headers={**outsider, "X-Tenant-ID": str(demo.id)},
    )
    assert wrong_header.status_code == 403


def test_hr_without_employee_profile_can_list_leave(client, login):
    create_tenant_user(
        email="hr-no-profile@example.com",
        role_code="hr_executive",
        tenant_slug="demo",
        with_employee=False,
    )
    headers = login("hr-no-profile@example.com")
    response = client.get("/api/v1/leave/requests", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 0
    assert client.get("/api/v1/leave/balances", headers=headers).status_code == 422


def test_employee_cannot_read_another_employees_leave(client, login):
    employee = login("employee@example.com")
    employee2 = login("employee2@example.com")
    leave_type_id = _leave_type_id(client, employee)
    created = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": "idor-leave"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": "2026-12-15T00:00:00+05:30",
            "end_at": "2026-12-16T00:00:00+05:30",
        },
    )
    assert created.status_code == 201
    response = client.get(
        f"/api/v1/leave/requests/{created.json()['id']}", headers=employee2
    )
    assert response.status_code == 404


def test_leave_types_are_tenant_local(client, db):
    demo = db.scalar(select(Organization).where(Organization.slug == "demo"))
    count = len(
        list(
            db.scalars(
                select(LeaveType).where(LeaveType.tenant_id == demo.id)
            )
        )
    )
    assert count >= 3


def test_naive_leave_datetimes_are_rejected(client, login):
    headers = login("employee@example.com")
    leave_type_id = _leave_type_id(client, headers)
    response = client.post(
        "/api/v1/leave/requests",
        headers={**headers, "Idempotency-Key": "naive-leave"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": datetime(2026, 12, 20, 0, 0).isoformat(),
            "end_at": datetime(2026, 12, 21, 0, 0).isoformat(),
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_approval_rules_reject_approvers_from_other_tenants(client, login, db):
    admin = login("admin@example.com")
    outsider = create_tenant_user(
        email="other-approver@example.com",
        role_code="employee",
        tenant_slug="other",
    )
    outsider_role = Role(
        tenant_id=outsider["tenant_id"],
        code="other_tenant_approver",
        name="Other Tenant Approver",
    )
    db.add(outsider_role)
    db.commit()

    global_role = db.scalar(select(Role).where(Role.code == "approver"))
    assert global_role is not None
    valid_role = client.post(
        "/api/v1/admin/approval-rules",
        headers=admin,
        json={
            "code": "tenant-check-valid",
            "name": "Valid system-role approver",
            "effective_from": "2026-10-28",
            "steps": [
                {
                    "step_order": 1,
                    "approver_type": "role",
                    "approver_role_id": str(global_role.id),
                }
            ],
        },
    )
    assert valid_role.status_code == 201, valid_role.text

    foreign_approvers = (
        ("user", "approver_user_id", str(outsider["user_id"])),
        ("role", "approver_role_id", str(outsider_role.id)),
    )
    for index, (approver_type, field, value) in enumerate(foreign_approvers):
        response = client.post(
            "/api/v1/admin/approval-rules",
            headers=admin,
            json={
                "code": f"tenant-check-invalid-{index}",
                "name": "Cross-tenant approver",
                "effective_from": "2026-10-28",
                "steps": [{"step_order": 1, "approver_type": approver_type, field: value}],
            },
        )
        assert response.status_code == 404, response.text
        assert response.json()["error"]["code"] == "not_found"
