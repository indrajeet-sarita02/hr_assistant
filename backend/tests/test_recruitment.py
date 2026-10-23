from __future__ import annotations


def _requisition(client, recruiter, approver) -> dict:
    created = client.post(
        "/api/v1/recruitment/requisitions",
        headers=recruiter,
        json={
            "title": "Backend engineer",
            "location": "Remote",
            "employment_type": "full_time",
            "description": "Build and maintain the HR Assistant backend.",
        },
    )
    assert created.status_code == 201, created.text
    requisition_id = created.json()["id"]
    assert (
        client.post(
            f"/api/v1/recruitment/requisitions/{requisition_id}/submit",
            headers=recruiter,
        ).status_code
        == 200
    )
    approved = client.post(
        f"/api/v1/recruitment/requisitions/{requisition_id}/approval",
        headers=approver,
        json={"decision": "approved", "comment": "Approved"},
    )
    assert approved.status_code == 200, approved.text
    opened = client.post(
        f"/api/v1/recruitment/requisitions/{requisition_id}/open", headers=recruiter
    )
    assert opened.status_code == 200, opened.text
    return opened.json()


def test_recruitment_stage_transitions_are_enforced(client, login):
    recruiter = login("recruiter@example.com")
    approver = login("approver@example.com")
    requisition = _requisition(client, recruiter, approver)

    applied = client.post(
        "/api/v1/recruitment/applications",
        headers=recruiter,
        json={
            "requisition_id": requisition["id"],
            "full_name": "Candidate One",
            "email": "candidate.one@example.com",
            "phone": "+911234567890",
        },
    )
    assert applied.status_code == 201, applied.text
    application_id = applied.json()["id"]
    assert applied.json()["stage"] == "received"

    illegal = client.patch(
        f"/api/v1/recruitment/applications/{application_id}",
        headers=recruiter,
        json={"stage": "hired"},
    )
    assert illegal.status_code == 409
    assert illegal.json()["error"]["code"] == "invalid_state_transition"

    for stage in ("screening", "interview", "offer", "hired"):
        response = client.patch(
            f"/api/v1/recruitment/applications/{application_id}",
            headers=recruiter,
            json={"stage": stage, "reason": f"Moved to {stage}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["stage"] == stage

    detail = client.get(
        f"/api/v1/recruitment/applications/{application_id}", headers=recruiter
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "hired"

    # Terminal stages cannot be advanced further.
    terminal = client.patch(
        f"/api/v1/recruitment/applications/{application_id}",
        headers=recruiter,
        json={"stage": "offer"},
    )
    assert terminal.status_code == 409


def test_recruitment_duplicate_application_and_cross_tenant_access(client, login):
    recruiter = login("recruiter@example.com")
    approver = login("approver@example.com")
    requisition = _requisition(client, recruiter, approver)
    payload = {
        "requisition_id": requisition["id"],
        "full_name": "Candidate Two",
        "email": "candidate.two@example.com",
    }
    first = client.post(
        "/api/v1/recruitment/applications", headers=recruiter, json=payload
    )
    assert first.status_code == 201, first.text
    duplicate = client.post(
        "/api/v1/recruitment/applications", headers=recruiter, json=payload
    )
    assert duplicate.status_code == 409

    application_id = first.json()["id"]
    outsider = client.get(
        f"/api/v1/recruitment/applications/{application_id}",
        headers=login("employee@example.com"),
    )
    assert outsider.status_code == 403
