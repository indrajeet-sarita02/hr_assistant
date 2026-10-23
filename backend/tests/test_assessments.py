from __future__ import annotations


def _create_published_test(client, reviewer, pass_score: int = 0) -> dict:
    created = client.post(
        "/api/v1/admin/mock-tests",
        headers=reviewer,
        json={
            "title": f"Threshold test {pass_score}",
            "description": "Threshold behaviour test.",
            "duration_minutes": 30,
            "pass_score": pass_score,
        },
    )
    assert created.status_code == 201, created.text
    test_id = created.json()["id"]
    question = client.post(
        f"/api/v1/admin/mock-tests/{test_id}/questions",
        headers=reviewer,
        json={
            "prompt": "Which answer is correct?",
            "options": [
                {"id": "a", "text": "Correct"},
                {"id": "b", "text": "Incorrect"},
            ],
            "correct_answer": {"option_id": "a"},
            "explanation": "A is correct.",
        },
    )
    assert question.status_code == 201, question.text
    published = client.post(
        f"/api/v1/admin/mock-tests/{test_id}/publish", headers=reviewer
    )
    assert published.status_code == 200, published.text
    return published.json()


def test_assessment_uses_configured_pass_score(client, login):
    reviewer = login("reviewer@example.com")
    employee = login("employee@example.com")
    test = _create_published_test(client, reviewer, pass_score=0)

    started = client.post(
        f"/api/v1/mock-tests/{test['id']}/attempts", headers=employee
    )
    assert started.status_code == 201, started.text
    attempt = started.json()
    question = attempt["questions"][0]

    saved = client.patch(
        f"/api/v1/mock-test-attempts/{attempt['id']}",
        headers=employee,
        json={
            "answers": [
                {"question_id": question["id"], "answer": {"option_id": "b"}}
            ]
        },
    )
    assert saved.status_code == 200, saved.text

    submitted = client.post(
        f"/api/v1/mock-test-attempts/{attempt['id']}/submit",
        headers={**employee, "Idempotency-Key": "assessment-submit"},
        json={},
    )
    assert submitted.status_code == 200, submitted.text
    body = submitted.json()
    assert body["score"] == 0
    assert body["max_score"] == 1
    # A pass score of zero means even an incorrect answer passes; the old
    # hard-coded threshold of 60 would have returned false here.
    assert body["passed"] is True

    replay = client.post(
        f"/api/v1/mock-test-attempts/{attempt['id']}/submit",
        headers={**employee, "Idempotency-Key": "assessment-submit"},
        json={},
    )
    assert replay.status_code == 200
    assert replay.json() == body

    review = client.get(
        f"/api/v1/mock-test-attempts/{attempt['id']}/review", headers=employee
    )
    assert review.status_code == 200
    assert review.json()["questions"][0]["is_correct"] is False
    assert review.json()["passed"] is True


def test_assessment_rejects_questions_from_another_test(client, login):
    reviewer = login("reviewer@example.com")
    employee = login("employee@example.com")
    first = _create_published_test(client, reviewer, pass_score=60)
    second = _create_published_test(client, reviewer, pass_score=60)
    started = client.post(
        f"/api/v1/mock-tests/{first['id']}/attempts", headers=employee
    ).json()
    second_questions = client.get(
        f"/api/v1/admin/mock-tests/{second['id']}/questions", headers=reviewer
    ).json()
    response = client.patch(
        f"/api/v1/mock-test-attempts/{started['id']}",
        headers=employee,
        json={
            "answers": [
                {
                    "question_id": second_questions[0]["id"],
                    "answer": {"option_id": "a"},
                }
            ]
        },
    )
    assert response.status_code == 422
    assert (
        response.json()["error"]["code"] == "business_rule_violation"
    )


def test_assessment_attempt_is_scoped_to_its_user(client, login):
    reviewer = login("reviewer@example.com")
    employee = login("employee@example.com")
    employee2 = login("employee2@example.com")
    test = _create_published_test(client, reviewer, pass_score=60)
    attempt = client.post(
        f"/api/v1/mock-tests/{test['id']}/attempts", headers=employee
    ).json()
    assert (
        client.get(
            f"/api/v1/mock-test-attempts/{attempt['id']}", headers=employee2
        ).status_code
        == 404
    )
