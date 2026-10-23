from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import (
    DbSession,
    require_any_internal_permission,
    require_internal_permission,
)
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, forbidden, invalid_state, not_found
from app.db.models import CareerContent, ContentReview, ContentVersion, Course, MockTest, Question
from app.domains.audit import write_audit, write_outbox
from app.domains.identity import Principal

router = APIRouter(prefix="/admin", tags=["Content administration"])

CONTENT_TRANSITIONS = {
    "draft": {"in_review", "archived"},
    "in_review": {"approved", "draft", "archived"},
    "approved": {"published", "draft", "archived"},
    "published": {"expired", "archived"},
    "expired": {"archived", "draft"},
    "archived": set(),
}


class ContentIn(BaseModel):
    content_type: str
    title: str = Field(min_length=2, max_length=250)
    slug: str = Field(min_length=2, max_length=250)
    locale: str = "en"
    summary: str | None = Field(default=None, max_length=2000)
    body: str = Field(min_length=20)
    source: str | None = Field(default=None, max_length=255)
    source_checked_at: date | None = None
    effective_from: date | None = None
    expires_at: date | None = None
    geography: str | None = Field(default=None, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_is_estimate: bool = True
    exam_authority: str | None = Field(default=None, max_length=200)
    syllabus_version: str | None = Field(default=None, max_length=80)


class ContentOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None
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
    status: str
    published_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class ReviewIn(BaseModel):
    decision: str
    comments: str | None = Field(default=None, max_length=2000)


class ReviewOut(ORMModel):
    id: uuid.UUID
    content_id: uuid.UUID
    content_version: int
    reviewer_user_id: uuid.UUID
    decision: str
    comments: str | None
    created_at: datetime


class CourseIn(BaseModel):
    title: str = Field(min_length=2, max_length=250)
    provider: str = Field(min_length=1, max_length=200)
    provider_url: str = Field(min_length=5, max_length=500)
    locale: str = "en"
    level: str = "beginner"
    format: str = "online"
    topic: str | None = Field(default=None, max_length=120)
    source_checked_at: date
    expires_at: date | None = None

    @field_validator("provider_url")
    @classmethod
    def https_url(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("provider_url must be an HTTP(S) URL")
        return value


class CourseAdminOut(ORMModel):
    id: uuid.UUID
    title: str
    provider: str
    provider_url: str
    locale: str
    level: str
    format: str
    topic: str | None
    source_checked_at: date
    expires_at: date | None
    status: str
    published_at: datetime | None
    version: int


class TestIn(BaseModel):
    title: str = Field(min_length=2, max_length=250)
    description: str | None = Field(default=None, max_length=2000)
    locale: str = "en"
    duration_minutes: int = Field(default=30, ge=1, le=480)
    pass_score: int = Field(default=60, ge=0, le=100)


class TestAdminOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    locale: str
    duration_minutes: int
    pass_score: int
    status: str
    published_at: datetime | None
    version: int


class QuestionIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=5000)
    options: list[dict]
    correct_answer: dict
    explanation: str | None = Field(default=None, max_length=2000)
    max_score: int = Field(default=1, ge=1, le=100)


class QuestionAdminOut(ORMModel):
    id: uuid.UUID
    test_id: uuid.UUID
    position: int
    prompt: str
    options: list
    correct_answer: dict
    explanation: str | None
    max_score: int


def _snapshot(item: CareerContent) -> dict:
    return {
        "title": item.title,
        "slug": item.slug,
        "summary": item.summary,
        "body": item.body,
        "source": item.source,
        "source_checked_at": item.source_checked_at.isoformat()
        if item.source_checked_at
        else None,
        "effective_from": item.effective_from.isoformat()
        if item.effective_from
        else None,
        "expires_at": item.expires_at.isoformat() if item.expires_at else None,
        "geography": item.geography,
        "currency": item.currency,
        "salary_min": str(item.salary_min) if item.salary_min is not None else None,
        "salary_max": str(item.salary_max) if item.salary_max is not None else None,
        "salary_is_estimate": item.salary_is_estimate,
        "exam_authority": item.exam_authority,
        "syllabus_version": item.syllabus_version,
    }


def _version_snapshot(
    db: Session, item: CareerContent, actor_id: uuid.UUID
) -> None:
    db.add(
        ContentVersion(
            content_id=item.id,
            version=item.version,
            snapshot=_snapshot(item),
            created_by=actor_id,
            created_at=datetime.now(UTC),
        )
    )


def _validate_content(item: CareerContent) -> None:
    if item.content_type not in {"job", "salary", "exam", "article"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid content type.")
    if item.locale not in {"en", "hi"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid locale.")
    if item.content_type == "salary":
        if item.salary_min is None or item.salary_max is None or not item.currency:
            raise AppError(
                422,
                "business_rule_violation",
                "content.errors.salary_requires_range",
                "Salary content requires a currency and minimum/maximum range.",
            )
        if item.salary_max < item.salary_min:
            raise AppError(
                422,
                "business_rule_violation",
                "content.errors.salary_range",
                "Salary maximum cannot be below salary minimum.",
            )
    if item.content_type == "exam" and not item.exam_authority:
        raise AppError(
            422,
            "business_rule_violation",
            "content.errors.exam_authority_required",
            "Exam content requires an authoritative exam body.",
        )
    if item.effective_from and item.expires_at and item.expires_at < item.effective_from:
        raise AppError(
            422,
            "business_rule_violation",
            "content.errors.expiry_before_effective",
            "Expiry cannot precede the effective date.",
        )


def _load(db: Session, content_id: uuid.UUID) -> CareerContent:
    item = db.get(CareerContent, content_id)
    if item is None or item.tenant_id is not None:
        raise not_found("content")
    return item


@router.get("/content", response_model=Page[ContentOut])
def list_content(
    db: DbSession,
    principal: Principal = Depends(
        require_any_internal_permission("career_content.edit", "career_content.review")
    ),
    status_filter: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> Page[ContentOut]:
    stmt = select(CareerContent).where(CareerContent.tenant_id.is_(None))
    if status_filter:
        stmt = stmt.where(CareerContent.status == status_filter)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(CareerContent.updated_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[ContentOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/content", response_model=ContentOut, status_code=status.HTTP_201_CREATED)
def create_content(
    payload: ContentIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("career_content.edit")),
) -> ContentOut:
    item = CareerContent(
        tenant_id=None,
        content_type=payload.content_type,
        title=payload.title,
        slug=payload.slug,
        locale=payload.locale,
        summary=payload.summary,
        body=payload.body,
        source=payload.source,
        source_checked_at=payload.source_checked_at,
        effective_from=payload.effective_from,
        expires_at=payload.expires_at,
        geography=payload.geography,
        currency=payload.currency.upper() if payload.currency else None,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
        salary_is_estimate=payload.salary_is_estimate,
        exam_authority=payload.exam_authority,
        syllabus_version=payload.syllabus_version,
        status="draft",
        created_by=principal.user_id,
    )
    _validate_content(item)
    db.add(item)
    db.flush()
    _version_snapshot(db, item, principal.user_id)
    write_audit(
        db,
        principal,
        "content.drafted",
        target_type="career_content",
        target_id=item.id,
    )
    db.commit()
    return ContentOut.model_validate(item)


@router.patch("/content/{content_id}", response_model=ContentOut)
def update_content(
    content_id: uuid.UUID,
    payload: ContentIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("career_content.edit")),
) -> ContentOut:
    item = _load(db, content_id)
    if item.status not in {"draft", "in_review"}:
        raise invalid_state("Only draft or in-review content can be edited.")
    for field in (
        "content_type",
        "title",
        "slug",
        "locale",
        "summary",
        "body",
        "source",
        "source_checked_at",
        "effective_from",
        "expires_at",
        "geography",
        "salary_min",
        "salary_max",
        "salary_is_estimate",
        "exam_authority",
        "syllabus_version",
    ):
        setattr(item, field, getattr(payload, field))
    item.currency = payload.currency.upper() if payload.currency else None
    _validate_content(item)
    item.version += 1
    item.status = "draft"
    db.add(item)
    _version_snapshot(db, item, principal.user_id)
    write_audit(
        db,
        principal,
        "content.drafted",
        target_type="career_content",
        target_id=item.id,
        metadata={"version": item.version},
    )
    db.commit()
    return ContentOut.model_validate(item)


@router.post("/content/{content_id}/submit-review", response_model=ContentOut)
def submit_for_review(
    content_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("career_content.edit")),
) -> ContentOut:
    item = _load(db, content_id)
    if "in_review" not in CONTENT_TRANSITIONS[item.status]:
        raise invalid_state("This content cannot be submitted for review.")
    if not item.source or not item.source_checked_at:
        raise AppError(
            422,
            "business_rule_violation",
            "content.errors.source_required",
            "A named source and source-check date are required before review.",
        )
    item.status = "in_review"
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "content.review_requested",
        target_type="career_content",
        target_id=item.id,
    )
    db.commit()
    return ContentOut.model_validate(item)


@router.post("/content/{content_id}/review", response_model=ReviewOut)
def review_content(
    content_id: uuid.UUID,
    payload: ReviewIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("career_content.review")),
) -> ReviewOut:
    if payload.decision not in {"approved", "changes_requested", "rejected"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid decision.")
    item = _load(db, content_id)
    if item.status != "in_review":
        raise invalid_state("Only content in review can be reviewed.")
    if item.created_by == principal.user_id:
        raise forbidden("Content authors cannot review their own submission.")
    review = ContentReview(
        content_id=item.id,
        content_version=item.version,
        reviewer_user_id=principal.user_id,
        decision=payload.decision,
        comments=payload.comments,
        created_at=datetime.now(UTC),
    )
    db.add(review)
    item.status = "approved" if payload.decision == "approved" else "draft"
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "content.reviewed",
        target_type="career_content",
        target_id=item.id,
        metadata={"decision": payload.decision},
    )
    db.commit()
    return ReviewOut.model_validate(review)


@router.post("/content/{content_id}/publish", response_model=ContentOut)
def publish_content(
    content_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("career_content.publish")),
) -> ContentOut:
    item = _load(db, content_id)
    if item.status != "approved":
        raise invalid_state("Only approved content can be published.")
    if not item.source or not item.source_checked_at:
        raise AppError(
            422,
            "business_rule_violation",
            "content.errors.source_required",
            "A source and source-check date are required before publishing.",
        )
    if item.expires_at and item.expires_at < date.today():
        raise AppError(
            422,
            "business_rule_violation",
            "content.errors.expired",
            "Expired content cannot be published.",
        )
    approval = db.scalar(
        select(ContentReview.id)
        .where(
            ContentReview.content_id == item.id,
            ContentReview.decision == "approved",
        )
        .order_by(ContentReview.created_at.desc())
        .limit(1)
    )
    if approval is None:
        raise invalid_state("Content requires an approved review before publishing.")
    item.status = "published"
    item.published_at = datetime.now(UTC)
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "content.published",
        target_type="career_content",
        target_id=item.id,
    )
    write_outbox(
        db,
        None,
        "content.published",
        "career_content",
        item.id,
        {"content_type": item.content_type, "locale": item.locale},
    )
    db.commit()
    return ContentOut.model_validate(item)


