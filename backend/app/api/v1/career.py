from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.api.deps import DbSession, client_key, get_optional_principal
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, conflict, not_found
from app.core.ratelimit import limit_public_write
from app.db.models import CareerContent, ContentReport, Course, MockTest
from app.domains.identity import Principal

router = APIRouter(tags=["Public career content"])


class CareerContentOut(ORMModel):
    id: uuid.UUID
    content_type: str
    title: str
    slug: str
    locale: str
    summary: str | None
    body: str
    source: str | None
    source_checked_at: date | None
    effective_from: date | None
    expires_at: date | None
    geography: str | None
    currency: str | None
    salary_min: Decimal | None
    salary_max: Decimal | None
    salary_is_estimate: bool
    exam_authority: str | None
    syllabus_version: str | None
    published_at: datetime | None
    salary_disclaimer: str | None = None


class CourseOut(ORMModel):
    id: uuid.UUID
    title: str
    provider: str
    provider_url: str
    locale: str
    level: str
    format: str
    topic: str | None
    source_checked_at: date
    published_at: datetime | None


class ContentReportIn(BaseModel):
    content_type: str
    content_id: uuid.UUID
    reason_category: str = Field(min_length=2, max_length=60)
    comment: str | None = Field(default=None, max_length=2000)


class ContentReportOut(ORMModel):
    id: uuid.UUID
    content_type: str
    content_id: uuid.UUID
    reason_category: str
    status: str
    created_at: datetime


def _public_content_stmt():
    today = date.today()
    return select(CareerContent).where(
        CareerContent.tenant_id.is_(None),
        CareerContent.status == "published",
        CareerContent.published_at.is_not(None),
        or_(CareerContent.effective_from.is_(None), CareerContent.effective_from <= today),
        or_(CareerContent.expires_at.is_(None), CareerContent.expires_at >= today),
    )


def _with_disclaimer(item: CareerContent) -> CareerContentOut:
    payload = CareerContentOut.model_validate(item)
    if item.content_type == "salary":
        payload.salary_disclaimer = (
            "Salary information is indicative, geography-specific and may be an estimate. "
            "It is not a guarantee of pay or employment outcomes."
        )
    return payload


@router.get("/career/content", response_model=Page[CareerContentOut])
def list_career_content(
    db: DbSession,
    content_type: str | None = None,
    locale: str = "en",
    limit: int = 20,
    offset: int = 0,
) -> Page[CareerContentOut]:
    if locale not in {"en", "hi"}:
        raise AppError(
            400, "unsupported_locale", "errors.unsupported_locale", "Unsupported locale."
        )
    stmt = _public_content_stmt().where(CareerContent.locale == locale)
    if content_type:
        stmt = stmt.where(CareerContent.content_type == content_type)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(CareerContent.published_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[_with_disclaimer(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/career/content/{content_id}", response_model=CareerContentOut)
def get_career_content(content_id: uuid.UUID, db: DbSession) -> CareerContentOut:
    item = db.scalar(_public_content_stmt().where(CareerContent.id == content_id))
    if item is None:
        raise not_found("content")
    return _with_disclaimer(item)


@router.get("/career/exams/{content_id}", response_model=CareerContentOut)
def get_exam(content_id: uuid.UUID, db: DbSession) -> CareerContentOut:
    item = db.scalar(
        _public_content_stmt().where(
            CareerContent.id == content_id,
            CareerContent.content_type == "exam",
        )
    )
    if item is None:
        raise not_found("exam guide")
    return _with_disclaimer(item)


@router.get("/courses", response_model=Page[CourseOut])
def list_courses(
    db: DbSession,
    locale: str = "en",
    limit: int = 20,
    offset: int = 0,
) -> Page[CourseOut]:
    if locale not in {"en", "hi"}:
        raise AppError(
            400, "unsupported_locale", "errors.unsupported_locale", "Unsupported locale."
        )
    today = date.today()
    stmt = select(Course).where(
        Course.tenant_id.is_(None),
        Course.status == "published",
        Course.locale == locale,
        or_(Course.expires_at.is_(None), Course.expires_at >= today),
    )
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(Course.published_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[CourseOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(course_id: uuid.UUID, db: DbSession) -> CourseOut:
    today = date.today()
    course = db.scalar(
        select(Course).where(
            Course.id == course_id,
            Course.tenant_id.is_(None),
            Course.status == "published",
            or_(Course.expires_at.is_(None), Course.expires_at >= today),
        )
    )
    if course is None:
        raise not_found("course")
    return CourseOut.model_validate(course)


@router.post(
    "/content-reports",
    response_model=ContentReportOut,
    status_code=status.HTTP_201_CREATED,
)
def report_content(
    payload: ContentReportIn,
    request: Request,
    db: DbSession,
    principal: Principal | None = Depends(get_optional_principal),
) -> ContentReportOut:
    limit_public_write(client_key(request, principal))
    if payload.content_type not in {"career_content", "course", "mock_test", "exam"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid content type.")
    exists = False
    if payload.content_type in {"career_content", "exam"}:
        exists = db.scalar(
            _public_content_stmt().where(CareerContent.id == payload.content_id)
        ) is not None
    elif payload.content_type == "course":
        today = date.today()
        exists = db.scalar(
            select(Course).where(
                Course.id == payload.content_id,
                Course.tenant_id.is_(None),
                Course.status == "published",
                or_(Course.expires_at.is_(None), Course.expires_at >= today),
            )
        ) is not None
    else:
        exists = db.scalar(
            select(MockTest).where(
                MockTest.id == payload.content_id,
                MockTest.tenant_id.is_(None),
                MockTest.status == "published",
            )
        ) is not None
    if not exists:
        raise not_found("content")
    if principal is not None:
        duplicate = db.scalar(
            select(ContentReport.id)
            .where(
                ContentReport.reporter_user_id == principal.user_id,
                ContentReport.content_type == payload.content_type,
                ContentReport.content_id == payload.content_id,
                ContentReport.status.in_(["open", "triaged"]),
                ContentReport.created_at
                >= datetime.now(UTC) - timedelta(hours=24),
            )
            .limit(1)
        )
        if duplicate is not None:
            raise conflict(
                "duplicate_report",
                "You already reported this content and our editors are reviewing it.",
            )
    report = ContentReport(
        tenant_id=principal.tenant_id if principal else None,
        content_type=payload.content_type,
        content_id=payload.content_id,
        reporter_user_id=principal.user_id if principal else None,
        reason_category=payload.reason_category,
        comment=payload.comment,
        status="open",
    )
    db.add(report)
    db.commit()
    return ContentReportOut.model_validate(report)
