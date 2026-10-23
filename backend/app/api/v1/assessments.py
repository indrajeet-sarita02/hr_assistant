from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession, require_permission
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, conflict, forbidden, invalid_state, not_found
from app.db.models import (
    AssessmentAttemptEvent,
    AttemptAnswer,
    MockTest,
    Question,
    TestAttempt,
)
from app.domains.audit import write_audit
from app.domains.idempotency import begin, complete
from app.domains.identity import Principal

router = APIRouter(tags=["Mock tests"])
IdempotencyHeader = Annotated[str, Header(alias="Idempotency-Key")]


class MockTestOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    locale: str
    duration_minutes: int
    pass_score: int


class QuestionSafe(BaseModel):
    id: uuid.UUID
    position: int
    prompt: str
    options: list
    max_score: int


class AttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    test_id: uuid.UUID
    status: str
    started_at: datetime
    expires_at: datetime
    submitted_at: datetime | None
    score: int | None
    max_score: int | None
    questions: list[QuestionSafe] = Field(default_factory=list)


class AnswerIn(BaseModel):
    question_id: uuid.UUID
    answer: dict


class AutosaveIn(BaseModel):
    answers: list[AnswerIn] = Field(default_factory=list)


class SubmitOut(BaseModel):
    attempt_id: uuid.UUID
    status: str
    score: int | None
    max_score: int | None
    passed: bool | None


class ReviewQuestion(BaseModel):
    question_id: uuid.UUID
    prompt: str
    options: list
    answer: dict | None
    correct_answer: dict
    explanation: str | None
    is_correct: bool | None
    score: int | None


class ReviewOut(BaseModel):
    attempt_id: uuid.UUID
    score: int | None
    max_score: int | None
    passed: bool | None
    questions: list[ReviewQuestion]


def _test(db: Session, test_id: uuid.UUID) -> MockTest:
    test = db.scalar(
        select(MockTest).where(
            MockTest.id == test_id,
            MockTest.tenant_id.is_(None),
            MockTest.status == "published",
        )
    )
    if test is None:
        raise not_found("mock test")
    return test


def _attempt(db: Session, principal: Principal, attempt_id: uuid.UUID) -> TestAttempt:
    attempt = db.scalar(
        select(TestAttempt).where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == principal.user_id,
        )
    )
    if attempt is None:
        raise not_found("attempt")
    return attempt


@router.get("/mock-tests", response_model=Page[MockTestOut])
def list_tests(
    db: DbSession,
    locale: str = "en",
    limit: int = 20,
    offset: int = 0,
) -> Page[MockTestOut]:
    if locale not in {"en", "hi"}:
        raise AppError(
            400, "unsupported_locale", "errors.unsupported_locale", "Unsupported locale."
        )
    stmt = select(MockTest).where(
        MockTest.tenant_id.is_(None),
        MockTest.status == "published",
        MockTest.locale == locale,
    )
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(MockTest.published_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[MockTestOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/mock-tests/{test_id}/attempts",
    response_model=AttemptOut,
    status_code=status.HTTP_201_CREATED,
)
def start_attempt(
    test_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_permission("assessment.attempt_own")),
) -> AttemptOut:
    test = _test(db, test_id)
    now = datetime.now(UTC)
    existing = db.scalar(
        select(TestAttempt).where(
            TestAttempt.test_id == test.id,
            TestAttempt.user_id == principal.user_id,
            TestAttempt.status == "in_progress",
        )
    )
    if existing is not None:
        if existing.expires_at > now:
            questions = list(
                db.scalars(
                    select(Question)
                    .where(Question.test_id == test.id)
                    .order_by(Question.position)
                )
            )
            return AttemptOut(
                **AttemptOut.model_validate(existing).model_dump(exclude={"questions"}),
                questions=[
                    QuestionSafe(
                        id=q.id,
                        position=q.position,
                        prompt=q.prompt,
                        options=q.options,
                        max_score=q.max_score,
                    )
                    for q in questions
                ],
            )
        existing.status = "abandoned"
        db.add(existing)
        db.flush()

    attempt = TestAttempt(
        tenant_id=principal.tenant_id,
        test_id=test.id,
        user_id=principal.user_id,
        status="in_progress",
        started_at=now,
        expires_at=now + timedelta(minutes=test.duration_minutes),
    )
    db.add(attempt)
    db.flush()
    db.add(
        AssessmentAttemptEvent(
            attempt_id=attempt.id,
            event_type="started",
            payload={},
            created_at=now,
        )
    )
    write_audit(
        db,
        principal,
        "assessment.attempt.started",
        target_type="test_attempt",
        target_id=attempt.id,
        metadata={"test_id": str(test.id)},
    )
    db.commit()
    questions = list(
        db.scalars(
            select(Question)
            .where(Question.test_id == test.id)
            .order_by(Question.position)
        )
    )
    return AttemptOut(
        **AttemptOut.model_validate(attempt).model_dump(exclude={"questions"}),
        questions=[
            QuestionSafe(
                id=q.id,
                position=q.position,
                prompt=q.prompt,
                options=q.options,
                max_score=q.max_score,
            )
            for q in questions
        ],
    )


