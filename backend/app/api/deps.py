from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.errors import forbidden, unauthenticated
from app.core.i18n import negotiate_locale
from app.core.logging import tenant_id_ctx, user_id_ctx
from app.core.ratelimit import limit_write
from app.db.session import get_db, set_tenant_context
from app.domains.audit import write_audit
from app.domains.identity import Principal, load_principal

bearer_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login", auto_error=False, scheme_name="BearerAuth"
)

DbSession = Annotated[Session, Depends(get_db)]
BearerToken = Annotated[str | None, Depends(bearer_scheme)]
TenantHeader = Annotated[str | None, Header(alias="X-Tenant-ID")]


def _apply_locale(request: Request, principal: Principal) -> None:
    """Record the negotiated locale for the response middleware."""

    request.state.locale = negotiate_locale(
        principal.user.locale,
        request.headers.get("accept-language"),
        principal.tenant.default_locale if principal.tenant else None,
    )


def _audit_permission_denied(
    db: Session, principal: Principal | None, metadata: dict
) -> None:
    """Best-effort ``permission.denied`` audit on an authorization failure.

    The dependency raises immediately afterwards, so the event must be
    committed here — otherwise the router's error path closes the session
    and the audit row is lost. Failures writing the audit entry must never
    mask or replace the original authorization error.
    """

    try:
        if principal is not None:
            metadata["tenant_id"] = str(principal.tenant_id)
        write_audit(
            db,
            principal,
            "permission.denied",
            outcome="denied",
            metadata=metadata,
        )
        db.commit()
    except Exception:
        db.rollback()


def get_principal(
    request: Request,
    db: DbSession,
    token: BearerToken = None,
    x_tenant_id: TenantHeader = None,
) -> Principal:
    if not token:
        raise unauthenticated()
    principal = load_principal(db, token, x_tenant_id)
    tenant_id_ctx.set(str(principal.tenant_id or "-"))
    user_id_ctx.set(str(principal.user_id))
    set_tenant_context(db, principal.tenant_id)
    _apply_locale(request, principal)
    return principal


def get_optional_principal(
    request: Request,
    db: DbSession,
    token: BearerToken = None,
    x_tenant_id: TenantHeader = None,
) -> Principal | None:
    if not token:
        return None
    principal = load_principal(db, token, x_tenant_id)
    tenant_id_ctx.set(str(principal.tenant_id or "-"))
    user_id_ctx.set(str(principal.user_id))
    set_tenant_context(db, principal.tenant_id)
    _apply_locale(request, principal)
    return principal


def require_internal_principal(
    db: DbSession, principal: Principal = Depends(get_principal)
) -> Principal:
    if not principal.is_internal or principal.membership is None:
        _audit_permission_denied(db, principal, {"requirement": "internal_member"})
        raise forbidden("Organization member access is required.")
    return principal


def require_permission(code: str) -> Callable[..., Principal]:
    def dependency(
        db: DbSession, principal: Principal = Depends(get_principal)
    ) -> Principal:
        try:
            principal.require_permission(code)
        except AppError:
            _audit_permission_denied(db, principal, {"permission": code})
            raise
        return principal

    return dependency


def require_internal_permission(code: str) -> Callable[..., Principal]:
    def dependency(
        db: DbSession, principal: Principal = Depends(require_internal_principal)
    ) -> Principal:
        try:
            principal.require_permission(code)
        except AppError:
            _audit_permission_denied(db, principal, {"permission": code})
            raise
        return principal

    return dependency


def require_any_internal_permission(*codes: str) -> Callable[..., Principal]:
    """Require at least one of the supplied permissions.

    Use sparingly: routes that combine read and write audiences (for example a
    review queue visible to editors and reviewers) still enforce the exact
    permission on each mutating action.
    """

    def dependency(
        db: DbSession, principal: Principal = Depends(require_internal_principal)
    ) -> Principal:
        if not any(code in principal.permissions for code in codes):
            _audit_permission_denied(
                db, principal, {"permissions": sorted(codes), "any_of": True}
            )
            raise forbidden("Missing permission: " + " or ".join(codes) + ".")
        return principal

    return dependency


def write_rate_limit(
    request: Request,
    principal: Principal = Depends(get_principal),
) -> None:
    """Apply the per-user write budget to state-changing endpoints."""

    limit_write(client_key(request, principal))


def client_key(request: Request, principal: Principal | None = None) -> str:
    if principal:
        return f"user:{principal.user_id}"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    return f"ip:{request.client.host if request.client else 'unknown'}"
