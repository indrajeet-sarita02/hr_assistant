from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.deps import (
    DbSession,
    require_any_internal_permission,
    require_internal_permission,
)
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, forbidden, invalid_state, not_found
from app.db.models import (
    Application,
    ApplicationStageHistory,
    Candidate,
    CandidateConsent,
    Interview,
    InterviewFeedback,
    InterviewParticipant,
    PrivacyNoticeVersion,
    Requisition,
    RequisitionApproval,
)
from app.domains.audit import write_audit, write_outbox
from app.domains.identity import Principal

router = APIRouter(prefix="/recruitment", tags=["Recruitment"])

STAGE_TRANSITIONS = {
    "received": {"screening", "rejected", "withdrawn"},
    "screening": {"interview", "rejected", "withdrawn"},
    "interview": {"offer", "rejected", "withdrawn"},
    "offer": {"hired", "rejected", "withdrawn"},
    "hired": set(),
    "rejected": set(),
    "withdrawn": set(),
}


class RequisitionIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    department_id: uuid.UUID | None = None
    location: str | None = Field(default=None, max_length=160)
    employment_type: str = "full_time"
    description: str = Field(min_length=10)


class RequisitionOut(ORMModel):
    id: uuid.UUID
    title: str
    department_id: uuid.UUID | None
    location: str | None
    employment_type: str
    description: str
    status: str
    version: int
    approved_at: datetime | None
    created_at: datetime


class ApprovalIn(BaseModel):
    decision: str
    comment: str | None = Field(default=None, max_length=2000)


class ApprovalOut(ORMModel):
    id: uuid.UUID
    requisition_id: uuid.UUID
    approver_user_id: uuid.UUID
    decision: str
    comment: str | None
    created_at: datetime


class ApplicationIn(BaseModel):
    requisition_id: uuid.UUID
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=40)
    privacy_notice_version_id: uuid.UUID | None = None
    lawful_basis: str = "legitimate_interest"


class ApplicationOut(ORMModel):
    id: uuid.UUID
    requisition_id: uuid.UUID
    candidate_id: uuid.UUID
    stage: str
    status: str
    applied_at: datetime
    version: int


class StageIn(BaseModel):
    stage: str
    reason: str | None = Field(default=None, max_length=1000)


class StageHistoryOut(ORMModel):
    id: uuid.UUID
    application_id: uuid.UUID
    from_stage: str | None
    to_stage: str
    actor_user_id: uuid.UUID
    reason: str | None
    created_at: datetime


class CandidateOut(ORMModel):
    id: uuid.UUID
    full_name: str
    email: str
    phone: str | None
    created_at: datetime


class InterviewIn(BaseModel):
    application_id: uuid.UUID
    scheduled_at: datetime
    duration_minutes: int = Field(default=45, ge=15, le=480)
    timezone: str = "Asia/Kolkata"
    mode: str = "video"
    location: str | None = Field(default=None, max_length=300)
    participant_user_ids: list[uuid.UUID] = Field(default_factory=list)


class InterviewOut(ORMModel):
    id: uuid.UUID
    application_id: uuid.UUID
    scheduled_at: datetime
    duration_minutes: int
    timezone: str
    mode: str
    location: str | None
    status: str
    version: int


class InterviewUpdate(BaseModel):
    scheduled_at: datetime | None = None
    status: str | None = None
    location: str | None = None


class FeedbackIn(BaseModel):
    recommendation: str
    comments: str | None = Field(default=None, max_length=5000)


class FeedbackOut(ORMModel):
    id: uuid.UUID
    interview_id: uuid.UUID
    interviewer_user_id: uuid.UUID
    recommendation: str
    comments: str | None
    submitted_at: datetime


@router.get("/requisitions", response_model=Page[RequisitionOut])
def list_requisitions(
    db: DbSession,
    principal: Principal = Depends(
        require_any_internal_permission(
            "recruitment.requisition.manage", "recruitment.requisition.approve"
        )
    ),
    limit: int = 20,
    offset: int = 0,
) -> Page[RequisitionOut]:
    stmt = select(Requisition).where(Requisition.tenant_id == principal.tenant_id)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(Requisition.created_at.desc()).limit(min(limit, 100)).offset(offset)
        )
    )
    return Page(
        items=[RequisitionOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/requisitions", response_model=RequisitionOut, status_code=status.HTTP_201_CREATED
)
def create_requisition(
    payload: RequisitionIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.requisition.manage")
    ),
) -> RequisitionOut:
    item = Requisition(
        tenant_id=principal.tenant_id,
        title=payload.title,
        department_id=payload.department_id,
        location=payload.location,
        employment_type=payload.employment_type,
        description=payload.description,
        status="draft",
        created_by=principal.user_id,
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        principal,
        "requisition.created",
        target_type="requisition",
        target_id=item.id,
    )
    db.commit()
    return RequisitionOut.model_validate(item)