@router.get("/mock-test-attempts/{attempt_id}", response_model=AttemptOut)
def get_attempt(
    attempt_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_permission("assessment.attempt_own")),
) -> AttemptOut:
    attempt = _attempt(db, principal, attempt_id)
    if attempt.status != "in_progress":
        raise invalid_state("This attempt is no longer in progress.")
    if attempt.expires_at < datetime.now(UTC):
        attempt.status = "abandoned"
        db.add(attempt)
        db.commit()
        raise invalid_state("This attempt has expired.")
    questions = list(
        db.scalars(
            select(Question)
            .where(Question.test_id == attempt.test_id)
            .order_by(Question.position)
        )
    )
    # The response shape stays answer-key safe and never exposes correctness.
    # Saved answers are intentionally not echoed here; the client keeps its
    # local draft and autosaves it explicitly.
    return AttemptOut(
        **AttemptOut.model_validate(attempt).model_dump(exclude={"questions"}),
        questions=[
            QuestionSafe(
                id=q.id,
                position=q.position,
                prompt=q.prompt,
                options=q.options,
                max_score=q.max_score,
            )
            for q in questions
        ],
    )


@router.patch("/mock-test-attempts/{attempt_id}", response_model=AttemptOut)
def autosave(
    attempt_id: uuid.UUID,
    payload: AutosaveIn,
    db: DbSession,
    principal: Principal = Depends(require_permission("assessment.attempt_own")),
) -> AttemptOut:
    attempt = _attempt(db, principal, attempt_id)
    if attempt.status != "in_progress":
        raise invalid_state("This attempt is no longer in progress.")
    if attempt.expires_at < datetime.now(UTC):
        attempt.status = "abandoned"
        db.add(attempt)
        db.commit()
        raise invalid_state("This attempt has expired.")
    question_ids = set(
        db.scalars(
            select(Question.id).where(Question.test_id == attempt.test_id)
        )
    )
    for answer in payload.answers:
        if answer.question_id not in question_ids:
            raise AppError(
                422,
                "business_rule_violation",
                "assessment.errors.question_not_in_test",
                "An answer references a question outside this test.",
            )
        existing = db.scalar(
            select(AttemptAnswer).where(
                AttemptAnswer.attempt_id == attempt.id,
                AttemptAnswer.question_id == answer.question_id,
            )
        )
        if existing is None:
            db.add(
                AttemptAnswer(
                    attempt_id=attempt.id,
                    question_id=answer.question_id,
                    answer=answer.answer,
                )
            )
        else:
            existing.answer = answer.answer
            db.add(existing)
    attempt.version += 1
    db.add(attempt)
    db.add(
        AssessmentAttemptEvent(
            attempt_id=attempt.id,
            event_type="autosaved",
            payload={"answer_count": len(payload.answers)},
            created_at=datetime.now(UTC),
        )
    )
    db.commit()
    questions = list(
        db.scalars(
            select(Question)
            .where(Question.test_id == attempt.test_id)
            .order_by(Question.position)
        )
    )
    return AttemptOut(
        **AttemptOut.model_validate(attempt).model_dump(exclude={"questions"}),
        questions=[
            QuestionSafe(
                id=q.id,
                position=q.position,
                prompt=q.prompt,
                options=q.options,
                max_score=q.max_score,
            )
            for q in questions
        ],
    )