@router.post("/content/{content_id}/archive", response_model=ContentOut)
def archive_content(
    content_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("career_content.publish")),
) -> ContentOut:
    item = _load(db, content_id)
    if "archived" not in CONTENT_TRANSITIONS[item.status]:
        raise invalid_state("This content cannot be archived.")
    item.status = "archived"
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "content.archived",
        target_type="career_content",
        target_id=item.id,
    )
    db.commit()
    return ContentOut.model_validate(item)


@router.get("/courses", response_model=Page[CourseAdminOut])
def list_courses(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("course.manage")),
    limit: int = 20,
    offset: int = 0,
) -> Page[CourseAdminOut]:
    stmt = select(Course).where(Course.tenant_id.is_(None))
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(Course.updated_at.desc()).limit(min(limit, 100)).offset(offset)
        )
    )
    return Page(
        items=[CourseAdminOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/courses", response_model=CourseAdminOut, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("course.manage")),
) -> CourseAdminOut:
    if payload.level not in {"beginner", "intermediate", "advanced", "all"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid level.")
    course = Course(
        tenant_id=None,
        title=payload.title,
        provider=payload.provider,
        provider_url=payload.provider_url,
        locale=payload.locale,
        level=payload.level,
        format=payload.format,
        topic=payload.topic,
        source_checked_at=payload.source_checked_at,
        expires_at=payload.expires_at,
        status="draft",
        created_by=principal.user_id,
    )
    if payload.locale not in {"en", "hi"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid locale.")
    db.add(course)
    db.flush()
    write_audit(
        db,
        principal,
        "content.drafted",
        target_type="course",
        target_id=course.id,
    )
    db.commit()
    return CourseAdminOut.model_validate(course)


@router.post("/courses/{course_id}/publish", response_model=CourseAdminOut)
def publish_course(
    course_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("course.manage")),
) -> CourseAdminOut:
    course = db.get(Course, course_id)
    if course is None or course.tenant_id is not None:
        raise not_found("course")
    if course.status != "draft":
        raise invalid_state("Only draft courses can be published from this endpoint.")
    if course.expires_at and course.expires_at < date.today():
        raise AppError(
            422, "business_rule_violation", "content.errors.expired", "Course has expired."
        )
    course.status = "published"
    course.published_at = datetime.now(UTC)
    course.version += 1
    db.add(course)
    write_audit(
        db,
        principal,
        "content.published",
        target_type="course",
        target_id=course.id,
    )
    db.commit()
    return CourseAdminOut.model_validate(course)


@router.get("/mock-tests", response_model=Page[TestAdminOut])
def list_tests(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("assessment.manage")),
    limit: int = 20,
    offset: int = 0,
) -> Page[TestAdminOut]:
    stmt = select(MockTest).where(MockTest.tenant_id.is_(None))
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(MockTest.updated_at.desc()).limit(min(limit, 100)).offset(offset)
        )
    )
    return Page(
        items=[TestAdminOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/mock-tests", response_model=TestAdminOut, status_code=status.HTTP_201_CREATED)
def create_test(
    payload: TestIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("assessment.manage")),
) -> TestAdminOut:
    if payload.locale not in {"en", "hi"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid locale.")
    test = MockTest(
        tenant_id=None,
        title=payload.title,
        description=payload.description,
        locale=payload.locale,
        duration_minutes=payload.duration_minutes,
        pass_score=payload.pass_score,
        status="draft",
    )
    db.add(test)
    db.flush()
    write_audit(
        db,
        principal,
        "content.drafted",
        target_type="mock_test",
        target_id=test.id,
    )
    db.commit()
    return TestAdminOut.model_validate(test)


@router.post(
    "/mock-tests/{test_id}/questions",
    response_model=QuestionAdminOut,
    status_code=status.HTTP_201_CREATED,
)
def add_question(
    test_id: uuid.UUID,
    payload: QuestionIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("assessment.manage")),
) -> QuestionAdminOut:
    test = db.get(MockTest, test_id)
    if test is None or test.tenant_id is not None:
        raise not_found("mock test")
    if test.status != "draft":
        raise invalid_state("Questions can only be added to a draft test.")
    if not payload.options:
        raise AppError(
            422,
            "business_rule_violation",
            "assessment.errors.options_required",
            "A question requires answer options.",
        )
    option_ids = {str(item.get("id")) for item in payload.options if item.get("id")}
    correct_id = str(payload.correct_answer.get("option_id"))
    if not option_ids or correct_id not in option_ids:
        raise AppError(
            422,
            "business_rule_violation",
            "assessment.errors.invalid_answer_key",
            "The correct answer must reference an option ID.",
        )
    position = len(
        list(db.scalars(select(Question.id).where(Question.test_id == test.id)))
    ) + 1
    question = Question(
        test_id=test.id,
        position=position,
        prompt=payload.prompt,
        options=payload.options,
        correct_answer=payload.correct_answer,
        explanation=payload.explanation,
        max_score=payload.max_score,
    )
    db.add(question)
    db.flush()
    write_audit(
        db,
        principal,
        "content.drafted",
        target_type="question",
        target_id=question.id,
    )
    db.commit()
    return QuestionAdminOut.model_validate(question)


@router.post("/mock-tests/{test_id}/publish", response_model=TestAdminOut)
def publish_test(
    test_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("assessment.manage")),
) -> TestAdminOut:
    test = db.get(MockTest, test_id)
    if test is None or test.tenant_id is not None:
        raise not_found("mock test")
    if test.status != "draft":
        raise invalid_state("Only draft tests can be published.")
    if not list(db.scalars(select(Question.id).where(Question.test_id == test.id))):
        raise AppError(
            422,
            "business_rule_violation",
            "assessment.errors.questions_required",
            "At least one question is required before publishing.",
        )
    test.status = "published"
    test.published_at = datetime.now(UTC)
    test.version += 1
    db.add(test)
    write_audit(
        db,
        principal,
        "content.published",
        target_type="mock_test",
        target_id=test.id,
    )
    db.commit()
    return TestAdminOut.model_validate(test)


@router.get("/mock-tests/{test_id}/questions", response_model=list[QuestionAdminOut])
def list_questions(
    test_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("assessment.manage")),
) -> list[QuestionAdminOut]:
    test = db.get(MockTest, test_id)
    if test is None or test.tenant_id is not None:
        raise not_found("mock test")
    return [
        QuestionAdminOut.model_validate(row)
        for row in db.scalars(
            select(Question)
            .where(Question.test_id == test.id)
            .order_by(Question.position)
        )
    ]
