"""Idempotent development seed data.

Run from the backend directory:

    uv run python -m app.db.seed

The default password is development-only. Set SEED_PASSWORD to override it.
Sample records for every MVP module are loaded by default; set
SEED_SAMPLE_DATA=false to load only the base configuration. Tests pass
``include_sample_data=False`` so they start from a predictable baseline.
Never run this module against production.
"""

from __future__ import annotations

import os
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.models import (
    ApprovalRule,
    ApprovalRuleStep,
    CareerContent,
    Course,
    Department,
    EmployeeProfile,
    Holiday,
    HolidayCalendar,
    KnowledgeChunk,
    LeaveBalance,
    LeaveType,
    MembershipRole,
    MockTest,
    Notification,
    NotificationTemplate,
    OnboardingTemplate,
    OnboardingTemplateTask,
    Organization,
    Permission,
    PolicyDocument,
    PrivacyNoticeVersion,
    Question,
    Role,
    RolePermission,
    ServiceCatalogItem,
    TenantMembership,
    User,
)
from app.db.sample_data import populate_sample_data
from app.db.session import SessionLocal

PERMISSIONS: dict[str, str] = {
    "hr_assistant.query": "Ask tenant policy questions",
    "hr_assistant.feedback": "Rate or flag an assistant answer",
    "service_request.create": "Raise an HR service request",
    "service_request.read_own": "View own service requests",
    "service_request.read_queue": "Work an assigned service queue",
    "service_request.update_assigned": "Update an assigned service request",
    "leave.request.create": "Submit leave",
    "leave.request.read_own": "View own leave",
    "leave.request.read_scope": "View team or tenant leave",
    "leave.request.decide": "Decide leave requests",
    "leave.request.cancel_own": "Cancel own leave request",
    "leave.type.manage": "Configure leave types",
    "leave.balance.adjust": "Adjust leave balances",
    "onboarding.case.read": "View permitted onboarding cases",
    "onboarding.case.create": "Create onboarding cases",
    "onboarding.task.update_assigned": "Update an assigned onboarding task",
    "onboarding.template.manage": "Manage onboarding templates",
    "recruitment.requisition.manage": "Manage requisitions",
    "recruitment.requisition.approve": "Approve requisitions",
    "recruitment.application.read_assigned": "View assigned applications",
    "recruitment.application.create": "Create applications",
    "recruitment.application.stage.update": "Move application stages",
    "recruitment.interview.schedule": "Schedule interviews",
    "recruitment.feedback.submit": "Submit interview feedback",
    "report.read": "View HR reports",
    "report.export": "Export HR reports",
    "career_content.edit": "Draft public career content",
    "career_content.review": "Review public career content",
    "career_content.publish": "Publish public career content",
    "course.manage": "Manage the course catalogue",
    "assessment.manage": "Manage mock tests",
    "assessment.attempt_own": "Take mock tests",
    "resume.manage_own": "Manage own resume profile",
    "content_report.create": "Report public content",
    "content_report.triage": "Triage public content reports",
    "admin.membership.manage": "Manage memberships and roles",
    "admin.settings.manage": "Manage organization settings",
    "admin.workflow.manage": "Manage workflow configuration",
    "notification.read_own": "View own notifications",
    "audit.read": "Review audit events",
    "retention.manage": "Manage retention and deletion",
    "legal_hold.manage": "Apply and release legal holds",
}

