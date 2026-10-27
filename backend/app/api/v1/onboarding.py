from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.api.deps import DbSession, get_principal, require_internal_permission
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, conflict, forbidden, invalid_state, not_found
from app.db.models import (
    Document,
    EmployeeProfile,
    OnboardingCase,
    OnboardingTask,
    OnboardingTemplate,
    OnboardingTemplateTask,
)
from app.domains.audit import write_audit, write_outbox
from app.domains.idempotency import begin, complete
from app.domains.identity import Principal

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])
IdempotencyHeader = Annotated[str, Header(alias="Idempotency-Key")]

TASK_TRANSITIONS = {
    "not_started": {"in_progress", "blocked", "waived"},
    "in_progress": {"completed", "blocked", "waived"},
    "blocked": {"in_progress", "waived"},
    "completed": set(),
    "waived": set(),
}


class TemplateTaskIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    owner_rule: str = "employee"
    due_offset_days: int = Field(default=0, ge=0, le=365)
    required_evidence: bool = False
    position: int = Field(ge=1)


class TemplateIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    tasks: list[TemplateTaskIn] = Field(default_factory=list)


class TemplatePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    status: str | None = None
    tasks: list[TemplateTaskIn] | None = None


class TemplateTaskOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    owner_rule: str
    due_offset_days: int
    required_evidence: bool
    position: int


class TemplateOut(ORMModel):
    id: uuid.UUID
    name: str
    status: str
    version: int
    created_at: datetime
    tasks: list[TemplateTaskOut] = Field(default_factory=list)


class CaseIn(BaseModel):
    employee_id: uuid.UUID
    template_id: uuid.UUID
    start_date: date


class CasePatch(BaseModel):
    status: str


class TaskOut(ORMModel):
    id: uuid.UUID
    case_id: uuid.UUID
    title: str
    owner_user_id: uuid.UUID
    status: str
    due_at: datetime | None
    completed_at: datetime | None
    evidence_document_id: uuid.UUID | None
    version: int


class CaseOut(ORMModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    template_id: uuid.UUID
    start_date: date
    status: str
    created_at: datetime
    progress: dict | None = None
    tasks: list[TaskOut] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    status: str | None = None
    evidence_document_id: uuid.UUID | None = None


class EvidenceIn(BaseModel):
    document_id: uuid.UUID


@router.get("/templates", response_model=list[TemplateOut])
def list_templates(
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("onboarding.template.manage")),
) -> list[TemplateOut]:
    templates = list(
        db.scalars(
            select(OnboardingTemplate).where(
                OnboardingTemplate.tenant_id == principal.tenant_id
            )
        )
    )
    result = []
    for template in templates:
        tasks = list(
            db.scalars(
                select(OnboardingTemplateTask)
                .where(OnboardingTemplateTask.template_id == template.id)
                .order_by(OnboardingTemplateTask.position)
            )
        )
        result.append(
            TemplateOut(
                **TemplateOut.model_validate(template).model_dump(exclude={"tasks"}),
                tasks=[TemplateTaskOut.model_validate(task) for task in tasks],
            )
        )
    return result


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateIn,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("onboarding.template.manage")),
) -> TemplateOut:
    template = OnboardingTemplate(
        tenant_id=principal.tenant_id,
        name=payload.name,
        status="active",
        created_by=principal.user_id,
    )
    db.add(template)
    db.flush()
    tasks = []
    for task_payload in payload.tasks:
        if task_payload.owner_rule not in {"employee", "manager", "hr"}:
            raise AppError(422, "validation_error", "errors.validation", "Invalid owner rule.")
        task = OnboardingTemplateTask(
            template_id=template.id,
            title=task_payload.title,
            description=task_payload.description,
            owner_rule=task_payload.owner_rule,
            due_offset_days=task_payload.due_offset_days,
            required_evidence=task_payload.required_evidence,
            position=task_payload.position,
        )
        db.add(task)
        tasks.append(task)
    write_audit(
        db,
        principal,
        "onboarding.template.changed",
        target_type="onboarding_template",
        target_id=template.id,
    )
    db.commit()
    return TemplateOut(
        **TemplateOut.model_validate(template).model_dump(exclude={"tasks"}),
        tasks=[TemplateTaskOut.model_validate(task) for task in tasks],
    )


