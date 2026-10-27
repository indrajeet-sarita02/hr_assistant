from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import DbSession, require_internal_permission
from app.core.errors import AppError, not_found
from app.db.models import PolicyDocument
from app.domains.identity import Principal

router = APIRouter(prefix="/policies", tags=["Policies"])


@router.get("/{document_id}/download")
def download_policy(
    document_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("hr_assistant.query")),
) -> None:
    """Resolve a citation download link for an authorized, current policy.

    Policy bytes are stored privately. This deployment ships without an object
    storage adapter, so the endpoint validates authorization and availability
    before signalling that signed downloads are not configured.
    """
    document = db.scalar(
        select(PolicyDocument).where(
            PolicyDocument.id == document_id,
            PolicyDocument.tenant_id == principal.tenant_id,
        )
    )
    today = datetime.now(UTC).date()
    current = (
        document is not None
        and document.status == "published"
        and (document.effective_from is None or document.effective_from <= today)
        and (document.effective_to is None or document.effective_to >= today)
    )
    if not current:
        raise not_found("policy")
    raise AppError(
        501,
        "policy_storage_not_configured",
        "policies.errors.storage_not_configured",
        "Private policy storage and signed downloads are not configured for this deployment.",
    )