EMPLOYEE = {
    "hr_assistant.query",
    "hr_assistant.feedback",
    "service_request.create",
    "service_request.read_own",
    "leave.request.create",
    "leave.request.read_own",
    "leave.request.cancel_own",
    "onboarding.case.read",
    "onboarding.task.update_assigned",
    "assessment.attempt_own",
    "content_report.create",
    "notification.read_own",
    "resume.manage_own",
}
HR_EXECUTIVE = EMPLOYEE | {
    "service_request.read_queue",
    "service_request.update_assigned",
    "leave.request.read_scope",
    "leave.balance.adjust",
    "onboarding.case.create",
    "onboarding.template.manage",
    "leave.type.manage",
    "report.read",
    "report.export",
}
APPROVER = {
    "hr_assistant.query",
    "hr_assistant.feedback",
    "service_request.create",
    "service_request.read_own",
    "leave.request.create",
    "leave.request.read_own",
    "leave.request.read_scope",
    "leave.request.decide",
    "leave.request.cancel_own",
    "onboarding.case.read",
    "onboarding.task.update_assigned",
    "recruitment.requisition.approve",
    "report.read",
    "notification.read_own",
    "content_report.create",
}
RECRUITER = {
    "hr_assistant.query",
    "hr_assistant.feedback",
    "service_request.create",
    "service_request.read_own",
    "leave.request.create",
    "leave.request.read_own",
    "leave.request.cancel_own",
    "onboarding.case.read",
    "onboarding.task.update_assigned",
    "recruitment.requisition.manage",
    "recruitment.application.read_assigned",
    "recruitment.application.create",
    "recruitment.application.stage.update",
    "recruitment.interview.schedule",
    "recruitment.feedback.submit",
    "notification.read_own",
    "content_report.create",
}
CONTENT_EDITOR = {
    "career_content.edit",
    "course.manage",
    "content_report.create",
    "content_report.triage",
    "notification.read_own",
}
CONTENT_REVIEWER = {
    "career_content.review",
    "career_content.publish",
    "course.manage",
    "assessment.manage",
    "content_report.create",
    "content_report.triage",
    "notification.read_own",
}
TENANT_ADMIN = set(PERMISSIONS) - {
    # Platform editorial duties are separate from tenant administration.
    "career_content.edit",
    "career_content.review",
    "career_content.publish",
    "course.manage",
    "assessment.manage",
}
AUDITOR = {"audit.read", "report.read", "notification.read_own"}
COMPLIANCE = {
    "audit.read",
    "retention.manage",
    "legal_hold.manage",
    "report.read",
    "notification.read_own",
}

ROLE_DEFINITIONS = {
    "employee": ("Employee", EMPLOYEE),
    "hr_executive": ("HR Executive", HR_EXECUTIVE),
    "approver": ("Approver", APPROVER),
    "recruiter": ("Recruiter", RECRUITER),
    "content_editor": ("Content Editor", CONTENT_EDITOR),
    "content_reviewer": ("Content Reviewer", CONTENT_REVIEWER),
    "tenant_admin": ("Tenant Administrator", TENANT_ADMIN),
    "auditor": ("Auditor", AUDITOR),
    "compliance": ("Compliance Officer", COMPLIANCE),
}


def _ensure_permissions(db: Session) -> dict[str, Permission]:
    result: dict[str, Permission] = {}
    for code, description in PERMISSIONS.items():
        permission = db.scalar(select(Permission).where(Permission.code == code))
        if permission is None:
            permission = Permission(code=code, description=description)
            db.add(permission)
        result[code] = permission
    db.flush()
    return result


def _ensure_roles(db: Session) -> dict[str, Role]:
    result: dict[str, Role] = {}
    for code, (name, _) in ROLE_DEFINITIONS.items():
        role = db.scalar(select(Role).where(Role.code == code))
        if role is None:
            role = Role(
                tenant_id=None,
                code=code,
                name=name,
                description=f"System role: {name}",
                is_system=True,
            )
            db.add(role)
        result[code] = role
    db.flush()
    return result


def _sync_role_permissions(
    db: Session,
    roles: dict[str, Role],
    permissions: dict[str, Permission],
) -> None:
    for code, (_, permission_codes) in ROLE_DEFINITIONS.items():
        role = roles[code]
        existing = {
            row.permission_id
            for row in db.scalars(
                select(RolePermission).where(RolePermission.role_id == role.id)
            )
        }
        desired = {permissions[item].id for item in permission_codes}
        for permission_id in desired - existing:
            db.add(RolePermission(role_id=role.id, permission_id=permission_id))
        for permission_id in existing - desired:
            row = db.get(RolePermission, (role.id, permission_id))
            if row:
                db.delete(row)
    db.flush()


def _ensure_org(db: Session) -> Organization:
    org = db.scalar(select(Organization).where(Organization.slug == "demo"))
    if org is None:
        org = Organization(
            name="Demo Company",
            slug="demo",
            status="active",
            default_locale="en",
            timezone="Asia/Kolkata",
            settings={"modules": {"leave": True, "recruitment": True, "onboarding": True}},
        )
        db.add(org)
        db.flush()
    return org