@router.get("/templates/{template_id}", response_model=TemplateOut)
def get_template(
    template_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("onboarding.template.manage")),
) -> TemplateOut:
    template = db.scalar(
        select(OnboardingTemplate).where(
            OnboardingTemplate.id == template_id,
            OnboardingTemplate.tenant_id == principal.tenant_id,
        )
    )
    if template is None:
        raise not_found("onboarding template")
    tasks = list(
        db.scalars(
            select(OnboardingTemplateTask)
            .where(OnboardingTemplateTask.template_id == template.id)
            .order_by(OnboardingTemplateTask.position)
        )
    )
    return TemplateOut(
        **TemplateOut.model_validate(template).model_dump(exclude={"tasks"}),
        tasks=[TemplateTaskOut.model_validate(task) for task in tasks],
    )


@router.patch("/templates/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: uuid.UUID,
    payload: TemplatePatch,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("onboarding.template.manage")),
) -> TemplateOut:
    template = db.scalar(
        select(OnboardingTemplate)
        .where(
            OnboardingTemplate.id == template_id,
            OnboardingTemplate.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if template is None:
        raise not_found("onboarding template")
    if payload.status is not None and payload.status not in {"active", "inactive"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid template status.")
    if payload.tasks is not None:
        in_use = db.scalar(
            select(OnboardingCase.id)
            .where(OnboardingCase.template_id == template.id)
            .limit(1)
        )
        if in_use is not None:
            raise conflict(
                "template_in_use",
                "A template used by an onboarding case cannot have its tasks rewritten.",
            )
        positions = [task.position for task in payload.tasks]
        if len(positions) != len(set(positions)):
            raise AppError(
                422,
                "validation_error",
                "errors.validation",
                "Template task positions must be unique.",
            )
        db.execute(
            delete(OnboardingTemplateTask).where(
                OnboardingTemplateTask.template_id == template.id
            )
        )
        for task_payload in payload.tasks:
            if task_payload.owner_rule not in {"employee", "manager", "hr"}:
                raise AppError(
                    422, "validation_error", "errors.validation", "Invalid owner rule."
                )
            db.add(
                OnboardingTemplateTask(
                    template_id=template.id,
                    title=task_payload.title,
                    description=task_payload.description,
                    owner_rule=task_payload.owner_rule,
                    due_offset_days=task_payload.due_offset_days,
                    required_evidence=task_payload.required_evidence,
                    position=task_payload.position,
                )
            )
    if payload.name is not None:
        template.name = payload.name
    if payload.status is not None:
        template.status = payload.status
    template.version += 1
    db.add(template)
    write_audit(
        db,
        principal,
        "onboarding.template.changed",
        target_type="onboarding_template",
        target_id=template.id,
        metadata={"tasks_replaced": payload.tasks is not None},
    )
    db.flush()
    tasks = list(
        db.scalars(
            select(OnboardingTemplateTask)
            .where(OnboardingTemplateTask.template_id == template.id)
            .order_by(OnboardingTemplateTask.position)
        )
    )
    db.commit()
    return TemplateOut(
        **TemplateOut.model_validate(template).model_dump(exclude={"tasks"}),
        tasks=[TemplateTaskOut.model_validate(task) for task in tasks],
    )


@router.get("/cases", response_model=Page[CaseOut])
def list_cases(
    db: DbSession,
    principal: Principal = Depends(get_principal),
    limit: int = 20,
    offset: int = 0,
) -> Page[CaseOut]:
    if principal.membership is None:
        raise forbidden("Organization member access is required.")
    if "onboarding.case.read" not in principal.permissions:
        raise forbidden("Missing permission: onboarding.case.read.")
    stmt = select(OnboardingCase).where(
        OnboardingCase.tenant_id == principal.tenant_id
    )
    if "onboarding.case.create" not in principal.permissions:
        employee = db.scalar(
            select(EmployeeProfile).where(
                EmployeeProfile.tenant_id == principal.tenant_id,
                EmployeeProfile.user_id == principal.user_id,
            )
        )
        if employee is None:
            raise forbidden("You do not have access to onboarding cases.")
        stmt = stmt.where(OnboardingCase.employee_id == employee.id)
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(OnboardingCase.created_at.desc()).limit(limit).offset(offset)
        )
    )
    items: list[CaseOut] = []
    for row in rows:
        tasks = list(
            db.scalars(
                select(OnboardingTask)
                .where(OnboardingTask.case_id == row.id)
                .order_by(OnboardingTask.created_at)
            )
        )
        completed = sum(1 for task in tasks if task.status in {"completed", "waived"})
        items.append(
            CaseOut(
                **CaseOut.model_validate(row).model_dump(
                    exclude={"progress", "tasks"}
                ),
                progress={
                    "total": len(tasks),
                    "completed": completed,
                    "percent": round(completed / len(tasks) * 100) if tasks else 0,
                },
                tasks=[TaskOut.model_validate(task) for task in tasks],
            )
        )
    return Page(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/cases", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseIn,
    response: Response,
    idempotency_key: IdempotencyHeader,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("onboarding.case.create")),
) -> CaseOut:
    state = begin(
        db,
        principal,
        "POST /api/v1/onboarding/cases",
        idempotency_key,
        payload.model_dump(mode="json"),
    )
    if state.replay:
        response.status_code = state.record.response_status or status.HTTP_200_OK
        return CaseOut.model_validate(state.record.response_body)

    employee = db.scalar(
        select(EmployeeProfile).where(
            EmployeeProfile.id == payload.employee_id,
            EmployeeProfile.tenant_id == principal.tenant_id,
        )
    )
    if employee is None:
        raise not_found("employee")
    template = db.scalar(
        select(OnboardingTemplate).where(
            OnboardingTemplate.id == payload.template_id,
            OnboardingTemplate.tenant_id == principal.tenant_id,
            OnboardingTemplate.status == "active",
        )
    )
    if template is None:
        raise not_found("onboarding template")
    existing = db.scalar(
        select(OnboardingCase).where(
            OnboardingCase.tenant_id == principal.tenant_id,
            OnboardingCase.employee_id == employee.id,
        )
    )
    if existing is not None:
        raise AppError(409, "conflict", "errors.conflict", "An onboarding case already exists.")
    case = OnboardingCase(
        tenant_id=principal.tenant_id,
        employee_id=employee.id,
        template_id=template.id,
        start_date=payload.start_date,
        status="active",
        created_by=principal.user_id,
    )
    db.add(case)
    db.flush()
    template_tasks = list(
        db.scalars(
            select(OnboardingTemplateTask)
            .where(OnboardingTemplateTask.template_id == template.id)
            .order_by(OnboardingTemplateTask.position)
        )
    )
    manager_user_id = None
    if employee.manager_employee_id:
        manager = db.get(EmployeeProfile, employee.manager_employee_id)
        manager_user_id = manager.user_id if manager else None
    for template_task in template_tasks:
        owner_user_id = {
            "employee": employee.user_id,
            "manager": manager_user_id or principal.user_id,
            "hr": principal.user_id,
        }[template_task.owner_rule]
        db.add(
            OnboardingTask(
                tenant_id=principal.tenant_id,
                case_id=case.id,
                template_task_id=template_task.id,
                title=template_task.title,
                owner_user_id=owner_user_id,
                status="not_started",
                due_at=datetime.combine(
                    payload.start_date + timedelta(days=template_task.due_offset_days),
                    datetime.min.time(),
                    tzinfo=UTC,
                ),
                position=template_task.position,
            )
        )
    write_audit(
        db,
        principal,
        "onboarding.case.created",
        target_type="onboarding_case",
        target_id=case.id,
    )
    write_outbox(
        db,
        principal.tenant_id,
        "onboarding.case.created",
        "onboarding_case",
        case.id,
        {"employee_user_id": str(employee.user_id)},
    )
    body = CaseOut.model_validate(case).model_dump(mode="json")
    complete(
        db,
        state,
        status_code=status.HTTP_201_CREATED,
        body=body,
        resource_type="onboarding_case",
        resource_id=case.id,
    )
    db.commit()
    return CaseOut.model_validate(body)


