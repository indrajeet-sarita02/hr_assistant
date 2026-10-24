from __future__ import annotations

from datetime import date, timedelta


def _content_payload(slug: str = "editorial-test") -> dict:
    return {
        "content_type": "article",
        "title": "Editorial workflow test",
        "slug": slug,
        "locale": "en",
        "summary": "A test article for the editorial workflow.",
        "body": "This article exists to verify editorial separation of duties and publication.",
        "source": "Test editorial source",
        "source_checked_at": date.today().isoformat(),
        "effective_from": date.today().isoformat(),
        "expires_at": (date.today() + timedelta(days=30)).isoformat(),
    }


def test_content_requires_independent_review_before_publish(client, login):
    content = login("content@example.com")
    reviewer = login("reviewer@example.com")
    created = client.post(
        "/api/v1/admin/content", headers=content, json=_content_payload()
    )
    assert created.status_code == 201, created.text
    content_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    # Draft content is not exposed on the public surface.
    assert client.get(f"/api/v1/career/content/{content_id}").status_code == 404

    submitted = client.post(
        f"/api/v1/admin/content/{content_id}/submit-review", headers=content
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "in_review"

    self_review = client.post(
        f"/api/v1/admin/content/{content_id}/review",
        headers=content,
        json={"decision": "approved", "comments": "Self approval attempt"},
    )
    assert self_review.status_code == 403
    assert "own submission" in self_review.json()["error"]["message"]

    # An unapproved item cannot skip review and be published.
    early_publish = client.post(
        f"/api/v1/admin/content/{content_id}/publish", headers=reviewer
    )
    assert early_publish.status_code == 409

    reviewed = client.post(
        f"/api/v1/admin/content/{content_id}/review",
        headers=reviewer,
        json={"decision": "approved", "comments": "Checked source"},
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["decision"] == "approved"

    published = client.post(
        f"/api/v1/admin/content/{content_id}/publish", headers=reviewer
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"

    public = client.get(f"/api/v1/career/content/{content_id}")
    assert public.status_code == 200
    assert public.json()["title"] == "Editorial workflow test"
    assert public.json()["source"] == "Test editorial source"

    public_reviewer = client.get(
        "/api/v1/admin/content", headers=reviewer, params={"status_filter": "in_review"}
    )
    assert public_reviewer.status_code == 200


def test_content_validation_rejects_expired_and_missing_source(client, login):
    content = login("content@example.com")
    bad_dates = client.post(
        "/api/v1/admin/content",
        headers=content,
        json={
            **_content_payload("bad-dates"),
            "effective_from": date.today().isoformat(),
            "expires_at": (date.today() - timedelta(days=1)).isoformat(),
        },
    )
    assert bad_dates.status_code == 422
    assert bad_dates.json()["error"]["code"] == "business_rule_violation"

    no_source = client.post(
        "/api/v1/admin/content",
        headers=content,
        json={
            **_content_payload("no-source"),
            "source": None,
            "source_checked_at": None,
        },
    )
    assert no_source.status_code == 201
    in_review = client.post(
        f"/api/v1/admin/content/{no_source.json()['id']}/submit-review",
        headers=content,
    )
    assert in_review.status_code == 422
    assert in_review.json()["error"]["code"] == "business_rule_violation"


def test_invalid_course_url_is_rejected_and_valid_course_is_public(client, login):
    reviewer = login("reviewer@example.com")
    invalid = client.post(
        "/api/v1/admin/courses",
        headers=reviewer,
        json={
            "title": "Unsafe course link",
            "provider": "Example",
            "provider_url": "javascript:alert(1)",
            "source_checked_at": date.today().isoformat(),
        },
    )
    assert invalid.status_code == 422

    created = client.post(
        "/api/v1/admin/courses",
        headers=reviewer,
        json={
            "title": "Safe course link",
            "provider": "Example",
            "provider_url": "https://example.com/course",
            "locale": "en",
            "source_checked_at": date.today().isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    published = client.post(
        f"/api/v1/admin/courses/{created.json()['id']}/publish", headers=reviewer
    )
    assert published.status_code == 200, published.text
    public = client.get(f"/api/v1/courses/{created.json()['id']}")
    assert public.status_code == 200
    assert public.json()["provider_url"].startswith("https://")

    expired = client.post(
        "/api/v1/admin/courses",
        headers=reviewer,
        json={
            "title": "Expired course",
            "provider": "Example",
            "provider_url": "https://example.com/expired",
            "source_checked_at": date.today().isoformat(),
            "expires_at": (date.today() - timedelta(days=1)).isoformat(),
        },
    )
    assert expired.status_code == 201
    cannot_publish = client.post(
        f"/api/v1/admin/courses/{expired.json()['id']}/publish", headers=reviewer
    )
    assert cannot_publish.status_code == 422


def test_content_report_detail_requires_triage_permission(client, login):
    reviewer = login("reviewer@example.com")
    employee = login("employee@example.com")

    missing = client.get(
        "/api/v1/admin/content-reports/00000000-0000-0000-0000-000000000000",
        headers=reviewer,
    )
    assert missing.status_code == 404

    forbidden = client.get(
        "/api/v1/admin/content-reports/00000000-0000-0000-0000-000000000000",
        headers=employee,
    )
    assert forbidden.status_code == 403