@router.get("/requisitions/{requisition_id}", response_model=RequisitionOut)
def get_requisition(
    requisition_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(
        require_any_internal_permission(
            "recruitment.requisition.manage", "recruitment.requisition.approve"
        )
    ),
) -> RequisitionOut:
    item = db.scalar(
        select(Requisition).where(
            Requisition.id == requisition_id,
            Requisition.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("requisition")
    return RequisitionOut.model_validate(item)


@router.patch("/requisitions/{requisition_id}", response_model=RequisitionOut)
def update_requisition(
    requisition_id: uuid.UUID,
    payload: RequisitionIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.requisition.manage")
    ),
) -> RequisitionOut:
    item = db.scalar(
        select(Requisition).where(
            Requisition.id == requisition_id,
            Requisition.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("requisition")
    if item.status not in {"draft"}:
        raise invalid_state("Only draft requisitions can be edited.")
    item.title = payload.title
    item.department_id = payload.department_id
    item.location = payload.location
    item.employment_type = payload.employment_type
    item.description = payload.description
    item.version += 1
    db.add(item)
    db.commit()
    return RequisitionOut.model_validate(item)


@router.post(
    "/requisitions/{requisition_id}/submit", response_model=RequisitionOut
)
def submit_requisition(
    requisition_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.requisition.manage")
    ),
) -> RequisitionOut:
    item = db.scalar(
        select(Requisition)
        .where(
            Requisition.id == requisition_id,
            Requisition.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        raise not_found("requisition")
    if item.status != "draft":
        raise invalid_state("Only a draft requisition can be submitted.")
    item.status = "pending_approval"
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "requisition.submitted",
        target_type="requisition",
        target_id=item.id,
    )
    db.commit()
    return RequisitionOut.model_validate(item)


@router.post(
    "/requisitions/{requisition_id}/approval", response_model=ApprovalOut
)
def approve_requisition(
    requisition_id: uuid.UUID,
    payload: ApprovalIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.requisition.approve")
    ),
) -> ApprovalOut:
    if payload.decision not in {"approved", "rejected"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid decision.")
    item = db.scalar(
        select(Requisition)
        .where(
            Requisition.id == requisition_id,
            Requisition.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        raise not_found("requisition")
    if item.status != "pending_approval":
        raise invalid_state("The requisition is not awaiting approval.")
    existing = db.scalar(
        select(RequisitionApproval).where(
            RequisitionApproval.requisition_id == item.id,
            RequisitionApproval.approver_user_id == principal.user_id,
        )
    )
    if existing is not None:
        raise AppError(409, "conflict", "errors.conflict", "You already decided this requisition.")
    now = datetime.now(UTC)
    approval = RequisitionApproval(
        tenant_id=principal.tenant_id,
        requisition_id=item.id,
        approver_user_id=principal.user_id,
        decision=payload.decision,
        comment=payload.comment,
        created_at=now,
    )
    db.add(approval)
    item.status = "approved" if payload.decision == "approved" else "draft"
    if payload.decision == "approved":
        item.approved_at = now
    item.version += 1
    db.add(item)
    write_audit(
        db,
        principal,
        "requisition.approved" if payload.decision == "approved" else "requisition.rejected",
        target_type="requisition",
        target_id=item.id,
    )
    db.commit()
    return ApprovalOut.model_validate(approval)


@router.post("/requisitions/{requisition_id}/open", response_model=RequisitionOut)
def open_requisition(
    requisition_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.requisition.manage")
    ),
) -> RequisitionOut:
    item = db.scalar(
        select(Requisition).where(
            Requisition.id == requisition_id,
            Requisition.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("requisition")
    if item.status != "approved":
        raise invalid_state("Only an approved requisition can be opened.")
    item.status = "open"
    item.version += 1
    db.add(item)
    db.commit()
    return RequisitionOut.model_validate(item)


@router.get("/applications", response_model=Page[ApplicationOut])
def list_applications(
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.application.read_assigned")
    ),
    requisition_id: uuid.UUID | None = None,
    stage: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> Page[ApplicationOut]:
    stmt = select(Application).where(Application.tenant_id == principal.tenant_id)
    if requisition_id:
        stmt = stmt.where(Application.requisition_id == requisition_id)
    if stage:
        stmt = stmt.where(Application.stage == stage)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(Application.applied_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[ApplicationOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/applications", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED
)
def create_application(
    payload: ApplicationIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.application.create")
    ),
) -> ApplicationOut:
    requisition = db.scalar(
        select(Requisition).where(
            Requisition.id == payload.requisition_id,
            Requisition.tenant_id == principal.tenant_id,
        )
    )
    if requisition is None:
        raise not_found("requisition")
    if requisition.status not in {"approved", "open"}:
        raise AppError(
            409,
            "invalid_state_transition",
            "recruitment.errors.requisition_not_open",
            "Applications can only be added to an approved/open requisition.",
        )
    candidate = db.scalar(
        select(Candidate).where(
            Candidate.tenant_id == principal.tenant_id,
            Candidate.email == str(payload.email).lower(),
        )
    )
    if candidate is None:
        candidate = Candidate(
            tenant_id=principal.tenant_id,
            full_name=payload.full_name,
            email=str(payload.email).lower(),
            phone=payload.phone,
            created_by=principal.user_id,
        )
        db.add(candidate)
        db.flush()
    existing = db.scalar(
        select(Application).where(
            Application.tenant_id == principal.tenant_id,
            Application.requisition_id == requisition.id,
            Application.candidate_id == candidate.id,
        )
    )
    if existing is not None:
        raise AppError(409, "conflict", "errors.conflict", "An application already exists.")
    now = datetime.now(UTC)
    if payload.privacy_notice_version_id:
        notice = db.scalar(
            select(PrivacyNoticeVersion).where(
                PrivacyNoticeVersion.id == payload.privacy_notice_version_id,
                PrivacyNoticeVersion.effective_from <= date.today(),
            )
        )
        if notice is None:
            raise not_found("privacy notice")
        db.add(
            CandidateConsent(
                tenant_id=principal.tenant_id,
                candidate_id=candidate.id,
                notice_version_id=notice.id,
                lawful_basis=payload.lawful_basis,
                consented_at=now,
                source="recruiter",
            )
        )
    application = Application(
        tenant_id=principal.tenant_id,
        requisition_id=requisition.id,
        candidate_id=candidate.id,
        stage="received",
        status="active",
        applied_at=now,
    )
    db.add(application)
    db.flush()
    db.add(
        ApplicationStageHistory(
            tenant_id=principal.tenant_id,
            application_id=application.id,
            from_stage=None,
            to_stage="received",
            actor_user_id=principal.user_id,
            reason="Application created",
            created_at=now,
        )
    )
    write_audit(
        db,
        principal,
        "application.created",
        target_type="application",
        target_id=application.id,
    )
    db.commit()
    return ApplicationOut.model_validate(application)


@router.get("/applications/{application_id}", response_model=ApplicationOut)
def get_application(
    application_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.application.read_assigned")
    ),
) -> ApplicationOut:
    item = db.scalar(
        select(Application).where(
            Application.id == application_id,
            Application.tenant_id == principal.tenant_id,
        )
    )
    if item is None:
        raise not_found("application")
    return ApplicationOut.model_validate(item)


@router.patch("/applications/{application_id}", response_model=ApplicationOut)
def update_stage(
    application_id: uuid.UUID,
    payload: StageIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.application.stage.update")
    ),
) -> ApplicationOut:
    if payload.stage not in STAGE_TRANSITIONS:
        raise AppError(422, "validation_error", "errors.validation", "Invalid stage.")
    item = db.scalar(
        select(Application)
        .where(
            Application.id == application_id,
            Application.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if item is None:
        raise not_found("application")
    if payload.stage not in STAGE_TRANSITIONS[item.stage]:
        raise AppError(
            409,
            "invalid_state_transition",
            "recruitment.errors.invalid_stage",
            f"Cannot move an application from {item.stage} to {payload.stage}.",
        )
    requisition = db.get(Requisition, item.requisition_id)
    if requisition and requisition.status in {"closed", "cancelled"} and payload.stage not in {
        "rejected",
        "withdrawn",
    }:
        raise invalid_state("The requisition is closed.")
    old_stage = item.stage
    item.stage = payload.stage
    if payload.stage in {"rejected", "withdrawn", "hired"}:
        item.status = payload.stage if payload.stage != "hired" else "hired"
    item.version += 1
    db.add(item)
    db.add(
        ApplicationStageHistory(
            tenant_id=principal.tenant_id,
            application_id=item.id,
            from_stage=old_stage,
            to_stage=payload.stage,
            actor_user_id=principal.user_id,
            reason=payload.reason,
            created_at=datetime.now(UTC),
        )
    )
    write_audit(
        db,
        principal,
        "application.stage_changed",
        target_type="application",
        target_id=item.id,
        metadata={"from": old_stage, "to": payload.stage},
    )
    write_outbox(
        db,
        principal.tenant_id,
        "application.stage_changed",
        "application",
        item.id,
        {"stage": payload.stage},
    )
    db.commit()
    return ApplicationOut.model_validate(item)


@router.get("/candidates/{candidate_id}", response_model=CandidateOut)
def get_candidate(
    candidate_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.application.read_assigned")
    ),
) -> CandidateOut:
    candidate = db.scalar(
        select(Candidate).where(
            Candidate.id == candidate_id,
            Candidate.tenant_id == principal.tenant_id,
        )
    )
    if candidate is None:
        raise not_found("candidate")
    write_audit(
        db,
        principal,
        "candidate.viewed",
        target_type="candidate",
        target_id=candidate.id,
    )
    db.commit()
    return CandidateOut.model_validate(candidate)


@router.post(
    "/interviews", response_model=InterviewOut, status_code=status.HTTP_201_CREATED
)
def schedule_interview(
    payload: InterviewIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.interview.schedule")
    ),
) -> InterviewOut:
    application = db.scalar(
        select(Application).where(
            Application.id == payload.application_id,
            Application.tenant_id == principal.tenant_id,
        )
    )
    if application is None:
        raise not_found("application")
    if application.status != "active":
        raise invalid_state("Interviews cannot be scheduled for a closed application.")
    interview = Interview(
        tenant_id=principal.tenant_id,
        application_id=application.id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        timezone=payload.timezone,
        mode=payload.mode,
        location=payload.location,
        status="scheduled",
    )
    db.add(interview)
    db.flush()
    for user_id in set(payload.participant_user_ids):
        db.add(
            InterviewParticipant(
                interview_id=interview.id,
                user_id=user_id,
                participant_role="interviewer",
                response_status="pending",
            )
        )
    write_audit(
        db,
        principal,
        "interview.scheduled",
        target_type="interview",
        target_id=interview.id,
    )
    write_outbox(
        db,
        principal.tenant_id,
        "interview.scheduled",
        "interview",
        interview.id,
        {"participant_user_ids": [str(item) for item in payload.participant_user_ids]},
    )
    db.commit()
    return InterviewOut.model_validate(interview)


@router.patch("/interviews/{interview_id}", response_model=InterviewOut)
def update_interview(
    interview_id: uuid.UUID,
    payload: InterviewUpdate,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.interview.schedule")
    ),
) -> InterviewOut:
    interview = db.scalar(
        select(Interview).where(
            Interview.id == interview_id,
            Interview.tenant_id == principal.tenant_id,
        )
    )
    if interview is None:
        raise not_found("interview")
    if payload.status is not None:
        if payload.status not in {"scheduled", "completed", "cancelled"}:
            raise AppError(422, "validation_error", "errors.validation", "Invalid status.")
        interview.status = payload.status
    if payload.scheduled_at is not None:
        interview.scheduled_at = payload.scheduled_at
    if payload.location is not None:
        interview.location = payload.location
    interview.version += 1
    db.add(interview)
    db.commit()
    return InterviewOut.model_validate(interview)


@router.post(
    "/interviews/{interview_id}/feedback",
    response_model=FeedbackOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_feedback(
    interview_id: uuid.UUID,
    payload: FeedbackIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("recruitment.feedback.submit")
    ),
) -> FeedbackOut:
    if payload.recommendation not in {
        "strong_yes",
        "yes",
        "no",
        "strong_no",
        "undecided",
    }:
        raise AppError(422, "validation_error", "errors.validation", "Invalid recommendation.")
    interview = db.scalar(
        select(Interview).where(
            Interview.id == interview_id,
            Interview.tenant_id == principal.tenant_id,
        )
    )
    if interview is None:
        raise not_found("interview")
    participant = db.scalar(
        select(InterviewParticipant).where(
            InterviewParticipant.interview_id == interview.id,
            InterviewParticipant.user_id == principal.user_id,
        )
    )
    if participant is None:
        raise forbidden("Only assigned interviewers can submit feedback.")
    existing = db.scalar(
        select(InterviewFeedback).where(
            InterviewFeedback.interview_id == interview.id,
            InterviewFeedback.interviewer_user_id == principal.user_id,
        )
    )
    if existing is not None:
        raise AppError(409, "conflict", "errors.conflict", "Feedback already submitted.")
    feedback = InterviewFeedback(
        tenant_id=principal.tenant_id,
        interview_id=interview.id,
        interviewer_user_id=principal.user_id,
        recommendation=payload.recommendation,
        comments=payload.comments,
        submitted_at=datetime.now(UTC),
    )
    db.add(feedback)
    write_audit(
        db,
        principal,
        "interview.feedback.submitted",
        target_type="interview",
        target_id=interview.id,
    )
    db.commit()
    return FeedbackOut.model_validate(feedback)