def _ensure_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    password_hash: str,
    locale: str = "en",
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
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
    elif user.user_type != "internal":
        raise RuntimeError(f"Seed email {email} belongs to a non-internal account")
    return user


def _ensure_membership(
    db: Session, org: Organization, user: User, roles: dict[str, Role], role_codes: list[str]
) -> TenantMembership:
    membership = db.scalar(
        select(TenantMembership).where(
            TenantMembership.tenant_id == org.id,
            TenantMembership.user_id == user.id,
        )
    )
    if membership is None:
        membership = TenantMembership(
            tenant_id=org.id, user_id=user.id, status="active"
        )
        db.add(membership)
        db.flush()
    existing = {
        row.role_id
        for row in db.scalars(
            select(MembershipRole).where(MembershipRole.membership_id == membership.id)
        )
    }
    for code in role_codes:
        role = roles[code]
        if role.id not in existing:
            db.add(
                MembershipRole(membership_id=membership.id, role_id=role.id, scope={})
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
    manager: EmployeeProfile | None = None,
    job_title: str = "Employee",
) -> EmployeeProfile:
    employee = db.scalar(
        select(EmployeeProfile).where(
            EmployeeProfile.tenant_id == org.id,
            EmployeeProfile.user_id == user.id,
        )
    )
    if employee is None:
        employee = EmployeeProfile(
            tenant_id=org.id,
            user_id=user.id,
            employee_number=employee_number,
            department_id=department.id,
            manager_employee_id=manager.id if manager else None,
            job_title=job_title,
            join_date=date.today() - timedelta(days=365),
            status="active",
        )
        db.add(employee)
        db.flush()
    elif manager and employee.manager_employee_id is None:
        employee.manager_employee_id = manager.id
        db.add(employee)
    return employee


def _ensure_leave_types(db: Session, org: Organization) -> dict[str, LeaveType]:
    definitions = [
        ("CL", "Casual Leave", "आकस्मिक अवकाश", True),
        ("SL", "Sick Leave", "बीमारी अवकाश", False),
        ("EL", "Earned Leave", "अर्जित अवकाश", True),
    ]
    result = {}
    for code, name_en, name_hi, half_day in definitions:
        item = db.scalar(
            select(LeaveType).where(
                LeaveType.tenant_id == org.id, LeaveType.code == code
            )
        )
        if item is None:
            item = LeaveType(
                tenant_id=org.id,
                code=code,
                name_en=name_en,
                name_hi=name_hi,
                unit="days",
                requires_approval=True,
                allow_half_day=half_day,
                active=True,
            )
            db.add(item)
        result[code] = item
    db.flush()
    return result


def _ensure_balances(
    db: Session,
    org: Organization,
    employee: EmployeeProfile,
    leave_types: dict[str, LeaveType],
) -> None:
    year = date.today().year
    entitled = {"CL": Decimal("24"), "SL": Decimal("12"), "EL": Decimal("18")}
    for code, leave_type in leave_types.items():
        existing = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.tenant_id == org.id,
                LeaveBalance.employee_id == employee.id,
                LeaveBalance.leave_type_id == leave_type.id,
                LeaveBalance.period_start == date(year, 1, 1),
            )
        )
        if existing is None:
            db.add(
                LeaveBalance(
                    tenant_id=org.id,
                    employee_id=employee.id,
                    leave_type_id=leave_type.id,
                    period_start=date(year, 1, 1),
                    period_end=date(year, 12, 31),
                    entitled=entitled[code],
                    consumed=Decimal("0"),
                    pending=Decimal("0"),
                    carried_forward=Decimal("0"),
                )
            )
    db.flush()


