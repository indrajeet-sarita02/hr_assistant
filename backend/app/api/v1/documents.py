from __future__ import annotations

import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.api.deps import DbSession, get_principal
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.config import settings
from app.core.errors import AppError, forbidden, not_found
from app.db.models import Document
from app.domains.audit import write_audit
from app.domains.identity import Principal

router = APIRouter(prefix="/documents", tags=["Documents"])

_CHECKSUM_RE = re.compile(r"^[a-fA-F0-9]{64}$")
_UPLOAD_PERMISSIONS = {
    "assessment.attempt_own",
    "onboarding.task.update_assigned",
    "recruitment.application.create",
    "resume.manage_own",
    "service_request.create",
}
_INSPECT_PERMISSIONS = {
    "onboarding.case.read",
    "onboarding.case.create",
    "onboarding.task.update_assigned",
    "recruitment.application.read_assigned",
    "recruitment.application.stage.update",
    "service_request.read_queue",
    "service_request.update_assigned",
}


class DocumentRegisterIn(BaseModel):
    """Metadata registration for a document uploaded through the storage adapter.

    The default `local_metadata` adapter deliberately stores no bytes: malware
    scanning, object storage, and signed-download URLs are deployment decisions.
    Clients upload through the approved storage channel and register the result
    here so the API can enforce tenancy, ownership, size, MIME, and checksum.
    """

    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=3, max_length=120)
    size_bytes: int = Field(gt=0)
    checksum: str
    classification: str = "confidential"

    @field_validator("filename")
    @classmethod
    def safe_filename(cls, value: str) -> str:
        value = value.strip()
        if not value or "/" in value or "\\" in value or value in {".", ".."}:
            raise ValueError("filename must not contain path separators")
        return value

    @field_validator("mime_type")
    @classmethod
    def allowed_mime(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in settings.document_mime_allowlist:
            raise ValueError("unsupported document type")
        return value

    @field_validator("size_bytes")
    @classmethod
    def allowed_size(cls, value: int) -> int:
        if value > settings.document_max_size_mb * 1024 * 1024:
            raise ValueError("document exceeds the configured size limit")
        return value

    @field_validator("checksum")
    @classmethod
    def valid_checksum(cls, value: str) -> str:
        value = value.strip().lower()
        if not _CHECKSUM_RE.fullmatch(value):
            raise ValueError("checksum must be a SHA-256 hex digest")
        return value

    @field_validator("classification")
    @classmethod
    def private_classification(cls, value: str) -> str:
        if value not in {"internal", "confidential", "restricted"}:
            raise ValueError("uploaded documents cannot be classified public")
        return value


class DocumentOut(ORMModel):
    id: uuid.UUID
    owner_type: str
    owner_id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    checksum: str
    scan_status: str
    classification: str
    created_at: datetime
    updated_at: datetime


def _can_upload(principal: Principal) -> bool:
    return bool(_UPLOAD_PERMISSIONS.intersection(principal.permissions))


def _can_inspect(principal: Principal, document: Document) -> bool:
    if document.uploaded_by == principal.user_id:
        return True
    return bool(_INSPECT_PERMISSIONS.intersection(principal.permissions))


@router.get("", response_model=Page[DocumentOut])
def list_documents(
    db: DbSession,
    principal: Principal = Depends(get_principal),
    limit: int = 20,
    offset: int = 0,
) -> Page[DocumentOut]:
    if not _can_upload(principal):
        raise forbidden("Document access is not enabled for this account.")
    limit = max(1, min(limit, settings.max_page_size))
    stmt = select(Document).where(
        Document.tenant_id == principal.tenant_id,
        Document.uploaded_by == principal.user_id,
    )
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(Document.created_at.desc()).limit(limit).offset(offset)
        )
    )
    return Page(
        items=[DocumentOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def register_document(
    payload: DocumentRegisterIn,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> DocumentOut:
    if not _can_upload(principal):
        raise forbidden("Document upload is not enabled for this account.")
    if principal.tenant_id is None:
        raise forbidden("Documents require an active organization.")
    document = Document(
        tenant_id=principal.tenant_id,
        owner_type="user",
        owner_id=principal.user_id,
        filename=payload.filename,
        storage_key=f"{settings.object_storage_provider}://{payload.checksum}",
        mime_type=payload.mime_type,
        size_bytes=payload.size_bytes,
        checksum=payload.checksum,
        scan_status="pending",
        classification=payload.classification,
        uploaded_by=principal.user_id,
    )
    db.add(document)
    db.flush()
    write_audit(
        db,
        principal,
        "document.registered",
        target_type="document",
        target_id=document.id,
        metadata={
            "mime_type": document.mime_type,
            "size_bytes": document.size_bytes,
            "classification": document.classification,
        },
    )
    db.commit()
    return DocumentOut.model_validate(document)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> DocumentOut:
    document = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.tenant_id == principal.tenant_id,
        )
    )
    if document is None or not _can_inspect(principal, document):
        raise not_found("document")
    return DocumentOut.model_validate(document)


@router.get("/{document_id}/download")
def download_document(
    document_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> None:
    document = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.tenant_id == principal.tenant_id,
        )
    )
    if document is None or not _can_inspect(principal, document):
        raise not_found("document")
    if document.scan_status != "clean":
        raise AppError(
            409,
            "document_not_available",
            "documents.errors.scan_pending",
            "The document is not available until security scanning completes.",
        )
    raise AppError(
        501,
        "document_storage_not_configured",
        "documents.errors.storage_not_configured",
        "Private document storage and signed downloads are not configured for this deployment.",
    )
