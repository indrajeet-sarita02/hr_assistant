from __future__ import annotations

import hashlib

from sqlalchemy import func, select

from app.db.models import Document, HRServiceRequest, IdempotencyKey
from tests.factories import create_tenant_user

CHECKSUM = hashlib.sha256(b"synthetic-private-document").hexdigest()


def _catalog_item(client, headers) -> str:
    response = client.get("/api/v1/service-catalog", headers=headers)
    assert response.status_code == 200
    return next(item["id"] for item in response.json() if item["code"] == "GENERAL_HR")


def _register_document(client, headers, filename: str = "evidence.pdf") -> dict:
    response = client.post(
        "/api/v1/documents",
        headers=headers,
        json={
            "filename": filename,
            "mime_type": "application/pdf",
            "size_bytes": 1024,
            "checksum": CHECKSUM,
            "classification": "confidential",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_service_request_idempotency_is_atomic(client, login, db):
    employee = login("employee@example.com")
    payload = {
        "catalog_item_id": _catalog_item(client, employee),
        "form_data": {"topic": "Laptop replacement"},
        "subject": "Laptop replacement",
        "description": "My laptop will not boot.",
        "priority": "high",
    }
    key = "service-request-atomic"
    created = client.post(
        "/api/v1/service-requests",
        headers={**employee, "Idempotency-Key": key},
        json=payload,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]

    replay = client.post(
        "/api/v1/service-requests",
        headers={**employee, "Idempotency-Key": key},
        json=payload,
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == request_id

    count = db.scalar(
        select(func.count())
        .select_from(HRServiceRequest)
        .where(HRServiceRequest.subject == payload["subject"])
    )
    assert count == 1
    record = db.scalar(select(IdempotencyKey).where(IdempotencyKey.key == key))
    assert record is not None
    assert record.status == "completed"
    assert record.resource_id is not None


def test_documents_are_metadata_only_and_owner_scoped(client, login, db):
    employee = login("employee@example.com")
    employee2 = login("employee2@example.com")
    document = _register_document(client, employee)

    own = client.get(f"/api/v1/documents/{document['id']}", headers=employee)
    assert own.status_code == 200
    assert own.json()["scan_status"] == "pending"
    assert "storage_key" not in own.json()

    other = client.get(f"/api/v1/documents/{document['id']}", headers=employee2)
    assert other.status_code == 404

    pending = client.get(
        f"/api/v1/documents/{document['id']}/download", headers=employee
    )
    assert pending.status_code == 409
    assert pending.json()["error"]["code"] == "document_not_available"

    row = db.scalar(select(Document).where(Document.id == document["id"]))
    row.scan_status = "clean"
    db.commit()
    not_configured = client.get(
        f"/api/v1/documents/{document['id']}/download", headers=employee
    )
    assert not_configured.status_code == 501
    assert (
        not_configured.json()["error"]["code"]
        == "document_storage_not_configured"
    )


def test_service_request_attachment_enforces_document_ownership(client, login):
    employee = login("employee@example.com")
    employee2 = login("employee2@example.com")
    request_id = client.post(
        "/api/v1/service-requests",
        headers={**employee, "Idempotency-Key": "attachment-request"},
        json={
            "catalog_item_id": _catalog_item(client, employee),
            "form_data": {"topic": "Document evidence"},
            "subject": "Need a document",
            "description": "Attaching supporting evidence.",
        },
    ).json()["id"]
    document = _register_document(client, employee, "support.txt")

    attached = client.post(
        f"/api/v1/service-requests/{request_id}/attachments",
        headers=employee,
        json={"document_id": document["id"]},
    )
    assert attached.status_code == 201, attached.text

    duplicate = client.post(
        f"/api/v1/service-requests/{request_id}/attachments",
        headers=employee,
        json={"document_id": document["id"]},
    )
    assert duplicate.status_code == 409

    second_request = client.post(
        "/api/v1/service-requests",
        headers={**employee2, "Idempotency-Key": "attachment-request-2"},
        json={
            "catalog_item_id": _catalog_item(client, employee2),
            "form_data": {"topic": "Second request"},
            "subject": "Second request",
            "description": "Trying another user's document.",
        },
    ).json()["id"]
    denied = client.post(
        f"/api/v1/service-requests/{second_request}/attachments",
        headers=employee2,
        json={"document_id": document["id"]},
    )
    assert denied.status_code == 403


def test_service_request_rejects_cross_tenant_assignee(client, login):
    hr = login("hr@example.com")
    employee = login("employee@example.com")
    outsider = create_tenant_user(
        email="assignee-outsider@example.com",
        role_code="employee",
        tenant_slug="other",
    )
    request_id = client.post(
        "/api/v1/service-requests",
        headers={**employee, "Idempotency-Key": "assignee-request"},
        json={
            "catalog_item_id": _catalog_item(client, employee),
            "form_data": {"topic": "Assign someone"},
            "subject": "Assign someone",
            "description": "This should reject an outsider.",
        },
    ).json()["id"]
    response = client.patch(
        f"/api/v1/service-requests/{request_id}",
        headers=hr,
        json={"assignee_user_id": str(outsider["user_id"])},
    )
    assert response.status_code == 422
    assert (
        response.json()["error"]["code"] == "business_rule_violation"
    )


def test_attachment_requires_same_tenant_document(client, login):
    employee = login("employee@example.com")
    request_id = client.post(
        "/api/v1/service-requests",
        headers={**employee, "Idempotency-Key": "cross-tenant-document"},
        json={
            "catalog_item_id": _catalog_item(client, employee),
            "form_data": {"topic": "Cross tenant doc"},
            "subject": "Cross tenant doc",
            "description": "Document must belong to the same tenant.",
        },
    ).json()["id"]
    response = client.post(
        f"/api/v1/service-requests/{request_id}/attachments",
        headers=employee,
        json={"document_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert response.status_code == 404


def test_service_request_scope_filters(client, login):
    employee = login("employee@example.com")
    employee2 = login("employee2@example.com")

    created = client.post(
        "/api/v1/service-requests",
        headers={**employee2, "Idempotency-Key": "scope-own-1"},
        json={
            "catalog_item_id": _catalog_item(client, employee2),
            "form_data": {"topic": "Scope filter"},
            "subject": "Scope filter request",
            "description": "Verify own scope excludes other requesters.",
        },
    )
    assert created.status_code == 201, created.text

    own = client.get("/api/v1/service-requests?scope=own", headers=employee)
    assert own.status_code == 200
    assert own.json()["items"] == []

    own2 = client.get("/api/v1/service-requests?scope=own", headers=employee2)
    assert own2.status_code == 200
    assert [item["id"] for item in own2.json()["items"]] == [created.json()["id"]]

    forbidden_queue = client.get(
        "/api/v1/service-requests?scope=queue", headers=employee
    )
    assert forbidden_queue.status_code == 403