@router.patch("/cases/{case_id}", response_model=CaseOut)
def update_case(
    case_id: uuid.UUID,
    payload: CasePatch,
    db: DbSession,
    principal: Principal = Depends(require_internal_permission("onboarding.case.create")),
) -> CaseOut:
    case = db.scalar(
        select(OnboardingCase)
        .where(
            OnboardingCase.id == case_id,
            OnboardingCase.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if case is None:
        raise not_found("onboarding case")
    if payload.status not in {"completed", "cancelled"}:
        raise AppError(422, "validation_error", "errors.validation", "Invalid case status.")
    if case.status in {"completed", "cancelled"}:
        raise invalid_state("This onboarding case is already closed.")
    if payload.status == "completed":
        unfinished = db.scalar(
            select(OnboardingTask.id)
            .where(
                OnboardingTask.case_id == case.id,
                OnboardingTask.status.notin_(["completed", "waived"]),
            )
            .limit(1)
        )
        if unfinished is not None:
            raise conflict(
                "onboarding_tasks_incomplete",
                "All onboarding tasks must be completed or waived before closing the case.",
            )
    case.status = payload.status
    case.version += 1
    db.add(case)
    write_audit(
        db,
        principal,
        "onboarding.case.status_changed",
        target_type="onboarding_case",
        target_id=case.id,
        metadata={"status": case.status},
    )
    db.commit()
    return CaseOut.model_validate(case)


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(
    case_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> CaseOut:
    case = db.scalar(
        select(OnboardingCase).where(
            OnboardingCase.id == case_id,
            OnboardingCase.tenant_id == principal.tenant_id,
        )
    )
    if case is None:
        raise not_found("onboarding case")
    if "onboarding.case.create" not in principal.permissions:
        employee = db.scalar(
            select(EmployeeProfile).where(
                EmployeeProfile.tenant_id == principal.tenant_id,
                EmployeeProfile.user_id == principal.user_id,
            )
        )
        if employee is None or employee.id != case.employee_id:
            raise not_found("onboarding case")
    tasks = list(
        db.scalars(
            select(OnboardingTask).where(OnboardingTask.case_id == case.id)
        )
    )
    completed = sum(1 for task in tasks if task.status in {"completed", "waived"})
    return CaseOut(
        **CaseOut.model_validate(case).model_dump(exclude={"progress", "tasks"}),
        progress={
            "total": len(tasks),
            "completed": completed,
            "percent": round(completed / len(tasks) * 100) if tasks else 0,
        },
        tasks=[TaskOut.model_validate(task) for task in tasks],
    )


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(
    task_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(get_principal),
) -> TaskOut:
    task = db.scalar(
        select(OnboardingTask).where(
            OnboardingTask.id == task_id,
            OnboardingTask.tenant_id == principal.tenant_id,
        )
    )
    if task is None:
        raise not_found("onboarding task")
    if (
        task.owner_user_id != principal.user_id
        and "onboarding.case.create" not in principal.permissions
    ):
        raise not_found("onboarding task")
    return TaskOut.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("onboarding.task.update_assigned")
    ),
) -> TaskOut:
    task = db.scalar(
        select(OnboardingTask)
        .where(
            OnboardingTask.id == task_id,
            OnboardingTask.tenant_id == principal.tenant_id,
        )
        .with_for_update()
    )
    if task is None:
        raise not_found("onboarding task")
    if (
        task.owner_user_id != principal.user_id
        and "onboarding.case.create" not in principal.permissions
    ):
        raise forbidden("Only the assigned owner can update this task.")
    if payload.status is not None:
        if payload.status not in TASK_TRANSITIONS:
            raise AppError(422, "validation_error", "errors.validation", "Invalid status.")
        if payload.status not in TASK_TRANSITIONS[task.status]:
            raise invalid_state()
        required_evidence = True
        if task.template_task_id is not None:
            template_task = db.get(OnboardingTemplateTask, task.template_task_id)
            if template_task is not None:
                required_evidence = template_task.required_evidence
        effective_evidence = payload.evidence_document_id or task.evidence_document_id
        if payload.status == "completed" and required_evidence and effective_evidence is None:
            raise AppError(
                422,
                "business_rule_violation",
                "onboarding.errors.evidence_required",
                "Evidence is required before completing this task.",
            )
        task.status = payload.status
        if payload.status == "completed":
            task.completed_at = datetime.now(UTC)
    if payload.evidence_document_id is not None:
        document = db.scalar(
            select(Document).where(
                Document.id == payload.evidence_document_id,
                Document.tenant_id == principal.tenant_id,
            )
        )
        if document is None:
            raise not_found("document")
        if document.scan_status in {"infected", "failed"}:
            raise AppError(
                422,
                "business_rule_violation",
                "documents.errors.scan_failed",
                "This document failed the security scan and cannot be used as evidence.",
            )
        if (
            document.uploaded_by != principal.user_id
            and "onboarding.case.create" not in principal.permissions
        ):
            raise forbidden("You cannot attach another user's document.")
        task.evidence_document_id = document.id
    task.version += 1
    db.add(task)
    write_audit(
        db,
        principal,
        "onboarding.task.updated",
        target_type="onboarding_task",
        target_id=task.id,
        metadata={"status": task.status},
    )
    db.commit()
    return TaskOut.model_validate(task)


@router.post("/tasks/{task_id}/evidence", response_model=TaskOut)
def attach_evidence(
    task_id: uuid.UUID,
    payload: EvidenceIn,
    db: DbSession,
    principal: Principal = Depends(
        require_internal_permission("onboarding.task.update_assigned")
    ),
) -> TaskOut:
    return update_task(
        task_id,
        TaskUpdate(evidence_document_id=payload.document_id),
        db,
        principal,
    )