def _ensure_holidays(db: Session, org: Organization) -> None:
    calendar = db.scalar(
        select(HolidayCalendar).where(
            HolidayCalendar.tenant_id == org.id, HolidayCalendar.code == "IN"
        )
    )
    if calendar is None:
        calendar = HolidayCalendar(
            tenant_id=org.id,
            code="IN",
            name="India",
            timezone="Asia/Kolkata",
        )
        db.add(calendar)
        db.flush()
    holidays = [
        (date(date.today().year, 1, 26), "Republic Day"),
        (date(date.today().year, 8, 15), "Independence Day"),
        (date(date.today().year, 10, 2), "Gandhi Jayanti"),
    ]
    existing = set(
        db.scalars(
            select(Holiday.holiday_date).where(
                Holiday.tenant_id == org.id, Holiday.calendar_id == calendar.id
            )
        )
    )
    for holiday_date, name in holidays:
        if holiday_date not in existing:
            db.add(
                Holiday(
                    tenant_id=org.id,
                    calendar_id=calendar.id,
                    holiday_date=holiday_date,
                    name=name,
                    is_working_day_override=False,
                )
            )
    db.flush()


def _ensure_policies(
    db: Session, org: Organization, admin: User
) -> dict[str, PolicyDocument]:
    documents = [
        {
            "title": "Leave Policy",
            "version": "3.1",
            "locale": "en",
            "effective_from": date(date.today().year, 1, 1),
            "source": "People Handbook 2026",
            "chunks": [
                (
                    "Eligibility and notice",
                    "All confirmed employees are eligible for casual, sick and earned "
                    "leave. Casual leave should normally be requested at least two working "
                    "days in advance. Sick leave may be recorded retrospectively with a "
                    "medical note where absence exceeds two days.",
                ),
                (
                    "Approval workflow",
                    "Leave requests are routed to the reporting manager. If no manager is "
                    "assigned, the HR approver queue handles the request. An approver may "
                    "request clarification; the employee must respond before the request "
                    "can be decided. Employment decisions always involve a human approver.",
                ),
                (
                    "Cancellation",
                    "Employees may cancel a pending or approved request. Approved leave "
                    "that is cancelled returns the reserved days to the employee balance.",
                ),
            ],
        },
        {
            "title": "Leave Policy",
            "version": "3.1",
            "locale": "hi",
            "effective_from": date(date.today().year, 1, 1),
            "source": "People Handbook 2026",
            "chunks": [
                (
                    "पात्रता",
                    "सभी पुष्ट कर्मचारी आकस्मिक, बीमारी और अर्जित अवकाश के लिए पात्र हैं। "
                    "आकस्मिक अवकाश सामान्यतः दो कार्य दिवस पहले आवेदन करें। दो दिन से "
                    "अधिक बीमारी अवकाश के लिए चिकित्सा प्रमाण आवश्यक हो सकता है।",
                ),
                (
                    "स्वीकृति",
                    "अवकाश अनुरोध रिपोर्टिंग प्रबंधक के पास जाता है। प्रबंधक न होने पर "
                    "मानव संसाधन स्वीकरण कतार देखती है। अंतिम रोजगार निर्णय मानव द्वारा लिया जाता है।",
                ),
            ],
        },
        {
            "title": "Remote Work Policy",
            "version": "2.0",
            "locale": "en",
            "effective_from": date(date.today().year, 2, 1),
            "source": "People Handbook 2026",
            "chunks": [
                (
                    "Eligibility",
                    "Employees may request remote work for up to two days per week, subject "
                    "to manager approval and role suitability. Customer-facing or on-site "
                    "duties may require attendance.",
                ),
                (
                    "Equipment and security",
                    "Remote work must use company-managed devices and multi-factor "
                    "authentication. Confidential documents must not be stored on personal "
                    "cloud accounts.",
                ),
            ],
        },
    ]
    result: dict[str, PolicyDocument] = {}
    for definition in documents:
        document = db.scalar(
            select(PolicyDocument).where(
                PolicyDocument.tenant_id == org.id,
                PolicyDocument.title == definition["title"],
                PolicyDocument.version == definition["version"],
                PolicyDocument.locale == definition["locale"],
            )
        )
        if document is None:
            document = PolicyDocument(
                tenant_id=org.id,
                title=definition["title"],
                version=definition["version"],
                locale=definition["locale"],
                status="published",
                classification="internal",
                effective_from=definition["effective_from"],
                source=definition["source"],
                created_by=admin.id,
                published_at=datetime.now(UTC),
            )
            db.add(document)
            db.flush()
            for index, (section, content) in enumerate(definition["chunks"]):
                db.add(
                    KnowledgeChunk(
                        tenant_id=org.id,
                        policy_document_id=document.id,
                        chunk_index=index,
                        section=section,
                        content=content,
                        locale=definition["locale"],
                        classification="internal",
                        index_generation=1,
                        active=True,
                    )
                )
        result[f"{definition['title']}:{definition['locale']}"] = document
    db.flush()
    return result