@router.post(
    "/mock-test-attempts/{attempt_id}/submit",
    response_model=SubmitOut,
)
def submit_attempt(
    attempt_id: uuid.UUID,
    response: Response,
    idempotency_key: IdempotencyHeader,
    db: DbSession,
    principal: Principal = Depends(require_permission("assessment.attempt_own")),
) -> SubmitOut:
    state = begin(
        db,
        principal,
        "POST /api/v1/mock-test-attempts/submit",
        idempotency_key,
        {"attempt_id": str(attempt_id)},
    )
    if state.replay:
        response.status_code = state.record.response_status or 200
        return SubmitOut.model_validate(state.record.response_body)

    attempt = _attempt(db, principal, attempt_id)
    if attempt.status in {"submitted", "evaluated"}:
        raise conflict("already_submitted", "This attempt was already submitted.")
    if attempt.status != "in_progress":
        raise invalid_state("This attempt cannot be submitted.")
    if attempt.expires_at + timedelta(minutes=5) < datetime.now(UTC):
        attempt.status = "abandoned"
        db.add(attempt)
        db.commit()
        raise invalid_state("This attempt has expired.")
    questions = list(
        db.scalars(
            select(Question)
            .where(Question.test_id == attempt.test_id)
            .order_by(Question.position)
        )
    )
    answers = {
        item.question_id: item
        for item in db.scalars(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
        )
    }
    total = 0
    max_score = sum(question.max_score for question in questions)
    for question in questions:
        answer = answers.get(question.id)
        if answer is None:
            continue
        is_correct = answer.answer.get("option_id") == question.correct_answer.get(
            "option_id"
        )
        answer.is_correct = is_correct
        answer.score = question.max_score if is_correct else 0
        total += answer.score
        db.add(answer)
    attempt.status = "evaluated"
    attempt.submitted_at = datetime.now(UTC)
    attempt.score = total
    attempt.max_score = max_score
    attempt.version += 1
    db.add(attempt)
    db.add(
        AssessmentAttemptEvent(
            attempt_id=attempt.id,
            event_type="submitted",
            payload={"score": total, "max_score": max_score},
            created_at=datetime.now(UTC),
        )
    )
    write_audit(
        db,
        principal,
        "assessment.attempt.submitted",
        target_type="test_attempt",
        target_id=attempt.id,
        metadata={"score": total, "max_score": max_score},
    )
    test = db.get(MockTest, attempt.test_id)
    passed = (
        round(total / max_score * 100) >= test.pass_score
        if max_score and test
        else None
    )
    body = SubmitOut(
        attempt_id=attempt.id,
        status=attempt.status,
        score=total,
        max_score=max_score,
        passed=passed,
    ).model_dump(mode="json")
    complete(
        db,
        state,
        status_code=200,
        body=body,
        resource_type="test_attempt",
        resource_id=attempt.id,
    )
    db.commit()
    return SubmitOut.model_validate(body)


@router.get("/mock-test-attempts/{attempt_id}/review", response_model=ReviewOut)
def review_attempt(
    attempt_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_permission("assessment.attempt_own")),
) -> ReviewOut:
    attempt = _attempt(db, principal, attempt_id)
    if attempt.status != "evaluated":
        raise forbidden("Review is available only after evaluation.")
    questions = list(
        db.scalars(
            select(Question)
            .where(Question.test_id == attempt.test_id)
            .order_by(Question.position)
        )
    )
    answers = {
        item.question_id: item
        for item in db.scalars(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
        )
    }
    test = db.get(MockTest, attempt.test_id)
    passed = (
        round((attempt.score or 0) / (attempt.max_score or 1) * 100) >= test.pass_score
        if test
        else None
    )
    return ReviewOut(
        attempt_id=attempt.id,
        score=attempt.score,
        max_score=attempt.max_score,
        passed=passed,
        questions=[
            ReviewQuestion(
                question_id=question.id,
                prompt=question.prompt,
                options=question.options,
                answer=answers[question.id].answer if question.id in answers else None,
                correct_answer=question.correct_answer,
                explanation=question.explanation,
                is_correct=answers[question.id].is_correct if question.id in answers else None,
                score=answers[question.id].score if question.id in answers else None,
            )
            for question in questions
        ],
    )
