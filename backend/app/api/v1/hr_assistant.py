from __future__ import annotations

import re
import time
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.api.deps import DbSession, client_key, require_internal_permission
from app.api.v1.schemas.common import ORMModel
from app.core.config import settings
from app.core.errors import conflict, not_found
from app.core.logging import get_logger, request_id_ctx
from app.core.ratelimit import limit_ai
from app.db.models import (
    HRQueryCitation,
    HRQueryFeedback,
    HRQueryLog,
    KnowledgeChunk,
    PolicyDocument,
)
from app.domains.audit import write_audit
from app.domains.identity import Principal

router = APIRouter(prefix="/hr-assistant", tags=["HR knowledge assistant"])
logger = get_logger(__name__)

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"\+?\d[\d\s-]{7,}\d")


class QueryIn(BaseModel):
    question: str = Field(min_length=2, max_length=settings.max_question_chars)
    locale: str | None = None


class CitationOut(BaseModel):
    document_id: uuid.UUID
    title: str
    version: str
    locale: str
    section: str | None
    effective_from: str | None
    url: str


class ModelOut(BaseModel):
    name: str
    version: str


class QueryOut(BaseModel):
    query_log_id: uuid.UUID
    request_id: str
    answer: str
    answer_status: str
    citations: list[CitationOut]
    fallback: dict | None
    model: ModelOut


class FeedbackIn(BaseModel):
    query_log_id: uuid.UUID
    rating: int | None = Field(default=None, ge=1, le=5)
    flag_reason: str | None = Field(default=None, max_length=80)
    comment: str | None = Field(default=None, max_length=2000)


class FeedbackOut(ORMModel):
    id: uuid.UUID
    query_log_id: uuid.UUID
    rating: int | None
    flag_reason: str | None
    created_at: datetime


def redact_question(question: str) -> str:
    redacted = _EMAIL_RE.sub("[email]", question)
    redacted = _PHONE_RE.sub("[phone]", redacted)
    return redacted[:500]


@router.post("/queries", response_model=QueryOut)
def ask(
    payload: QueryIn,
    request: Request,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("hr_assistant.query")),
) -> QueryOut:
    limit_ai(client_key(request, principal))
    started = time.perf_counter()
    locale = payload.locale or principal.user.locale
    if locale not in settings.supported_locales:
        locale = principal.tenant.default_locale if principal.tenant else "en"

    terms = [term for term in re.findall(r"[\w\u0900-\u097F]+", payload.question) if len(term) > 2]
    stmt = (
        select(KnowledgeChunk, PolicyDocument)
        .join(PolicyDocument, PolicyDocument.id == KnowledgeChunk.policy_document_id)
        .where(
            KnowledgeChunk.tenant_id == principal.tenant_id,
            KnowledgeChunk.active.is_(True),
            PolicyDocument.tenant_id == principal.tenant_id,
            PolicyDocument.status == "published",
            PolicyDocument.locale == locale,
        )
        .limit(5)
    )
    if terms:
        filters = [KnowledgeChunk.content.ilike(f"%{term}%") for term in terms[:8]]
        stmt = stmt.where(or_(*filters))
    rows = list(db.execute(stmt).all())

    request_id = request_id_ctx.get()
    if not rows:
        chunks = []
        answer_status = "insufficient_evidence"
        answer = (
            "I could not find an approved policy source that answers this question. "
            "Please contact your HR support team for confirmation."
        )
        fallback = {
            "route": "hr_support",
            "message_key": "assistant.fallback.hr_support",
        }
    else:
        answer_status = "grounded"
        chunks = rows[:3]
        parts = []
        for index, (chunk, _document) in enumerate(chunks, start=1):
            text = " ".join(chunk.content.split())
            parts.append(f"{text[:700]} [{index}]")
        answer = "\n\n".join(parts)
        fallback = None

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    log = HRQueryLog(
        tenant_id=principal.tenant_id,
        user_id=principal.user_id,
        request_id=request_id,
        question_redacted=redact_question(payload.question),
        answer_status=answer_status,
        model_name=settings.ai_model_name,
        model_version="1",
        latency_ms=elapsed_ms,
        created_at=datetime.now(UTC),
    )
    db.add(log)
    db.flush()

    citations: list[CitationOut] = []
    for chunk, document in chunks:
        db.add(
            HRQueryCitation(
                query_log_id=log.id,
                document_id=document.id,
                section=chunk.section,
                title_snapshot=document.title,
            )
        )
        citations.append(
            CitationOut(
                document_id=document.id,
                title=document.title,
                version=document.version,
                locale=document.locale,
                section=chunk.section,
                effective_from=document.effective_from.isoformat()
                if document.effective_from
                else None,
                url=f"/api/v1/policies/{document.id}/download",
            )
        )

    write_audit(
        db,
        principal,
        "ai.query.completed",
        target_type="hr_query",
        target_id=log.id,
        metadata={"answer_status": answer_status, "citation_count": len(citations)},
    )
    db.commit()
    return QueryOut(
        query_log_id=log.id,
        request_id=request_id,
        answer=answer,
        answer_status=answer_status,
        citations=citations,
        fallback=fallback,
        model=ModelOut(name=settings.ai_model_name, version="1"),
    )


@router.post(
    "/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED
)
def feedback(
    payload: FeedbackIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("hr_assistant.feedback")),
) -> FeedbackOut:
    log = db.scalar(
        select(HRQueryLog).where(
            HRQueryLog.id == payload.query_log_id,
            HRQueryLog.tenant_id == principal.tenant_id,
        )
    )
    if log is None:
        raise not_found("query")
    existing = db.scalar(
        select(HRQueryFeedback).where(
            HRQueryFeedback.query_log_id == log.id,
            HRQueryFeedback.user_id == principal.user_id,
        )
    )
    if existing is not None:
        raise conflict("conflict", "Feedback was already submitted for this answer.")
    item = HRQueryFeedback(
        tenant_id=principal.tenant_id,
        query_log_id=log.id,
        user_id=principal.user_id,
        rating=payload.rating,
        flag_reason=payload.flag_reason,
        comment=payload.comment,
        created_at=datetime.now(UTC),
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        principal,
        "ai.feedback.created",
        target_type="hr_query_feedback",
        target_id=item.id,
    )
    db.commit()
    return FeedbackOut.model_validate(item)