def _ensure_service_catalog(db: Session, org: Organization) -> None:
    definitions = [
        (
            "GENERAL_HR",
            "General HR support",
            "सामान्य मानव संसाधन सहायता",
            "Ask an HR question or request a policy clarification.",
            {"required": ["topic"], "properties": {"topic": {"type": "string"}}},
            24,
        ),
        (
            "DOCUMENT_LETTER",
            "Employment letter",
            "रोजगार पत्र",
            "Request an employment verification or experience letter.",
            {
                "required": ["letter_type"],
                "properties": {"letter_type": {"type": "string"}},
            },
            48,
        ),
        (
            "IT_ACCESS",
            "HR system access",
            "मानव संसाधन प्रणाली पहुँच",
            "Request access or a permission change.",
            {"required": ["system"], "properties": {"system": {"type": "string"}}},
            48,
        ),
    ]
    for code, name_en, name_hi, description, form_schema, sla in definitions:
        existing = db.scalar(
            select(ServiceCatalogItem).where(
                ServiceCatalogItem.tenant_id == org.id,
                ServiceCatalogItem.code == code,
            )
        )
        if existing is None:
            db.add(
                ServiceCatalogItem(
                    tenant_id=org.id,
                    code=code,
                    name_en=name_en,
                    name_hi=name_hi,
                    description=description,
                    form_schema=form_schema,
                    sla_hours=sla,
                    queue_code="hr",
                    active=True,
                )
            )
    db.flush()


def _ensure_onboarding_template(db: Session, org: Organization, admin: User) -> None:
    template = db.scalar(
        select(OnboardingTemplate).where(
            OnboardingTemplate.tenant_id == org.id,
            OnboardingTemplate.name == "Standard onboarding",
        )
    )
    if template is None:
        template = OnboardingTemplate(
            tenant_id=org.id,
            name="Standard onboarding",
            status="active",
            created_by=admin.id,
        )
        db.add(template)
        db.flush()
        tasks = [
            ("Sign employment documents", "hr", 0, True),
            ("Complete payroll setup", "hr", 2, False),
            ("Review team handbook", "employee", 3, False),
            ("Meet your manager", "manager", 5, False),
            ("Confirm probation objectives", "manager", 14, False),
        ]
        for position, (title, owner, offset, evidence) in enumerate(tasks, start=1):
            db.add(
                OnboardingTemplateTask(
                    template_id=template.id,
                    title=title,
                    owner_rule=owner,
                    due_offset_days=offset,
                    required_evidence=evidence,
                    position=position,
                )
            )
        db.flush()


def _ensure_approval_rule(db: Session, org: Organization, admin: User) -> None:
    existing = db.scalar(
        select(ApprovalRule).where(
            ApprovalRule.tenant_id == org.id, ApprovalRule.code == "LEAVE_STANDARD"
        )
    )
    if existing is not None:
        return
    rule = ApprovalRule(
        tenant_id=org.id,
        code="LEAVE_STANDARD",
        name="Standard leave approval",
        entity_type="leave_request",
        active=True,
        effective_from=date(date.today().year, 1, 1),
        created_by=admin.id,
    )
    db.add(rule)
    db.flush()
    db.add(
        ApprovalRuleStep(
            rule_id=rule.id,
            step_order=1,
            approver_type="manager",
            escalate_after_hours=24,
            metadata_json={},
        )
    )
    db.flush()


def _ensure_privacy_notice(db: Session, org: Organization) -> PrivacyNoticeVersion:
    notice = db.scalar(
        select(PrivacyNoticeVersion).where(
            PrivacyNoticeVersion.tenant_id == org.id,
            PrivacyNoticeVersion.code == "candidate_privacy",
            PrivacyNoticeVersion.version == "1.0",
            PrivacyNoticeVersion.locale == "en",
        )
    )
    if notice is None:
        notice = PrivacyNoticeVersion(
            tenant_id=org.id,
            code="candidate_privacy",
            version="1.0",
            locale="en",
            body=(
                "This notice explains how Demo Company processes candidate data for "
                "recruitment, including retention and candidate rights. Confirm the final "
                "legal text with the privacy owner before production use."
            ),
            effective_from=date(date.today().year, 1, 1),
        )
        db.add(notice)
        db.flush()
    return notice


