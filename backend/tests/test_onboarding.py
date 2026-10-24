from __future__ import annotations

import hashlib

from sqlalchemy import select

from app.db.models import (
    EmployeeProfile,
    OnboardingCase,
    OnboardingTask,
    OnboardingTemplate,
    User,
)


def _employee_id(db, email: str = "employee2@example.com") -> str:
    user = db.scalar(select(User).where(User.email == email))
    employee = db.scalar(
        select(EmployeeProfile).where(EmployeeProfile.user_id == user.id)
    )
    return str(employee.id)


def _template(client, headers) -> dict:
    response = client.get("/api/v1/onboarding/templates", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()[0]


def test_onboarding_required_evidence_and_owner_scope(client, login, db):
    hr = login("hr@example.com")
    employee = login("employee2@example.com")
    template = _template(client, hr)
    created = client.post(
        "/api/v1/onboarding/cases",
        headers=hr,
        json={
            "employee_id": _employee_id(db),
            "template_id": template["id"],
            "start_date": "2026-11-02",
        },
    )
    assert created.status_code == 201, created.text
    case_id = created.json()["id"]

    tasks = list(
        db.scalars(
            select(OnboardingTask)
            .where(OnboardingTask.case_id == case_id)
            .order_by(OnboardingTask.position)
        )
    )
    assert [task.title for task in tasks][:2] == [
        "Sign employment documents",
        "Complete payroll setup",
    ]
    required_task = tasks[0]
    employee_task = tasks[2]

    started = client.patch(
        f"/api/v1/onboarding/tasks/{required_task.id}",
        headers=hr,
        json={"status": "in_progress"},
    )
    assert started.status_code == 200, started.text

    missing_evidence = client.patch(
        f"/api/v1/onboarding/tasks/{required_task.id}",
        headers=hr,
        json={"status": "completed"},
    )
    assert missing_evidence.status_code == 422
    assert (
        missing_evidence.json()["error"]["code"] == "business_rule_violation"
    )

    wrong_owner = client.patch(
        f"/api/v1/onboarding/tasks/{required_task.id}",
        headers=employee,
        json={"status": "completed"},
    )
    assert wrong_owner.status_code == 403

    document = client.post(
        "/api/v1/documents",
        headers=hr,
        json={
            "filename": "signed-contract.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 2048,
            "checksum": hashlib.sha256(b"signed-contract").hexdigest(),
        },
    )
    assert document.status_code == 201, document.text
    completed = client.patch(
        f"/api/v1/onboarding/tasks/{required_task.id}",
        headers=hr,
        json={
            "status": "completed",
            "evidence_document_id": document.json()["id"],
        },
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["evidence_document_id"] == document.json()["id"]

    # Tasks without required evidence can be completed by their owner.
    no_evidence_needed = client.patch(
        f"/api/v1/onboarding/tasks/{employee_task.id}",
        headers=employee,
        json={"status": "in_progress"},
    )
    assert no_evidence_needed.status_code == 200
    completed_without_evidence = client.patch(
        f"/api/v1/onboarding/tasks/{employee_task.id}",
        headers=employee,
        json={"status": "completed"},
    )
    assert completed_without_evidence.status_code == 200

    # A case cannot be closed while tasks remain open.
    blocked_close = client.patch(
        f"/api/v1/onboarding/cases/{case_id}",
        headers=hr,
        json={"status": "completed"},
    )
    assert blocked_close.status_code == 409

    # Template rewrites are forbidden once a case uses the template.
    rewrite = client.patch(
        f"/api/v1/onboarding/templates/{template['id']}",
        headers=hr,
        json={
            "tasks": [
                {
                    "title": "Replacement task",
                    "owner_rule": "employee",
                    "position": 1,
                }
            ]
        },
    )
    assert rewrite.status_code == 409
    rename = client.patch(
        f"/api/v1/onboarding/templates/{template['id']}",
        headers=hr,
        json={"name": "Standard onboarding 2026"},
    )
    assert rename.status_code == 200
    assert rename.json()["name"] == "Standard onboarding 2026"


def test_onboarding_case_closure_after_all_tasks_are_resolved(client, login, db):
    hr = login("hr@example.com")
    template = _template(client, hr)
    created = client.post(
        "/api/v1/onboarding/cases",
        headers=hr,
        json={
            "employee_id": _employee_id(db),
            "template_id": template["id"],
            "start_date": "2026-11-02",
        },
    )
    assert created.status_code == 201
    case_id = created.json()["id"]
    tasks = list(
        db.scalars(select(OnboardingTask).where(OnboardingTask.case_id == case_id))
    )
    for task in tasks:
        task.status = "waived"
    db.commit()

    closed = client.patch(
        f"/api/v1/onboarding/cases/{case_id}",
        headers=hr,
        json={"status": "completed"},
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "completed"
    case = db.scalar(select(OnboardingCase).where(OnboardingCase.id == case_id))
    db.refresh(case)
    assert case.status == "completed"


def test_onboarding_cases_are_limited_to_the_employee(client, login, db):
    hr = login("hr@example.com")
    template = _template(client, hr)
    created = client.post(
        "/api/v1/onboarding/cases",
        headers=hr,
        json={
            "employee_id": _employee_id(db),
            "template_id": template["id"],
            "start_date": "2026-11-02",
        },
    )
    assert created.status_code == 201
    other_employee = login("employee@example.com")
    response = client.get(
        f"/api/v1/onboarding/cases/{created.json()['id']}",
        headers=other_employee,
    )
    assert response.status_code == 404


def test_template_without_case_can_be_rewritten(client, login, db):
    hr = login("hr@example.com")
    template = db.scalar(select(OnboardingTemplate))
    created = client.post(
        "/api/v1/onboarding/templates",
        headers=hr,
        json={
            "name": "Manager onboarding",
            "tasks": [
                {
                    "title": "Read handbook",
                    "owner_rule": "employee",
                    "position": 1,
                    "required_evidence": False,
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    updated = client.patch(
        f"/api/v1/onboarding/templates/{created.json()['id']}",
        headers=hr,
        json={
            "tasks": [
                {
                    "title": "Read handbook and sign policy",
                    "owner_rule": "employee",
                    "position": 1,
                    "required_evidence": True,
                }
            ]
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["tasks"][0]["required_evidence"] is True
    assert template is not None


def test_template_detail_is_tenant_scoped(client, login):
    hr = login("hr@example.com")
    template = _template(client, hr)

    detail = client.get(
        f"/api/v1/onboarding/templates/{template['id']}", headers=hr
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["id"] == template["id"]
    assert detail.json()["tasks"]

    missing = client.get(
        "/api/v1/onboarding/templates/00000000-0000-0000-0000-000000000000",
        headers=hr,
    )
    assert missing.status_code == 404
