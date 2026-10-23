from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession, client_key, get_principal
from app.api.v1.schemas.auth import (
    LocaleIn,
    LoginIn,
    LogoutIn,
    MembershipOut,
    MeOut,
    RefreshIn,
    RegisterIn,
    TenantOut,
    TokenOut,
    UserOut,
)
from app.api.v1.schemas.common import MessageOut
from app.core.errors import conflict
from app.core.ratelimit import limit_auth, limit_public_write
from app.core.security import privacy_hash
from app.db.models import Organization, TenantMembership, User
from app.domains.audit import write_audit
from app.domains.auth import (
    authenticate,
    create_public_user,
    create_session,
    refresh_session,
    revoke_session,
)
from app.domains.identity import Principal, normalize_email

router = APIRouter(tags=["Authentication"])


def _default_tenant(db: Session, user) -> Organization | None:
    if user.user_type != "internal":
        return None
    membership = db.scalar(
        select(TenantMembership)
        .where(
            TenantMembership.user_id == user.id,
            TenantMembership.status == "active",
        )
        .order_by(TenantMembership.created_at)
        .limit(1)
    )
    return db.get(Organization, membership.tenant_id) if membership else None


def _token_response(user, pair, tenant) -> TokenOut:
    return TokenOut(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
        user=UserOut.model_validate(user),
        active_tenant=TenantOut.model_validate(tenant) if tenant else None,
    )


@router.post("/auth/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterIn,
    request: Request,
    db: DbSession,
) -> TokenOut:
    limit_public_write(client_key(request))
    email = normalize_email(payload.email)
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise conflict("conflict", "An account with this email already exists.")
    user = create_public_user(
        db,
        email=email,
        password=payload.password,
        full_name=payload.full_name,
        locale=payload.locale,
    )
    pair = create_session(
        db,
        user,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    write_audit(
        db,
        None,
        "auth.register.succeeded",
        target_type="user",
        target_id=user.id,
        actor_type="public_user",
    )
    db.commit()
    return _token_response(user, pair, None)


@router.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: DbSession) -> TokenOut:
    limit_auth(client_key(request))
    try:
        user = authenticate(db, payload.email, payload.password)
    except Exception:
        write_audit(
            db,
            None,
            "auth.login.failed",
            outcome="failure",
            actor_type="anonymous",
            metadata={
                "email_hash": privacy_hash(normalize_email(payload.email)),
            },
        )
        db.commit()
        raise
    pair = create_session(
        db,
        user,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    write_audit(
        db,
        None,
        "auth.login.succeeded",
        target_type="user",
        target_id=user.id,
        actor_type="user",
    )
    db.commit()
    return _token_response(user, pair, _default_tenant(db, user))


@router.post("/auth/session", response_model=TokenOut)
def create_session_alias(payload: LoginIn, request: Request, db: DbSession) -> TokenOut:
    """SRS-compatible alias for establishing a session."""
    return login(payload, request, db)


@router.post("/auth/refresh", response_model=TokenOut)
def refresh(payload: RefreshIn, request: Request, db: DbSession) -> TokenOut:
    limit_auth(client_key(request))
    user, pair, old_session = refresh_session(db, payload.refresh_token)
    revoke_session(db, old_session)
    write_audit(
        db,
        None,
        "auth.session.refreshed",
        target_type="user",
        target_id=user.id,
        actor_type="user",
    )
    db.commit()
    return _token_response(user, pair, _default_tenant(db, user))


@router.delete("/auth/session", response_model=MessageOut)
def logout(
    db: DbSession,
    principal: Principal = Depends(get_principal),
    payload: LogoutIn | None = None,
) -> MessageOut:
    revoke_session(db, principal.session)
    write_audit(
        db,
        principal,
        "auth.logout",
        target_type="session",
        target_id=principal.session.id,
    )
    db.commit()
    return MessageOut(message="Signed out.")


@router.get("/me", response_model=MeOut)
def me(
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> MeOut:
    return MeOut(
        user=UserOut.model_validate(principal.user),
        active_tenant=TenantOut.model_validate(principal.tenant) if principal.tenant else None,
        membership=(
            MembershipOut.model_validate(principal.membership)
            if principal.membership
            else None
        ),
        roles=list(principal.roles),
        permissions=sorted(principal.permissions),
        audience=principal.audience,
    )


@router.get("/preferences/locale")
def get_locale(principal: Principal = Depends(get_principal)) -> dict[str, str]:
    return {"locale": principal.user.locale}


@router.put("/preferences/locale", response_model=MessageOut)
def update_locale(
    payload: LocaleIn,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> MessageOut:
    principal.user.locale = payload.locale
    db.add(principal.user)
    write_audit(
        db,
        principal,
        "user.locale.updated",
        target_type="user",
        target_id=principal.user_id,
        metadata={"locale": payload.locale},
    )
    db.commit()
    return MessageOut(message="Locale updated.")