def _ensure_public_content(db: Session, admin: User) -> None:
    now = datetime.now(UTC)
    content = [
        {
            "content_type": "article",
            "title": "How to prepare for a career change",
            "title_hi": None,
            "slug": "career-change-guide",
            "locale": "en",
            "summary": "A practical, source-checked guide to planning a career move.",
            "body": (
                "Start with a skills inventory, research target roles, and validate "
                "requirements against current employer job descriptions. Keep your resume "
                "factual and tailored. This is general guidance, not a guarantee of outcomes."
            ),
            "source": "Demo career editorial guidance",
            "geography": "India",
        },
        {
            "content_type": "salary",
            "title": "Software engineer salary guide",
            "slug": "software-engineer-salary",
            "locale": "en",
            "summary": "Indicative salary ranges for software engineers in India.",
            "body": (
                "Salary ranges vary by city, experience and employer. The figures shown are "
                "estimates for planning only and are not a guarantee of pay."
            ),
            "source": "Demo labour-market snapshot",
            "geography": "India",
            "currency": "INR",
            "salary_min": Decimal("600000"),
            "salary_max": Decimal("2400000"),
            "salary_is_estimate": True,
        },
        {
            "content_type": "salary",
            "title": "सॉफ्टवेयर इंजीनियर वेतन मार्गदर्शिका",
            "slug": "software-engineer-salary",
            "locale": "hi",
            "summary": "भारत में सॉफ्टवेयर इंजीनियर के लिए संकेतात्मक वेतन सीमा।",
            "body": (
                "वेतन शहर, अनुभव और नियोक्ता के अनुसार बदलता है। दिखाई गई राशि केवल "
                "योजना के लिए अनुमान है और वेतन की गारंटी नहीं है।"
            ),
            "source": "डेमो श्रम बाजार स्नैपशॉट",
            "geography": "भारत",
            "currency": "INR",
            "salary_min": Decimal("600000"),
            "salary_max": Decimal("2400000"),
            "salary_is_estimate": True,
        },
        {
            "content_type": "exam",
            "title": "Public service exam planning guide",
            "slug": "public-service-exam-guide",
            "locale": "en",
            "summary": "How to verify exam notifications and build a study plan.",
            "body": (
                "Always verify dates, eligibility and syllabus against the official exam "
                "authority notification. This guide is planning support, not an official "
                "notification or a prediction of selection."
            ),
            "source": "Demo exam guidance",
            "exam_authority": "Official exam authority",
            "syllabus_version": "Check current notification",
            "geography": "India",
        },
        {
            "content_type": "job",
            "title": "Entry-level operations role: what to expect",
            "slug": "entry-level-operations",
            "locale": "en",
            "summary": "Typical skills and responsibilities in operations roles.",
            "body": (
                "Operations roles often involve process coordination, documentation and "
                "stakeholder communication. Job descriptions vary; always read the specific "
                "employer posting before applying."
            ),
            "source": "Demo careers editorial",
            "geography": "India",
        },
    ]
    for definition in content:
        existing = db.scalar(
            select(CareerContent).where(
                CareerContent.slug == definition["slug"],
                CareerContent.locale == definition["locale"],
            )
        )
        if existing is not None:
            continue
        db.add(
            CareerContent(
                tenant_id=None,
                content_type=definition["content_type"],
                title=definition["title"],
                slug=definition["slug"],
                locale=definition["locale"],
                summary=definition.get("summary"),
                body=definition["body"],
                source=definition.get("source"),
                source_checked_at=date.today(),
                effective_from=date(date.today().year, 1, 1),
                expires_at=date(date.today().year + 1, 12, 31),
                geography=definition.get("geography"),
                currency=definition.get("currency"),
                salary_min=definition.get("salary_min"),
                salary_max=definition.get("salary_max"),
                salary_is_estimate=definition.get("salary_is_estimate", True),
                exam_authority=definition.get("exam_authority"),
                syllabus_version=definition.get("syllabus_version"),
                status="published",
                published_at=now,
                created_by=admin.id,
            )
        )
    db.flush()

    if not db.scalar(select(Course).where(Course.title == "Interview communication basics")):
        db.add(
            Course(
                tenant_id=None,
                title="Interview communication basics",
                provider="Demo Learning",
                provider_url="https://example.invalid/courses/interview-communication",
                locale="en",
                level="beginner",
                format="online",
                topic="Interview skills",
                source_checked_at=date.today(),
                status="published",
                published_at=now,
                expires_at=date(date.today().year + 1, 12, 31),
                created_by=admin.id,
            )
        )


