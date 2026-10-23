from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import unauthenticated
from app.core.security import (
    audience_for_user_type,
    create_token,
    hash_password,
    needs_rehash,
    privacy_hash,
    token_hash,
    verify_password,
)
from app.db.models import User, UserSession

_DUMMY_PASSWORD_HASH = hash_password("timing-equalisation-not-a-real-password")


@dataclass(slots=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    session: UserSession


def create_session(
    db: Session,
    user: User,
    *,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> TokenPair:
    now = datetime.now(UTC)
    session = UserSession(
        user_id=user.id,
        audience=audience_for_user_type(user.user_type),
        refresh_jti="pending",
        refresh_hash="pending",
        ip_hash=privacy_hash(ip_address),
        user_agent_hash=privacy_hash(user_agent),
        created_at=now,
        last_used_at=now,
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)
    db.flush()

    access_token, _, _ = create_token(
        user_id=user.id,
        user_type=user.user_type,
        session_id=session.id,
        token_type="access",
    )
    refresh_token, refresh_jti, refresh_expires = create_token(
        user_id=user.id,
        user_type=user.user_type,
        session_id=session.id,
        token_type="refresh",
    )
    session.refresh_jti = refresh_jti
    session.refresh_hash = token_hash(refresh_token)
    session.expires_at = refresh_expires
    db.add(session)
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        session=session,
    )


def create_public_user(
    db: Session, *, email: str, password: str, full_name: str, locale: str
) -> User:
    user = User(
        email=email.strip().lower(),
        full_name=full_name.strip(),
        password_hash=hash_password(password),
        user_type="public",
        status="active",
        locale=locale,
        timezone="Asia/Kolkata",
    )
    db.add(user)
    db.flush()
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        # Keep the failure path's password work comparable to a real account so
        # response timing does not reveal whether the email exists.
        verify_password(password, _DUMMY_PASSWORD_HASH)
        raise unauthenticated("Invalid email or password.")
    if user.status != "active":
        raise unauthenticated("Invalid email or password.")
    if not verify_password(password, user.password_hash):
        raise unauthenticated("Invalid email or password.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = datetime.now(UTC)
    db.add(user)
    return user


def refresh_session(db: Session, refresh_token: str) -> tuple[User, TokenPair, UserSession]:
    from app.core.security import decode_token

    payload = decode_token(refresh_token, expected_type="refresh")
    try:
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (KeyError, ValueError) as exc:
        raise unauthenticated("The refresh token is malformed.") from exc

    user = db.get(User, user_id)
    session = db.get(UserSession, session_id)
    now = datetime.now(UTC)
    if user is None or user.status != "active":
        raise unauthenticated("The account is not active.")
    if session is None or session.user_id != user.id:
        raise unauthenticated("The session no longer exists.")
    if session.revoked_at is not None or session.expires_at <= now:
        raise unauthenticated("The session has expired or was revoked.")
    if session.refresh_jti != payload.get("jti") or session.refresh_hash != token_hash(
        refresh_token
    ):
        # A rotated or replayed refresh token revokes the session family.
        session.revoked_at = now
        db.add(session)
        raise unauthenticated("The refresh token was already used or is invalid.")
    if payload.get("aud") != audience_for_user_type(user.user_type):
        raise unauthenticated("The refresh token audience is invalid.")

    return user, create_session(db, user), session


def revoke_session(db: Session, session: UserSession) -> None:
    if session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        db.add(session)
