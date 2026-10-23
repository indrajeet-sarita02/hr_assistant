from __future__ import annotations

from tests.conftest import SEED_PASSWORD


def test_login_me_and_refresh_rotation(client, login):
    headers = login("employee@example.com")
    me = client.get("/api/v1/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["email"] == "employee@example.com"
    assert body["active_tenant"]["slug"] == "demo"
    assert "leave.request.create" in body["permissions"]

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "employee@example.com", "password": SEED_PASSWORD},
    )
    assert login_response.status_code == 200
    tokens = login_response.json()
    assert tokens["active_tenant"]["slug"] == "demo"

    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] != tokens["refresh_token"]

    replay = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "unauthenticated"


def test_missing_and_revoked_tokens_are_rejected(client, login):
    missing = client.get("/api/v1/me")
    assert missing.status_code == 401

    headers = login("employee@example.com")
    assert client.delete("/api/v1/auth/session", headers=headers).status_code == 200
    revoked = client.get("/api/v1/me", headers=headers)
    assert revoked.status_code == 401
    assert revoked.json()["error"]["code"] == "unauthenticated"


def test_public_registration_uses_separate_audience(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "candidate@example.com",
            "password": "StrongPass!123",
            "full_name": "Public Candidate",
            "locale": "en",
        },
    )
    assert response.status_code == 201
    token = response.json()["access_token"]
    assert response.json()["active_tenant"] is None

    me = client.get(
        "/api/v1/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    assert me.json()["user"]["user_type"] == "public"
    assert me.json()["active_tenant"] is None

    internal_only = client.get(
        "/api/v1/leave/types",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert internal_only.status_code == 403


def test_unknown_login_does_not_reveal_account_existence(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "WrongPass!123"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid email or password."