def _ensure_mock_test(db: Session) -> None:
    existing = db.scalar(
        select(MockTest).where(
            MockTest.tenant_id.is_(None),
            MockTest.title == "Workplace policy basics",
            MockTest.locale == "en",
        )
    )
    if existing is not None:
        return
    test = MockTest(
        tenant_id=None,
        title="Workplace policy basics",
        description="A short practice test on approved policy guidance.",
        locale="en",
        duration_minutes=15,
        pass_score=60,
        status="published",
        published_at=datetime.now(UTC),
    )
    db.add(test)
    db.flush()
    questions = [
        (
            "Where should you verify the current leave approval process?",
            [
                {"id": "a", "label": "An approved, current HR policy source"},
                {"id": "b", "label": "An anonymous social media post"},
                {"id": "c", "label": "A stale copy of the handbook"},
            ],
            {"option_id": "a"},
            "Policy answers should cite approved, current sources.",
        ),
        (
            "Who makes the final employment decision on a leave request?",
            [
                {"id": "a", "label": "An automated AI model"},
                {"id": "b", "label": "A human approver within the configured workflow"},
                {"id": "c", "label": "A random selection"},
            ],
            {"option_id": "b"},
            "The assistant is advisory; employment decisions remain human-led.",
        ),
    ]
    for position, (prompt, options, correct, explanation) in enumerate(questions, start=1):
        db.add(
            Question(
                test_id=test.id,
                position=position,
                prompt=prompt,
                options=options,
                correct_answer=correct,
                explanation=explanation,
                max_score=1,
            )
        )
    db.flush()


def _ensure_notifications(
    db: Session, org: Organization, employees: dict[str, EmployeeProfile], users: dict[str, User]
) -> None:
    template = db.scalar(
        select(NotificationTemplate).where(
            NotificationTemplate.code == "leave.status_changed",
            NotificationTemplate.locale == "en",
            NotificationTemplate.version == 1,
        )
    )
    if template is None:
        db.add(
            NotificationTemplate(
                code="leave.status_changed",
                locale="en",
                version=1,
                channel="in_app",
                subject="Leave request updated",
                body="Your leave request status changed to {{status}}.",
                review_status="approved",
            )
        )
    recipient = users["employee"]
    existing = db.scalar(
        select(Notification).where(
            Notification.recipient_user_id == recipient.id,
            Notification.template_code == "welcome",
        )
    )
    if existing is None:
        db.add(
            Notification(
                tenant_id=org.id,
                recipient_user_id=recipient.id,
                channel="in_app",
                template_code="welcome",
                locale="en",
                subject="Welcome to the HR Assistant",
                body=(
                    "You can ask approved policy questions, raise HR requests and view your "
                    "leave. AI answers are advisory; contact HR when you need a decision."
                ),
                status="sent",
                sent_at=datetime.now(UTC),
                created_at=datetime.now(UTC),
            )
        )
    db.flush()


