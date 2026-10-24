from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select

from app.db.models import (
    EmployeeProfile,
    IdempotencyKey,
    LeaveBalance,
    LeaveType,
    User,
)


def _leave_type(client, headers, code: str = "CL") -> str:
    response = client.get("/api/v1/leave/types", headers=headers)
    assert response.status_code == 200
    return next(item["id"] for item in response.json() if item["code"] == code)


def _balance(
    db, leave_type_id: str, email: str = "employee@example.com"
) -> LeaveBalance:
    db.expire_all()
    return db.scalar(
        select(LeaveBalance)
        .join(EmployeeProfile, EmployeeProfile.id == LeaveBalance.employee_id)
        .join(User, User.id == EmployeeProfile.user_id)
        .where(
            LeaveBalance.leave_type_id == leave_type_id,
            User.email == email,
        )
    )


def test_leave_submit_idempotency_and_approval(client, login, db):
    employee = login("employee@example.com")
    approver = login("approver@example.com")
    leave_type_id = _leave_type(client, employee)
    payload = {
        "leave_type_id": leave_type_id,
        "start_at": "2026-11-02T00:00:00+05:30",
        "end_at": "2026-11-03T00:00:00+05:30",
        "reason": "Family event",
    }
    key = "leave-flow-1"
    created = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": key},
        json=payload,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    assert _balance(db, leave_type_id).pending == Decimal("1.00")

    replay = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": key},
        json=payload,
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == request_id

    conflict = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": key},
        json={**payload, "reason": "Different payload"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "idempotency_conflict"

    record = db.scalar(
        select(IdempotencyKey).where(IdempotencyKey.key == key)
    )
    assert record is not None and record.status == "completed"

    approver_user = db.scalar(select(User).where(User.email == "approver@example.com"))
    assert created.json()["current_approver_user_id"] == str(approver_user.id)

    decision = client.post(
        f"/api/v1/leave/requests/{request_id}/decision",
        headers=approver,
        json={"decision": "approved", "comment": "Approved"},
    )
    assert decision.status_code == 200, decision.text

    balance = _balance(db, leave_type_id)
    assert balance.pending == Decimal("0.00")
    assert balance.consumed == Decimal("1.00")


def test_leave_self_approval_and_cross_approver_are_blocked(client, login, db):
    employee = login("employee@example.com")
    leave_type_id = _leave_type(client, employee)
    created = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": "leave-self"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": "2026-11-10T00:00:00+05:30",
            "end_at": "2026-11-11T00:00:00+05:30",
        },
    )
    assert created.status_code == 201
    request_id = created.json()["id"]

    # HR has decision permission but is not the assigned approver.
    hr = login("hr@example.com")
    not_assigned = client.post(
        f"/api/v1/leave/requests/{request_id}/decision",
        headers=hr,
        json={"decision": "approved"},
    )
    assert not_assigned.status_code == 403

    # The assigned approver can request clarification without consuming leave.
    approver = login("approver@example.com")
    clarify = client.post(
        f"/api/v1/leave/requests/{request_id}/decision",
        headers=approver,
        json={"decision": "needs_clarification", "comment": "Which dates?"},
    )
    assert clarify.status_code == 200
    assert _balance(db, leave_type_id).pending == Decimal("1.00")
    assert _balance(db, leave_type_id).consumed == Decimal("0.00")

    # An ordinary employee cannot decide.
    employee2 = login("employee2@example.com")
    denied = client.post(
        f"/api/v1/leave/requests/{request_id}/decision",
        headers=employee2,
        json={"decision": "approved"},
    )
    assert denied.status_code == 403


def test_leave_cancel_releases_reserved_balance(client, login, db):
    employee = login("employee@example.com")
    leave_type_id = _leave_type(client, employee)
    created = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": "leave-cancel"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": "2026-11-20T00:00:00+05:30",
            "end_at": "2026-11-21T00:00:00+05:30",
        },
    )
    assert created.status_code == 201
    cancelled = client.post(
        f"/api/v1/leave/requests/{created.json()['id']}/cancel",
        headers=employee,
        json={"reason": "Plans changed"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    balance = _balance(db, leave_type_id)
    assert balance.pending == Decimal("0.00")
    assert balance.consumed == Decimal("0.00")


def test_overlapping_leave_is_rejected(client, login):
    headers = login("employee@example.com")
    leave_type_id = _leave_type(client, headers)
    first = client.post(
        "/api/v1/leave/requests",
        headers={**headers, "Idempotency-Key": "overlap-1"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": "2026-11-25T00:00:00+05:30",
            "end_at": "2026-11-27T00:00:00+05:30",
        },
    )
    assert first.status_code == 201
    overlap = client.post(
        "/api/v1/leave/requests",
        headers={**headers, "Idempotency-Key": "overlap-2"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": "2026-11-26T00:00:00+05:30",
            "end_at": "2026-11-28T00:00:00+05:30",
        },
    )
    assert overlap.status_code == 409
    assert overlap.json()["error"]["code"] == "leave_overlap"


def test_leave_types_are_returned_for_employee(client, login, db):
    headers = login("employee@example.com")
    types = client.get("/api/v1/leave/types", headers=headers)
    assert types.status_code == 200
    assert {item["code"] for item in types.json()} == {"CL", "EL", "SL"}

    cl = db.scalar(select(LeaveType).where(LeaveType.code == "CL"))
    assert cl is not None


def test_leave_scope_filters(client, login):
    employee = login("employee@example.com")
    approver = login("approver@example.com")
    leave_type_id = _leave_type(client, employee)
    created = client.post(
        "/api/v1/leave/requests",
        headers={**employee, "Idempotency-Key": "leave-scope-1"},
        json={
            "leave_type_id": leave_type_id,
            "start_at": "2026-12-07T00:00:00+05:30",
            "end_at": "2026-12-08T00:00:00+05:30",
            "reason": "Scope filter check",
        },
    )
    assert created.status_code == 201, created.text

    own = client.get("/api/v1/leave/requests?scope=own", headers=employee)
    assert own.status_code == 200
    assert [item["id"] for item in own.json()["items"]] == [created.json()["id"]]

    employee_approvals = client.get(
        "/api/v1/leave/requests?scope=approvals", headers=employee
    )
    assert employee_approvals.status_code == 403

    approvals = client.get(
        "/api/v1/leave/requests?scope=approvals", headers=approver
    )
    assert approvals.status_code == 200
    assert created.json()["id"] in {
        item["id"] for item in approvals.json()["items"]
    }
