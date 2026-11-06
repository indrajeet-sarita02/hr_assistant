from __future__ import annotations

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import ProgrammingError

from app.db.models import EmployeeProfile, User
from app.db.session import engine


def test_health_and_readiness(client):
    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    ready = client.get("/readyz")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"


def test_security_headers_and_request_id(client):
    response = client.get("/healthz", headers={"X-Request-ID": "client-request-123"})
    assert response.headers["X-Request-Id"] == "client-request-123"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Cache-Control"] == "no-store"


def test_invalid_request_id_is_replaced(client):
    response = client.get("/healthz", headers={"X-Request-ID": "bad id with spaces"})
    assert response.status_code == 200
    assert response.headers["X-Request-Id"] != "bad id with spaces"
    assert len(response.headers["X-Request-Id"]) >= 8


def test_audit_events_are_append_only(client):
    with engine.connect() as connection:
        with pytest.raises(ProgrammingError, match="append-only"):
            connection.execute(text("UPDATE audit_events SET action = action"))
        connection.rollback()
    with engine.connect() as connection:
        with pytest.raises(ProgrammingError, match="append-only"):
            connection.execute(text("DELETE FROM audit_events"))
        connection.rollback()


def test_added_membership_receives_employee_profile(client, login, db):
    admin = login("admin@example.com")
    roles = client.get("/api/v1/admin/roles", headers=admin).json()
    employee_role = next(role["id"] for role in roles if role["code"] == "employee")
    created = client.post(
        "/api/v1/admin/memberships",
        headers=admin,
        json={
            "email": "newmember@example.com",
            "full_name": "New Member",
            "temporary_password": "StrongPass!123",
            "role_ids": [employee_role],
        },
    )
    assert created.status_code == 201, created.text

    user = db.scalar(select(User).where(User.email == "newmember@example.com"))
    profile = db.scalar(
        select(EmployeeProfile).where(EmployeeProfile.user_id == user.id)
    )
    assert profile is not None
    assert profile.status == "active"


def test_audit_events_store_hashed_request_metadata(client, login, db):
    from app.db.models import AuditEvent

    login("employee@example.com")
    audit = db.scalar(
        select(AuditEvent)
        .where(AuditEvent.action == "auth.login.succeeded")
        .order_by(AuditEvent.occurred_at.desc())
    )
    assert audit is not None
    assert audit.ip_hash is not None
    assert audit.user_agent_hash is not None


def test_readiness_reports_database_failure(monkeypatch):
    from app import main

    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("database unavailable")

    monkeypatch.setattr(main, "SessionLocal", lambda: BrokenSession())
    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "dependency_unavailable"