def seed(db: Session, *, include_sample_data: bool | None = None) -> None:
    if settings.is_production:
        raise RuntimeError("Seed data must not be loaded in production")
    if include_sample_data is None:
        include_sample_data = os.getenv("SEED_SAMPLE_DATA", "true").strip().lower() not in {
            "0",
            "false",
            "no",
            "off",
        }
    password = os.getenv("SEED_PASSWORD", "LocalDevOnly!123")
    computed_hash = hash_password(password)
    permissions = _ensure_permissions(db)
    roles = _ensure_roles(db)
    _sync_role_permissions(db, roles, permissions)
    org = _ensure_org(db)
    departments = {}
    for code, name in (("ENG", "Engineering"), ("PEO", "People")):
        department = db.scalar(
            select(Department).where(
                Department.tenant_id == org.id, Department.code == code
            )
        )
        if department is None:
            department = Department(tenant_id=org.id, code=code, name=name)
            db.add(department)
            db.flush()
        departments[code] = department

    user_definitions = {
        "admin": ("admin@example.com", "Demo Admin", ["tenant_admin"]),
        "hr": ("hr@example.com", "Demo HR", ["hr_executive"]),
        "approver": ("approver@example.com", "Demo Approver", ["approver"]),
        "recruiter": ("recruiter@example.com", "Demo Recruiter", ["recruiter"]),
        "employee": ("employee@example.com", "Demo Employee", ["employee"]),
        "employee2": ("employee2@example.com", "Demo Employee Two", ["employee"]),
        "auditor": ("auditor@example.com", "Demo Auditor", ["auditor"]),
        "content": (
            "content@example.com",
            "Demo Content Team",
            ["content_editor", "content_reviewer"],
        ),
        "reviewer": ("reviewer@example.com", "Demo Content Reviewer", ["content_reviewer"]),
        "compliance": ("compliance@example.com", "Demo Compliance", ["compliance"]),
    }
    users: dict[str, User] = {}
    memberships: dict[str, TenantMembership] = {}
    for key, (email, full_name, role_codes) in user_definitions.items():
        user = _ensure_user(
            db,
            email=email,
            full_name=full_name,
            password_hash=computed_hash,
            locale="hi" if key == "employee2" else "en",
        )
        users[key] = user
        memberships[key] = _ensure_membership(db, org, user, roles, role_codes)

    employees = {}
    employees["approver"] = _ensure_employee(
        db,
        org,
        users["approver"],
        employee_number="EMP-0001",
        department=departments["ENG"],
        job_title="Engineering Manager",
    )
    employees["employee"] = _ensure_employee(
        db,
        org,
        users["employee"],
        employee_number="EMP-0002",
        department=departments["ENG"],
        manager=employees["approver"],
        job_title="Software Engineer",
    )
    employees["employee2"] = _ensure_employee(
        db,
        org,
        users["employee2"],
        employee_number="EMP-0003",
        department=departments["ENG"],
        manager=employees["approver"],
        job_title="Software Engineer",
    )
    employees["hr"] = _ensure_employee(
        db,
        org,
        users["hr"],
        employee_number="EMP-0004",
        department=departments["PEO"],
        job_title="HR Executive",
    )
    employees["admin"] = _ensure_employee(
        db,
        org,
        users["admin"],
        employee_number="EMP-0099",
        department=departments["PEO"],
        job_title="HR Administrator",
    )
    employees["recruiter"] = _ensure_employee(
        db,
        org,
        users["recruiter"],
        employee_number="EMP-0098",
        department=departments["PEO"],
        job_title="Talent Acquisition Partner",
    )

    leave_types = _ensure_leave_types(db, org)
    for key in ("admin", "employee", "employee2", "approver", "hr", "recruiter"):
        _ensure_balances(db, org, employees[key], leave_types)
    _ensure_holidays(db, org)
    _ensure_policies(db, org, users["admin"])
    _ensure_service_catalog(db, org)
    _ensure_onboarding_template(db, org, users["admin"])
    _ensure_approval_rule(db, org, users["admin"])
    _ensure_privacy_notice(db, org)
    _ensure_public_content(db, users["admin"])
    _ensure_mock_test(db)
    _ensure_notifications(db, org, employees, users)
    if include_sample_data:
        populate_sample_data(
            db,
            org=org,
            users=users,
            employees=employees,
            departments=departments,
            leave_types=leave_types,
            roles=roles,
            password_hash=computed_hash,
        )
    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed(db)
        print(
            "Seed data loaded. Demo users: admin@example.com, hr@example.com, "
            "employee@example.com, newhire@example.com"
        )
        print("Sample records for all MVP modules are included unless SEED_SAMPLE_DATA=false.")
        if os.getenv("SEED_PASSWORD") is None:
            print("SEED_PASSWORD was not set; use the documented development password.")


if __name__ == "__main__":
    main()
