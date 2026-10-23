from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import DbSession, require_permission
from app.api.v1.schemas.common import ORMModel
from app.core.errors import AppError, conflict, not_found
from app.db.models import ResumeProfile
from app.domains.audit import write_audit
from app.domains.identity import Principal

router = APIRouter(prefix="/resume-profiles", tags=["Resume profiles"])


class ResumeIn(BaseModel):
    headline: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=5000)
    data: dict = Field(default_factory=dict)


class ResumeOut(ORMModel):
    id: uuid.UUID
    headline: str | None
    summary: str | None
    data: dict
    version: int
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=ResumeOut)
def get_my_resume(
    db: DbSession,
    principal: Principal = Depends(require_permission("resume.manage_own")),
) -> ResumeOut:
    profile = db.scalar(
        select(ResumeProfile).where(ResumeProfile.user_id == principal.user_id)
    )
    if profile is None:
        raise not_found("resume profile")
    return ResumeOut.model_validate(profile)


@router.post("", response_model=ResumeOut, status_code=status.HTTP_201_CREATED)
def create_resume(
    payload: ResumeIn,
    db: DbSession,
    principal: Principal = Depends(require_permission("resume.manage_own")),
) -> ResumeOut:
    existing = db.scalar(
        select(ResumeProfile).where(ResumeProfile.user_id == principal.user_id)
    )
    if existing is not None:
        raise conflict("conflict", "A resume profile already exists.")
    profile = ResumeProfile(
        tenant_id=principal.tenant_id,
        user_id=principal.user_id,
        headline=payload.headline,
        summary=payload.summary,
        data=payload.data,
    )
    db.add(profile)
    db.flush()
    write_audit(
        db,
        principal,
        "resume.created",
        target_type="resume_profile",
        target_id=profile.id,
    )
    db.commit()
    return ResumeOut.model_validate(profile)


@router.patch("/{profile_id}", response_model=ResumeOut)
def update_resume(
    profile_id: uuid.UUID,
    payload: ResumeIn,
    db: DbSession,
    principal: Principal = Depends(require_permission("resume.manage_own")),
) -> ResumeOut:
    profile = db.scalar(
        select(ResumeProfile).where(
            ResumeProfile.id == profile_id,
            ResumeProfile.user_id == principal.user_id,
        )
    )
    if profile is None:
        raise not_found("resume profile")
    profile.headline = payload.headline
    profile.summary = payload.summary
    profile.data = payload.data
    profile.version += 1
    db.add(profile)
    write_audit(
        db,
        principal,
        "resume.updated",
        target_type="resume_profile",
        target_id=profile.id,
    )
    db.commit()
    return ResumeOut.model_validate(profile)


@router.post("/{profile_id}/export")
def export_resume(
    profile_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_permission("resume.manage_own")),
) -> dict:
    profile = db.scalar(
        select(ResumeProfile).where(
            ResumeProfile.id == profile_id,
            ResumeProfile.user_id == principal.user_id,
        )
    )
    if profile is None:
        raise not_found("resume profile")
    # The SRS deliberately leaves export format/sharing undecided. Do not invent
    # a document format or sharing mechanism in the MVP.
    raise AppError(
        501,
        "resume_export_not_configured",
        "resume.errors.export_not_configured",
        "Resume export is pending product/privacy approval.",
    )
