from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings
from app.core.errors import unauthenticated

ACCESS_AUDIENCE_INTERNAL = "hr-api-internal"
ACCESS_AUDIENCE_PUBLIC = "career-api-public"
ISSUER = "hr-assistant-api"

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def audience_for_user_type(user_type: str) -> str:
    return ACCESS_AUDIENCE_PUBLIC if user_type == "public" else ACCESS_AUDIENCE_INTERNAL


def create_token(
    *,
    user_id: uuid.UUID,
    user_type: str,
    session_id: uuid.UUID,
    token_type: str,
    jti: str | None = None,
    expires_delta: timedelta | None = None,
) -> tuple[str, str, datetime]:
    jti = jti or uuid.uuid4().hex
    now = datetime.now(UTC)
    if expires_delta is None:
        expires_delta = (
            timedelta(minutes=settings.access_token_expire_minutes)
            if token_type == "access"
            else timedelta(days=settings.refresh_token_expire_days)
        )
    expires_at = now + expires_delta
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "aud": audience_for_user_type(user_type),
        "iss": ISSUER,
        "typ": token_type,
        "sid": str(session_id),
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_token(token: str, *, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer=ISSUER,
            # The expected audience depends on the account type, so it is
            # checked against the loaded user in the identity layer.
            options={
                "require": ["sub", "aud", "iss", "exp", "iat", "typ", "sid", "jti"],
                "verify_aud": False,
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise unauthenticated("Your session has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise unauthenticated("The supplied token is invalid.") from exc
    if payload.get("typ") != expected_type:
        raise unauthenticated("The supplied token has the wrong type.")
    return payload


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def privacy_hash(value: str | None) -> str | None:
    """Keyed hash for IP/user-agent correlation without storing raw values."""
    if not value:
        return None
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"), value.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)
