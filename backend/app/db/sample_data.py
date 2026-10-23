"""Optional demo records covering the MVP modules.

The base seed creates the configuration needed to sign in and exercise the
product (tenants, roles, users, leave types, policies and catalogue entries).
This module adds realistic, cross-linked sample records so every module has
something to show in local development.

All rows use deterministic UUIDs derived from ``SAMPLE_NAMESPACE``. Re-running
the seed is therefore idempotent and never duplicates demo records.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Application,
    ApplicationStageHistory,
    AssessmentAttemptEvent,
    AttemptAnswer,
    AuditEvent,
    Candidate,
    CandidateConsent,
    CareerContent,
    ContentReport,
    ContentReview,
    ContentVersion,
    DeletionRequest,
    Department,
    Document,
    EmployeeProfile,
    HRQueryCitation,
    HRQueryFeedback,
    HRQueryLog,
    HRServiceRequest,
    HRServiceRequestAttachment,
    HRServiceRequestComment,
    Interview,
    InterviewFeedback,
    InterviewParticipant,
    LeaveBalance,
    LeaveDecision,
    LeaveLedger,
    LeaveRequest,
    LeaveType,
    LegalHold,
    MembershipRole,
    MockTest,
    Notification,
    NotificationPreference,
    NotificationTemplate,
    OnboardingCase,
    OnboardingTask,
    OnboardingTemplate,
    OnboardingTemplateTask,
    Organization,
    OrganizationSetting,
    PolicyDocument,
    PrivacyNoticeVersion,
    Question,
    ReminderInstance,
    ReminderRule,
    ReportExport,
    Requisition,
    RequisitionApproval,
    ResumeProfile,
    RetentionPolicy,
    Role,
    ServiceCatalogItem,
    TenantMembership,
    TestAttempt,
    User,
)

SAMPLE_NAMESPACE = uuid.UUID("62f1f5de-7d7a-4b31-9f6b-4d4f2f4b8c11")


def _sample_id(key: str) -> uuid.UUID:
    return uuid.uuid5(SAMPLE_NAMESPACE, key)


def _ensure(db: Session, model, sample_key: str, **values):
    """Return ``(row, created)`` for a deterministic sample record."""

    row_id = _sample_id(sample_key)
    row = db.get(model, row_id)
    if row is not None:
        return row, False
    row = model(id=row_id, **values)
    db.add(row)
    db.flush()
    return row, True


def _ensure_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    password_hash: str,
    locale: str = "en",
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user
    user = User(
        id=_sample_id(f"user:{email}"),
        email=email,
        full_name=full_name,
        password_hash=password_hash,
        user_type="internal",
        status="active",
        locale=locale,
        timezone="Asia/Kolkata",
    )
    db.add(user)
    db.flush()
    return user


def _ensure_membership(
    db: Session,
    org: Organization,
    user: User,
    employee_role: Role,
) -> TenantMembership:
    membership = db.scalar(
        select(TenantMembership).where(
            TenantMembership.tenant_id == org.id,
            TenantMembership.user_id == user.id,
        )
    )
    if membership is None:
        membership = TenantMembership(
            id=_sample_id(f"membership:{user.email}"),
            tenant_id=org.id,
            user_id=user.id,
            status="active",
        )
        db.add(membership)
        db.flush()
    existing_role = db.scalar(
        select(MembershipRole.role_id).where(
            MembershipRole.membership_id == membership.id,
            MembershipRole.role_id == employee_role.id,
        )
    )
    if existing_role is None:
        db.add(
            MembershipRole(
                membership_id=membership.id,
                role_id=employee_role.id,
                scope={},
            )
        )
        db.flush()
    return membership


def _ensure_employee(
    db: Session,
    org: Organization,
    user: User,
    *,
    employee_number: str,
    department: Department,
    manager: EmployeeProfile,
    job_title: str,
    join_date: date,
) -> EmployeeProfile:
    employee = db.scalar(
        select(EmployeeProfile).where(
            EmployeeProfile.tenant_id == org.id,
            EmployeeProfile.user_id == user.id,
        )
    )
    if employee is not None:
        return employee
    employee = EmployeeProfile(
        id=_sample_id(f"employee:{user.email}"),
        tenant_id=org.id,
        user_id=user.id,
        employee_number=employee_number,
        department_id=department.id,
        manager_employee_id=manager.id,
        job_title=job_title,
        join_date=join_date,
        status="active",
    )
    db.add(employee)
    db.flush()
    return employee


def _ensure_document(
    db: Session,
    key: str,
    *,
    tenant_id: uuid.UUID,
    owner_type: str,
    owner_id: uuid.UUID,
    filename: str,
    content: str,
    mime_type: str,
    uploaded_by: uuid.UUID,
) -> Document:
    encoded = content.encode()
    checksum = hashlib.sha256(encoded).hexdigest()
    document, _ = _ensure(
        db,
        Document,
        key,
        tenant_id=tenant_id,
        owner_type=owner_type,
        owner_id=owner_id,
        filename=filename,
        storage_key=f"local_metadata://sample/{checksum}",
        mime_type=mime_type,
        size_bytes=len(encoded),
        checksum=checksum,
        scan_status="clean",
        classification="confidential",
        uploaded_by=uploaded_by,
    )
    return document


def populate_sample_data(
    db: Session,
    *,
    org: Organization,
    users: dict[str, User],
    employees: dict[str, EmployeeProfile],
    departments: dict[str, Department],
    leave_types: dict[str, LeaveType],
    roles: dict[str, Role],
    password_hash: str,
) -> None:
    """Populate the demo tenant with cross-linked records for every module."""

    now = datetime.now(UTC)
    today = date.today()
    admin = users["admin"]
    hr = users["hr"]
    approver = users["approver"]
    recruiter = users["recruiter"]
    employee_user = users["employee"]
    employee_two_user = users["employee2"]
    reviewer = users["reviewer"]
    compliance = users["compliance"]

    # ---------------------------------------------------------------- people
    new_hire = _ensure_user(
        db,
        email="newhire@example.com",
        full_name="Aarav Sharma",
        password_hash=password_hash,
    )
    _ensure_membership(db, org, new_hire, roles["employee"])
    new_hire_employee = _ensure_employee(
        db,
        org,
        new_hire,
        employee_number="EMP-0005",
        department=departments["ENG"],
        manager=employees["approver"],
        job_title="Associate Software Engineer",
        join_date=today - timedelta(days=12),
    )

    _ensure(
        db,
        OrganizationSetting,
        "org-setting:sample-leave",
        tenant_id=org.id,
        key="leave",
        value={"approval_required": True, "half_day_enabled": True},
        effective_from=date(today.year, 1, 1),
        created_by=admin.id,
    )

    # -------------------------------------------------------------- documents
    signed_contract = _ensure_document(
        db,
        "document:new-hire-contract",
        tenant_id=org.id,
        owner_type="employee",
        owner_id=new_hire_employee.id,
        filename="aarav-signed-contract.pdf",
        mime_type="application/pdf",
        content="Sample signed employment contract for onboarding evidence.",
        uploaded_by=hr.id,
    )
    service_request_doc = _ensure_document(
        db,
        "document:service-request-address-proof",
        tenant_id=org.id,
        owner_type="employee",
        owner_id=employees["employee"].id,
        filename="address-proof.pdf",
        mime_type="application/pdf",
        content="Sample address proof attached to an employment letter request.",
        uploaded_by=employee_user.id,
    )

    # ------------------------------------------------------------------ leave
    pending_leave, pending_created = _ensure(
        db,
        LeaveRequest,
        "leave:employee-casual-pending",
        tenant_id=org.id,
        employee_id=employees["employee"].id,
        leave_type_id=leave_types["CL"].id,
        start_at=now + timedelta(days=7),
        end_at=now + timedelta(days=9),
        partial_day=False,
        reason="Family function",
        status="pending",
        submitted_at=now - timedelta(days=1),
        current_approver_user_id=approver.id,
        created_by=employee_user.id,
    )
    approved_leave, approved_created = _ensure(
        db,
        LeaveRequest,
        "leave:employee-two-earned-approved",
        tenant_id=org.id,
        employee_id=employees["employee2"].id,
        leave_type_id=leave_types["EL"].id,
        start_at=now - timedelta(days=20),
        end_at=now - timedelta(days=19),
        partial_day=False,
        reason="Annual family visit",
        status="approved",
        submitted_at=now - timedelta(days=26),
        decided_at=now - timedelta(days=24),
        current_approver_user_id=None,
        created_by=employee_two_user.id,
    )
    _ensure(
        db,
        LeaveDecision,
        "leave:employee-two-earned-approved-decision",
        tenant_id=org.id,
        request_id=approved_leave.id,
        actor_user_id=approver.id,
        decision="approved",
        comment="Approved. Enjoy the break.",
        created_at=now - timedelta(days=24),
    )

    if pending_created:
        balance = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.tenant_id == org.id,
                LeaveBalance.employee_id == employees["employee"].id,
                LeaveBalance.leave_type_id == leave_types["CL"].id,
            )
        )
        if balance is not None:
            balance.pending += Decimal("2.00")
            db.add(balance)
        _ensure(
            db,
            LeaveLedger,
            "leave:employee-casual-pending-reserve",
            tenant_id=org.id,
            request_id=pending_leave.id,
            employee_id=employees["employee"].id,
            leave_type_id=leave_types["CL"].id,
            entry_type="reserve",
            days=Decimal("2.00"),
            created_at=now - timedelta(days=1),
        )
    if approved_created:
        balance = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.tenant_id == org.id,
                LeaveBalance.employee_id == employees["employee2"].id,
                LeaveBalance.leave_type_id == leave_types["EL"].id,
            )
        )
        if balance is not None:
            balance.consumed += Decimal("1.00")
            db.add(balance)
        _ensure(
            db,
            LeaveLedger,
            "leave:employee-two-earned-approved-consume",
            tenant_id=org.id,
            request_id=approved_leave.id,
            employee_id=employees["employee2"].id,
            leave_type_id=leave_types["EL"].id,
            entry_type="consume",
            days=Decimal("1.00"),
            created_at=now - timedelta(days=24),
        )

    # ------------------------------------------------------------- onboarding
    template = db.scalar(
        select(OnboardingTemplate).where(
            OnboardingTemplate.tenant_id == org.id,
            OnboardingTemplate.name == "Standard onboarding",
        )
    )
    if template is not None:
        case, _ = _ensure(
            db,
            OnboardingCase,
            "onboarding:new-hire-case",
            tenant_id=org.id,
            employee_id=new_hire_employee.id,
            template_id=template.id,
            start_date=today - timedelta(days=5),
            status="active",
            created_by=hr.id,
        )
        template_tasks = list(
            db.scalars(
                select(OnboardingTemplateTask).where(
                    OnboardingTemplateTask.template_id == template.id
                )
            )
        )
        for template_task in sorted(template_tasks, key=lambda item: item.position):
            owner_user_id = {
                "employee": new_hire.id,
                "manager": approver.id,
                "hr": hr.id,
            }[template_task.owner_rule]
            completed = template_task.position == 1
            in_progress = template_task.position == 2
            _ensure(
                db,
                OnboardingTask,
                f"onboarding:new-hire-task:{template_task.position}",
                tenant_id=org.id,
                case_id=case.id,
                template_task_id=template_task.id,
                title=template_task.title,
                owner_user_id=owner_user_id,
                status=(
                    "completed"
                    if completed
                    else "in_progress"
                    if in_progress
                    else "not_started"
                ),
                due_at=datetime.combine(
                    case.start_date + timedelta(days=template_task.due_offset_days),
                    time.min,
                    tzinfo=UTC,
                ),
                completed_at=now - timedelta(days=4) if completed else None,
                evidence_document_id=signed_contract.id if completed else None,
                position=template_task.position,
            )

    # -------------------------------------------------------- service requests
    catalog = {
        item.code: item
        for item in db.scalars(
            select(ServiceCatalogItem).where(ServiceCatalogItem.tenant_id == org.id)
        )
    }
    employment_letter, _ = _ensure(
        db,
        HRServiceRequest,
        "service-request:employment-letter",
        tenant_id=org.id,
        catalog_item_id=catalog["DOCUMENT_LETTER"].id,
        requester_user_id=employee_user.id,
        assignee_user_id=hr.id,
        subject="Employment verification letter",
        description="Please issue an employment verification letter for a bank application.",
        form_data={"letter_type": "employment_verification"},
        priority="normal",
        status="in_progress",
        sla_due_at=now + timedelta(hours=20),
        created_at=now - timedelta(days=2),
    )
    _ensure(
        db,
        HRServiceRequestComment,
        "service-request:employment-letter-comment-requester",
        tenant_id=org.id,
        request_id=employment_letter.id,
        author_user_id=employee_user.id,
        body="I have attached my address proof in case it is needed.",
        visibility="requester",
        created_at=now - timedelta(days=2) + timedelta(minutes=8),
    )
    _ensure(
        db,
        HRServiceRequestComment,
        "service-request:employment-letter-comment-hr",
        tenant_id=org.id,
        request_id=employment_letter.id,
        author_user_id=hr.id,
        body="Thanks. The letter is being prepared and should be ready within one working day.",
        visibility="requester",
        created_at=now - timedelta(days=1),
    )
    _ensure(
        db,
        HRServiceRequestAttachment,
        "service-request:employment-letter-attachment",
        tenant_id=org.id,
        request_id=employment_letter.id,
        document_id=service_request_doc.id,
        created_at=now - timedelta(days=2) + timedelta(minutes=8),
    )
    resolved_request, _ = _ensure(
        db,
        HRServiceRequest,
        "service-request:hr-system-access",
        tenant_id=org.id,
        catalog_item_id=catalog["IT_ACCESS"].id,
        requester_user_id=employee_two_user.id,
        assignee_user_id=hr.id,
        subject="HR portal access for leave reports",
        description="Please grant read-only access to the leave report for my team.",
        form_data={"system": "HR portal"},
        priority="high",
        status="resolved",
        sla_due_at=now - timedelta(hours=12),
        resolved_at=now - timedelta(days=1),
        created_at=now - timedelta(days=4),
    )
    _ensure(
        db,
        HRServiceRequestComment,
        "service-request:hr-system-access-resolution",
        tenant_id=org.id,
        request_id=resolved_request.id,
        author_user_id=hr.id,
        body="Access has been granted. Please confirm you can view the report.",
        visibility="requester",
        created_at=now - timedelta(days=1),
    )
    _ensure(
        db,
        HRServiceRequest,
        "service-request:new-hire-general",
        tenant_id=org.id,
        catalog_item_id=catalog["GENERAL_HR"].id,
        requester_user_id=new_hire.id,
        assignee_user_id=None,
        subject="Question about probation objectives",
        description="When should I complete the probation objectives discussion with my manager?",
        form_data={"topic": "probation"},
        priority="normal",
        status="open",
        sla_due_at=now + timedelta(hours=24),
        created_at=now - timedelta(hours=6),
    )

    # ----------------------------------------------------------- HR assistant
    policy = db.scalar(
        select(PolicyDocument).where(
            PolicyDocument.tenant_id == org.id,
            PolicyDocument.title == "Leave Policy",
            PolicyDocument.locale == "en",
        )
    )
    if policy is not None:
        query_log, _ = _ensure(
            db,
            HRQueryLog,
            "hr-query:casual-leave-notice",
            tenant_id=org.id,
            user_id=employee_user.id,
            request_id="sample-request-assistant-1",
            question_redacted="How much notice should I give before taking casual leave?",
            answer_status="grounded",
            model_name=settings.ai_model_name,
            model_version="1",
            latency_ms=38,
            created_at=now - timedelta(days=3),
        )
        _ensure(
            db,
            HRQueryCitation,
            "hr-query:casual-leave-notice-citation",
            query_log_id=query_log.id,
            document_id=policy.id,
            section="Eligibility and notice",
            title_snapshot=policy.title,
        )
        _ensure(
            db,
            HRQueryFeedback,
            "hr-query:casual-leave-notice-feedback",
            tenant_id=org.id,
            query_log_id=query_log.id,
            user_id=employee_user.id,
            rating=5,
            flag_reason=None,
            comment="Clear answer with the right policy reference.",
            created_at=now - timedelta(days=2, hours=23),
        )

    # ------------------------------------------------------------ recruitment
    open_requisition, _ = _ensure(
        db,
        Requisition,
        "requisition:senior-backend-engineer",
        tenant_id=org.id,
        title="Senior Backend Engineer",
        department_id=departments["ENG"].id,
        location="Bengaluru (hybrid)",
        employment_type="full_time",
        description=(
            "Design and maintain secure HR APIs, PostgreSQL schemas and the "
            "event-driven notification pipeline."
        ),
        status="open",
        created_by=recruiter.id,
        approved_at=now - timedelta(days=10),
    )
    _ensure(
        db,
        RequisitionApproval,
        "requisition:senior-backend-engineer-approval",
        tenant_id=org.id,
        requisition_id=open_requisition.id,
        approver_user_id=approver.id,
        decision="approved",
        comment="Approved for the current hiring plan.",
        created_at=now - timedelta(days=10),
    )
    _ensure(
        db,
        Requisition,
        "requisition:people-operations-associate",
        tenant_id=org.id,
        title="People Operations Associate",
        department_id=departments["PEO"].id,
        location="Remote (India)",
        employment_type="full_time",
        description="Support onboarding coordination, HR service requests and policy upkeep.",
        status="pending_approval",
        created_by=recruiter.id,
        approved_at=None,
    )

    asha, _ = _ensure(
        db,
        Candidate,
        "candidate:asha-rao",
        tenant_id=org.id,
        full_name="Asha Rao",
        email="asha.rao@example.com",
        phone="+919876543210",
        created_by=recruiter.id,
    )
    rohan, _ = _ensure(
        db,
        Candidate,
        "candidate:rohan-mehta",
        tenant_id=org.id,
        full_name="Rohan Mehta",
        email="rohan.mehta@example.com",
        phone="+919812345678",
        created_by=recruiter.id,
    )
    resume_document = _ensure_document(
        db,
        "document:asha-rao-resume",
        tenant_id=org.id,
        owner_type="candidate",
        owner_id=asha.id,
        filename="asha-rao-resume.pdf",
        mime_type="application/pdf",
        content="Sample candidate resume metadata for Asha Rao.",
        uploaded_by=recruiter.id,
    )
    if asha.resume_document_id != resume_document.id:
        asha.resume_document_id = resume_document.id
        db.add(asha)

    notice = db.scalar(
        select(PrivacyNoticeVersion).where(
            PrivacyNoticeVersion.tenant_id == org.id,
            PrivacyNoticeVersion.code == "candidate_privacy",
            PrivacyNoticeVersion.locale == "en",
        )
    )
    if notice is not None:
        _ensure(
            db,
            CandidateConsent,
            "candidate:asha-rao-consent",
            tenant_id=org.id,
            candidate_id=asha.id,
            notice_version_id=notice.id,
            lawful_basis="legitimate_interest",
            consented_at=now - timedelta(days=12),
            source="careers_page",
        )

    asha_application, _ = _ensure(
        db,
        Application,
        "application:asha-rao-senior-backend",
        tenant_id=org.id,
        requisition_id=open_requisition.id,
        candidate_id=asha.id,
        stage="interview",
        status="active",
        applied_at=now - timedelta(days=12),
    )
    rohan_application, _ = _ensure(
        db,
        Application,
        "application:rohan-mehta-senior-backend",
        tenant_id=org.id,
        requisition_id=open_requisition.id,
        candidate_id=rohan.id,
        stage="screening",
        status="active",
        applied_at=now - timedelta(days=8),
    )
    for key, application_id, from_stage, to_stage, created_at in (
        (
            "application:asha-rao-senior-backend:received",
            asha_application.id,
            None,
            "received",
            now - timedelta(days=12),
        ),
        (
            "application:asha-rao-senior-backend:screening",
            asha_application.id,
            "received",
            "screening",
            now - timedelta(days=10),
        ),
        (
            "application:asha-rao-senior-backend:interview",
            asha_application.id,
            "screening",
            "interview",
            now - timedelta(days=8),
        ),
        (
            "application:rohan-mehta-senior-backend:received",
            rohan_application.id,
            None,
            "received",
            now - timedelta(days=8),
        ),
        (
            "application:rohan-mehta-senior-backend:screening",
            rohan_application.id,
            "received",
            "screening",
            now - timedelta(days=6),
        ),
    ):
        _ensure(
            db,
            ApplicationStageHistory,
            key,
            tenant_id=org.id,
            application_id=application_id,
            from_stage=from_stage,
            to_stage=to_stage,
            actor_user_id=recruiter.id,
            reason="Sample recruitment pipeline",
            created_at=created_at,
        )

    completed_interview, _ = _ensure(
        db,
        Interview,
        "interview:asha-rao-completed",
        tenant_id=org.id,
        application_id=asha_application.id,
        scheduled_at=now - timedelta(days=5),
        duration_minutes=45,
        timezone="Asia/Kolkata",
        mode="video",
        location="https://meet.example.invalid/sample-interview-1",
        status="completed",
    )
    upcoming_interview, _ = _ensure(
        db,
        Interview,
        "interview:asha-rao-upcoming",
        tenant_id=org.id,
        application_id=asha_application.id,
        scheduled_at=now + timedelta(days=3),
        duration_minutes=45,
        timezone="Asia/Kolkata",
        mode="video",
        location="https://meet.example.invalid/sample-interview-2",
        status="scheduled",
    )
    for key, interview_id, user_id in (
        ("interview:asha-rao-completed:approver", completed_interview.id, approver.id),
        ("interview:asha-rao-completed:recruiter", completed_interview.id, recruiter.id),
        ("interview:asha-rao-upcoming:approver", upcoming_interview.id, approver.id),
        ("interview:asha-rao-upcoming:recruiter", upcoming_interview.id, recruiter.id),
    ):
        _ensure(
            db,
            InterviewParticipant,
            key,
            interview_id=interview_id,
            user_id=user_id,
            participant_role="interviewer",
            response_status="accepted",
            conflict_of_interest=False,
        )
    _ensure(
        db,
        InterviewFeedback,
        "interview:asha-rao-completed-feedback",
        tenant_id=org.id,
        interview_id=completed_interview.id,
        interviewer_user_id=approver.id,
        recommendation="strong_yes",
        comments="Strong API design and clear communication. Move to the next round.",
        submitted_at=now - timedelta(days=4),
    )

    # ---------------------------------------------------------------- content
    content = db.scalar(
        select(CareerContent).where(
            CareerContent.slug == "career-change-guide",
            CareerContent.locale == "en",
        )
    )
    if content is not None:
        _ensure(
            db,
            ContentVersion,
            "content:career-change-guide:version-1",
            content_id=content.id,
            version=1,
            snapshot={
                "title": content.title,
                "slug": content.slug,
                "body": content.body,
                "status": content.status,
                "source": content.source,
            },
            created_by=admin.id,
            created_at=now - timedelta(days=30),
        )
        _ensure(
            db,
            ContentReview,
            "content:career-change-guide:review-1",
            content_id=content.id,
            content_version=1,
            reviewer_user_id=reviewer.id,
            decision="approved",
            comments="Source checked and disclaimer present.",
            created_at=now - timedelta(days=29),
        )
        _ensure(
            db,
            ContentReport,
            "content-report:career-change-guide",
            tenant_id=org.id,
            content_type="career_content",
            content_id=content.id,
            reporter_user_id=employee_user.id,
            reason_category="outdated_information",
            comment="Please confirm the guidance still matches the current hiring market.",
            status="open",
        )

    assessment = db.scalar(
        select(MockTest).where(
            MockTest.tenant_id.is_(None),
            MockTest.title == "Workplace policy basics",
            MockTest.locale == "en",
        )
    )
    if assessment is not None:
        attempt, attempt_created = _ensure(
            db,
            TestAttempt,
            "assessment:employee-workplace-policy-attempt",
            tenant_id=org.id,
            test_id=assessment.id,
            user_id=employee_user.id,
            status="evaluated",
            started_at=now - timedelta(days=3),
            expires_at=now - timedelta(days=3) + timedelta(minutes=15),
            submitted_at=now - timedelta(days=3) + timedelta(minutes=9),
            score=1,
            max_score=2,
        )
        if attempt_created:
            questions = list(
                db.scalars(
                    select(Question)
                    .where(Question.test_id == assessment.id)
                    .order_by(Question.position)
                )
            )
            for question in questions:
                correct = question.correct_answer.get("option_id")
                selected = correct if question.position == 1 else "a"
                is_correct = selected == correct
                _ensure(
                    db,
                    AttemptAnswer,
                    f"assessment:employee-workplace-policy-attempt:answer:{question.position}",
                    attempt_id=attempt.id,
                    question_id=question.id,
                    answer={"option_id": selected},
                    is_correct=is_correct,
                    score=1 if is_correct else 0,
                )
            _ensure(
                db,
                AssessmentAttemptEvent,
                "assessment:employee-workplace-policy-attempt:started",
                attempt_id=attempt.id,
                event_type="started",
                payload={},
                created_at=now - timedelta(days=3),
            )
            _ensure(
                db,
                AssessmentAttemptEvent,
                "assessment:employee-workplace-policy-attempt:submitted",
                attempt_id=attempt.id,
                event_type="submitted",
                payload={"score": 1, "max_score": 2},
                created_at=now - timedelta(days=3) + timedelta(minutes=9),
            )

    _ensure(
        db,
        ResumeProfile,
        "resume:employee",
        tenant_id=org.id,
        user_id=employee_user.id,
        headline="Software Engineer | Python and PostgreSQL",
        summary=(
            "Backend engineer focused on secure APIs, workflow automation and "
            "employee-facing HR tools."
        ),
        data={
            "skills": ["Python", "FastAPI", "PostgreSQL", "SQLAlchemy"],
            "experience": [
                {
                    "company": "Demo Company",
                    "title": "Software Engineer",
                    "from": str(today - timedelta(days=365)),
                }
            ],
            "education": [
                {
                    "institution": "Sample Institute of Technology",
                    "qualification": "B.Tech Computer Science",
                }
            ],
        },
    )

    # ----------------------------------------------------------- notifications
    for key, locale, subject, body in (
        (
            "notification-template:service-request-en",
            "en",
            "HR service request updated",
            "Your HR service request is now {{status}}.",
        ),
        (
            "notification-template:service-request-hi",
            "hi",
            "मानव संसाधन सेवा अनुरोध अपडेट",
            "आपका मानव संसाधन सेवा अनुरोध अब {{status}} है।",
        ),
        (
            "notification-template:onboarding-due-en",
            "en",
            "Onboarding task reminder",
            "Onboarding task {{task}} is due on {{due_at}}.",
        ),
    ):
        _ensure(
            db,
            NotificationTemplate,
            key,
            code=(
                "service_request.status_changed"
                if "service-request" in key
                else "onboarding.task.due"
            ),
            locale=locale,
            version=1,
            channel="in_app",
            subject=subject,
            body=body,
            review_status="approved",
        )
    for key, user, channel, enabled in (
        ("notification-pref:employee:in-app", employee_user, "in_app", True),
        ("notification-pref:employee:email", employee_user, "email", False),
        ("notification-pref:hr:in-app", hr, "in_app", True),
        ("notification-pref:hr:email", hr, "email", True),
    ):
        _ensure(
            db,
            NotificationPreference,
            key,
            user_id=user.id,
            channel=channel,
            enabled=enabled,
        )
    for key, recipient, template_code, subject, body, status, created_at, read_at in (
        (
            "notification:employee-leave-pending",
            employee_user,
            "leave.status_changed",
            "Leave request pending approval",
            "Your casual leave request is waiting for manager approval.",
            "sent",
            now - timedelta(days=1),
            None,
        ),
        (
            "notification:employee-service-read",
            employee_user,
            "service_request.status_changed",
            "Employment letter request in progress",
            "HR is preparing your employment verification letter.",
            "read",
            now - timedelta(days=1, hours=12),
            now - timedelta(hours=20),
        ),
        (
            "notification:hr-service-assigned",
            hr,
            "service_request.status_changed",
            "New HR service request assigned",
            "An employment verification request has been assigned to you.",
            "sent",
            now - timedelta(days=2),
            None,
        ),
        (
            "notification:new-hire-onboarding-due",
            new_hire,
            "onboarding.task.due",
            "Complete your payroll setup",
            "Your payroll setup task is due soon. Contact HR if you need help.",
            "sent",
            now - timedelta(hours=8),
            None,
        ),
    ):
        _ensure(
            db,
            Notification,
            key,
            tenant_id=org.id,
            recipient_user_id=recipient.id,
            channel="in_app",
            template_code=template_code,
            locale="en",
            subject=subject,
            body=body,
            status=status,
            dedupe_key=f"sample:{key}",
            sent_at=created_at,
            read_at=read_at,
            created_at=created_at,
        )

    # --------------------------------------------------------------- reports
    _ensure(
        db,
        ReportExport,
        "report-export:service-queue-ready",
        tenant_id=org.id,
        requester_user_id=hr.id,
        report_type="service_queue",
        filters={"status": "open"},
        requested_fields=["request_id", "subject", "priority", "status"],
        status="ready",
        storage_key="local_metadata://sample/service-queue-report",
        expires_at=now + timedelta(days=7),
        created_at=now - timedelta(days=1),
        completed_at=now - timedelta(days=1) + timedelta(minutes=2),
    )
    _ensure(
        db,
        ReportExport,
        "report-export:hr-summary-queued",
        tenant_id=org.id,
        requester_user_id=hr.id,
        report_type="hr_summary",
        filters={},
        requested_fields=["leave_request_id", "status", "start_at", "end_at"],
        status="queued",
        expires_at=None,
        created_at=now - timedelta(hours=1),
        completed_at=None,
    )

    # ------------------------------------------------- workflow and retention
    reminder_rule, _ = _ensure(
        db,
        ReminderRule,
        "reminder-rule:leave-decision-sla",
        tenant_id=org.id,
        name="Leave decision SLA reminder",
        entity_type="leave_request",
        offset_hours=24,
        repeat_interval_hours=24,
        max_repeats=2,
        recipients={"role_codes": ["approver"]},
        channel="in_app",
        active=True,
        effective_from=date(today.year, 1, 1),
    )
    _ensure(
        db,
        ReminderInstance,
        "reminder-instance:leave-decision-sla",
        tenant_id=org.id,
        rule_id=reminder_rule.id,
        target_type="leave_request",
        target_id=pending_leave.id,
        dedupe_key="sample:leave-decision-sla",
        status="scheduled",
        scheduled_at=now + timedelta(hours=23),
        sent_at=None,
        attempts=0,
    )
    _ensure(
        db,
        RetentionPolicy,
        "retention-policy:candidate-confidential",
        tenant_id=org.id,
        entity_type="candidate",
        classification="confidential",
        retention_days=365,
        action="delete",
        active=True,
        approved_by=compliance.id,
        effective_from=date(today.year, 1, 1),
    )
    _ensure(
        db,
        LegalHold,
        "legal-hold:candidate-asha-rao",
        tenant_id=org.id,
        target_type="candidate",
        target_id=asha.id,
        reason="Sample hold for a recruitment dispute review.",
        status="active",
        applied_by=compliance.id,
        applied_at=now - timedelta(days=3),
        released_by=None,
        released_at=None,
    )
    _ensure(
        db,
        DeletionRequest,
        "deletion-request:candidate-rohan-mehta",
        tenant_id=org.id,
        requester_user_id=compliance.id,
        subject_type="candidate",
        subject_id=rohan.id,
        scope={"applications": [str(rohan_application.id)]},
        status="pending",
        approved_by=None,
        evidence={"source": "sample candidate erasure request"},
        created_at=now - timedelta(days=2),
        completed_at=None,
    )

    # ------------------------------------------------------------------ audit
    for key, action, target_type, target_id, occurred_at in (
        (
            "audit:sample-data-loaded",
            "seed.sample_data_loaded",
            "organization",
            org.id,
            now,
        ),
        (
            "audit:leave-approved",
            "leave.request.approved",
            "leave_request",
            approved_leave.id,
            now - timedelta(days=24),
        ),
        (
            "audit:requisition-approved",
            "requisition.approved",
            "requisition",
            open_requisition.id,
            now - timedelta(days=10),
        ),
    ):
        _ensure(
            db,
            AuditEvent,
            key,
            tenant_id=org.id,
            actor_user_id=admin.id if key == "audit:sample-data-loaded" else approver.id,
            actor_type="user",
            action=action,
            target_type=target_type,
            target_id=target_id,
            outcome="success",
            correlation_id="sample-seed",
            request_id="sample-seed",
            metadata_json={"sample_data": True},
            occurred_at=occurred_at,
        )
