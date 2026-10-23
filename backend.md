# Backend Engineering Guide — HR Assistant

**Document:** `backend.md`  
**Source:** HR Assistant Application — Software Requirements Specification (SRS), Version 1.0, Draft for stakeholder review, 22 October 2026  
**Version:** 1.1 — SRS alignment update, 22 October 2026  
**Status:** Engineering baseline for review; not a substitute for approved security, privacy, HR-policy, or architecture decisions.

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 22 Oct 2026 | Initial backend baseline derived from SRS v1.0. |
| 1.1 | 22 Oct 2026 | Aligned to SRS §8–§12 and Appendix B: added permission catalogue and principal model, physical PostgreSQL/RLS/partitioning/concurrency guidance, gap-resolution entities, HR service requests, administration, reminder rules, retention/deletion, localization contract, error model, audit catalogue, async job catalogue, full FR/NFR traceability, and SRS gap register. |

## 1. Purpose and scope

This document defines the backend implementation approach for the bilingual HR Assistant web application. The specified technology baseline is **FastAPI + PostgreSQL**. The backend supports:

- Internal, tenant-scoped HR workflows: HR policy knowledge assistant, HR service requests, leave, onboarding, recruitment, reports, reminders, administration, and audit.
- Public career features: HR job guidance, salary guidance, exam guides, mock tests, resume profiles, course catalogue, public content feedback, and content publishing workflows.
- English and Hindi user experiences, with locale-aware backend responses and reviewed content.
- Security, privacy, traceability, and reliability controls.

The SRS explicitly excludes payroll calculation/disbursement, a full HRIS replacement, autonomous high-impact employment decisions, and native mobile applications from the MVP.

## 2. Source-derived requirements and implementation principles

The following are requirements from the SRS and must be traceable to code and tests:

1. Authenticate users and authorize every protected request server-side (FR-001).
2. Derive internal tenant context from verified identity/membership, not blindly from request input (FR-002; security section).
3. Keep public career accounts separate from employee/HR privileges unless separately authorized (FR-003).
4. Retrieve only approved, current policy sources that the requesting user is authorized to access; return citations and a safe fallback when evidence is missing (FR-005–FR-007).
5. Support HR service requests with catalog-driven forms, own/assigned access, comments, attachments, and status tracking (FR-008).
6. Validate leave dates, policy rules, overlap, configured balance, and required fields on the server; route to configured approvers and record decisions/audit events (FR-009–FR-012).
7. Support onboarding templates, assigned tasks, due dates, completion metadata, and restricted document access (FR-013–FR-015).
8. Support requisitions, candidate/application stages, interview scheduling, tenant-scoped candidate privacy, and human decision-making (FR-016–FR-019).
9. Provide tenant-scoped reports, configurable reminders, sourced and dated career content, mock tests, resume profiles, courses, content review, and feedback (FR-020–FR-028, FR-035).
10. Record material workflow changes and security-relevant events; apply approved retention/deletion rules (FR-029, FR-031).
11. Publish documented API schemas, error codes, authorization expectations, and retry-safe submission endpoints (FR-033–FR-034).
12. Use HTTPS/TLS, secure sessions, validation, parameterized database access, secrets management, least privilege, rate limiting, audit controls, backups, and secure SDLC practices (NFR-01–NFR-16).

## 3. Recommended backend architecture

Use a modular monolith initially, with explicit domain boundaries. This is a recommended implementation choice, not a mandated SRS requirement. It keeps the MVP deployable as one API service while preserving seams for future extraction.

```text
Next.js web application
        |
        | HTTPS / versioned JSON API
        v
FastAPI application
  ├── API routers + request/response schemas
  ├── Authentication/session dependencies
  ├── Authorization + tenant-scope dependencies
  ├── Domain service layer
  ├── Repository / data-access layer
  ├── Audit + observability
  └── Integration adapters
        |
        ├── PostgreSQL
        ├── Private object storage
        ├── Background queue + workers
        ├── Email/notification provider
        └── Approved AI/search provider
```

### 3.1 Suggested source layout

```text
backend/
  app/
    main.py
    core/
      config.py
      logging.py
      errors.py
      security.py
      observability.py
    api/
      deps.py
      v1/
        router.py
        auth.py
        me.py
        preferences.py
        hr_assistant.py
        leave.py
        onboarding.py
        recruitment.py
        service_requests.py
        notifications.py
        reports.py
        career.py
        courses.py
        mock_tests.py
        resumes.py
        content.py
        admin.py
    domains/
      identity/
      organizations/
      policies/
      knowledge/
      service_requests/
      leave/
      onboarding/
      recruitment/
      reporting/
      career_content/
      assessments/
      resumes/
      notifications/
      administration/
      retention/
      audit/
    db/
      session.py
      base.py
      models/
      repositories/
      migrations/
    integrations/
      identity_provider/
      object_storage/
      email/
      sms/
      ai_provider/
      search_index/
    workers/
      reminders.py
      notifications.py
      document_scanning.py
      report_exports.py
      knowledge_indexing.py
      retention.py
    tests/
      unit/
      integration/
      api/
      security/
      contract/
  migrations/
  pyproject.toml
  alembic.ini
  .env.example
```

Keep HTTP concerns in routers, validation in Pydantic schemas and domain services, persistence in repositories, and vendor-specific logic behind integration adapters. Avoid embedding policy logic in route handlers or SQL models.

## 4. Technology and dependency decisions

### 4.1 Required by SRS
- Python with FastAPI.
- PostgreSQL.
- Migration tooling.
- Pydantic request/response schemas.
- Background queue/worker for reminders, email, document scanning, report exports, and AI indexing.
- Private object storage for uploaded documents and generated exports.
- CI/CD with automated tests, migrations, security scans, and rollback strategy.

### 4.2 Recommended, pending team approval
- SQLAlchemy 2.x or an equivalent reviewed PostgreSQL data-access layer.
- Alembic for database migrations.
- `pytest` and async-compatible test tooling.
- A vetted OIDC/OAuth2 identity provider rather than custom authentication where feasible.
- A queue/worker technology selected during architecture review; do not hard-code a vendor assumption into domain code.
- Structured JSON logging, metrics, tracing, and correlation IDs.
- A supported PostgreSQL driver and a connection pool sized from load tests.

Pin dependency versions, commit the lockfile, scan dependencies, and document upgrade procedures.

### 4.3 Suggested baseline libraries (recommended, not mandated by the SRS)

| Concern | Suggested choice | Notes |
|---|---|---|
| Web framework | FastAPI + Uvicorn/Gunicorn | Routers by domain, Pydantic v2 schemas. |
| ORM / SQL | SQLAlchemy 2.x async + `asyncpg` | Parameterized queries only; no raw string interpolation. |
| Migrations | Alembic | One migration per reviewed change; see §6.10. |
| Validation / settings | Pydantic v2, `pydantic-settings` | Fail fast on missing configuration in non-test environments. |
| Auth | OIDC/OAuth2 library maintained for FastAPI | Provider is an open SRS decision; wrap behind an adapter. |
| Logging | `structlog` or stdlib JSON formatter | Correlation ID, tenant ID, actor ID; no PII or secrets. |
| Metrics / traces | Prometheus/OpenTelemetry | RED metrics per route and dependency metrics per adapter. |
| Tests | `pytest`, `pytest-asyncio`, `httpx`, Testcontainers | Real PostgreSQL for repository, constraint, and RLS tests. |
| Quality | `ruff`, `mypy`, dependency and secret scanners | Enforced in CI. |

PostgreSQL extensions to evaluate during physical design:

| Extension | Use | Caveat |
|---|---|---|
| `btree_gist` | Exclusion constraint for leave overlap checks | Only for scalar equality columns combined with range types. |
| `citext` | Case-insensitive email uniqueness | Keep the original casing for display. |
| `pg_trgm` | Public content title/body fuzzy search | Complements, does not replace, the approved search index. |
| `pgcrypto` | `gen_random_uuid()` on older PostgreSQL versions | PostgreSQL 13+ provides it natively. |
| `vector` (pgvector) | Possible embedding store | Only if approved after AI-provider/data-residency review. |
| `pg_partman` | Automated partition maintenance | Optional; plain scheduled DDL is acceptable for MVP. |

Extensions are deployment dependencies and require a reviewed migration, least-privilege permissions, and a restore test.

## 5. Authentication, authorization, and tenant isolation

### 5.1 Identity and sessions
- Prefer a vetted OIDC/OAuth2 identity provider, as specified in the SRS security controls.
- Use secure, `HttpOnly`, `SameSite` cookies for browser sessions where cookie-based auth is selected.
- Protect cookie-authenticated mutations against CSRF.
- Define session expiry, revocation, recovery, privileged-role MFA, and account provisioning before production.
- Never use email as the only immutable identity key; map the identity provider subject to an internal user ID.

### 5.2 Authorization model
Use deny-by-default, permission-based authorization with scoped assignments. Role labels alone are not sufficient. Suggested permissions include `leave.request.create`, `leave.request.read_own`, `leave.request.decide`, `onboarding.task.update_assigned`, `recruitment.application.read_assigned`, `career_content.publish`, `report.export`, and `audit.read`.

For every endpoint, verify:
1. The authenticated principal is active.
2. The user has the required permission.
3. The target record belongs to the allowed tenant or public scope.
4. The requested action is valid for the record's current state.
5. The user is within any assignment/approval scope.

Never rely on hidden frontend controls. Test direct object-reference attacks by changing UUIDs in URLs, nested resources, file links, and export requests.

### 5.3 Tenant context
- Resolve tenant from the verified session and active membership.
- Reject unauthorized or ambiguous tenant selection.
- Pass tenant context explicitly into domain services and repository methods.
- Scope internal records and all background jobs by `tenant_id`.
- Consider PostgreSQL Row-Level Security as defense in depth; safely set tenant context per transaction and test it.
- Public career content must follow a distinct public authorization path. Do not accidentally place general public content under one company's tenant.
- A public career account must not gain employee permissions without a separate, audited onboarding and role-assignment process.

### 5.4 Principal types and account separation (FR-003)

Model three principal types explicitly; do not overload one account model for all audiences:

| Principal type | Issuer / session | Allowed scope | Token audience |
|---|---|---|---|
| `internal_member` | Company identity provider, membership-verified session | One active tenant membership at a time | `hr-api-internal` |
| `public_user` | Public identity provider or public account flow | Own resume profile, own test attempts, public content | `career-api-public` |
| `service` | Workload identity (workers, CI) | Explicit service permissions; no interactive routes | `hr-api-service` |

Rules:

- A `public_user` may not call internal tenant routes even if the email domain matches a tenant. Linkage to an employee account requires the separately authorized provisioning workflow in SRS FR-003.
- Internal sessions resolve `tenant_id` from the active `TenantMembership`; the client cannot select an arbitrary tenant by header or body.
- Public and internal sessions should use separate cookie names/audiences so a career login can never be replayed against HR APIs.
- Admin break-glass access, if introduced, must be time-boxed, MFA-protected, separately audited, and approved by security.

### 5.5 Permission catalogue (implementation of the SRS §8 capability matrix)

Role names are illustrative in the SRS; enforce atomic permission codes with scoped assignments. The following catalogue is a proposed starting point and requires product/security approval.

| Permission code | Capability | Typical default roles | Scope |
|---|---|---|---|
| `hr_assistant.query` | Ask tenant policy questions | Employee, HR Executive, Approver, Recruiter (if granted), Tenant Admin | Own tenant, authorized documents |
| `hr_assistant.feedback` | Rate/flag an answer | Same as `hr_assistant.query` | Own feedback only |
| `service_request.create` | Raise an HR service request | Employee, HR Executive | Own tenant |
| `service_request.read_own` | View own requests | Employee, HR Executive | Own records |
| `service_request.read_queue` | Work an assigned service queue | HR Executive | Assigned catalog items/departments |
| `service_request.update_assigned` | Update assigned request | HR Executive | Assigned requests |
| `leave.request.create` | Submit leave | Employee (when module enabled) | Own employee record |
| `leave.request.read_own` | View own leave | Employee | Own records |
| `leave.request.read_scope` | View team/tenant leave | Approver, HR Executive | Delegated scope |
| `leave.request.decide` | Approve/reject/clarify | Approver | Assigned approval scope |
| `leave.request.cancel_own` | Cancel own pending/approved request | Employee | Own records, allowed state |
| `leave.type.manage` | Configure leave types and rules | Tenant Admin / HR policy owner | Own tenant |
| `leave.balance.adjust` | Manual balance adjustment | HR Executive with explicit grant | Own tenant; audited |
| `onboarding.case.read` | View onboarding cases | Employee (own), HR Executive, Approver (assigned), Tenant Admin (config) | Own/assigned/tenant |
| `onboarding.case.create` | Create onboarding case | HR Executive | Own tenant |
| `onboarding.task.update_assigned` | Update assigned task | Employee, HR Executive, Approver | Assigned task only |
| `onboarding.template.manage` | Manage onboarding templates | HR Executive / Tenant Admin | Own tenant |
| `recruitment.requisition.manage` | Create/manage requisitions | Recruiter | Assigned department/vacancy |
| `recruitment.requisition.approve` | Approve requisition publication | Hiring manager/Approver | Assigned approvals |
| `recruitment.application.read_assigned` | View candidate/application | Recruiter, interviewers | Assigned vacancy only |
| `recruitment.application.create` | Add a candidate/application under an approved process | Recruiter | Assigned vacancy, privacy notice recorded |
| `recruitment.application.stage.update` | Move application stage | Recruiter | Assigned vacancy, valid transition |
| `recruitment.interview.schedule` | Schedule interviews | Recruiter, coordinator | Assigned vacancy |
| `recruitment.feedback.submit` | Submit interview feedback | Interviewer | Own assigned interview |
| `report.read` | View HR dashboards | HR Executive, Approver, Tenant Admin | Delegated/tenant scope |
| `report.export` | Export reports | HR Executive, Tenant Admin | Delegated/tenant scope, field allowlist |
| `career_content.edit` | Draft/edit public content | Content Editor | Assigned content domain |
| `career_content.review` | Review public content | Content Reviewer | Assigned content domain |
| `career_content.publish` | Publish/expire/archive | Content Reviewer / Tenant Admin if assigned | Assigned content domain |
| `course.manage` | Manage course catalogue | Content Editor/Reviewer | Assigned domains |
| `assessment.manage` | Manage mock tests and questions | Content Reviewer | Assigned domains |
| `assessment.attempt_own` | Take a mock test | Public user, any authenticated user | Own attempts |
| `resume.manage_own` | Create/edit own resume | Public user | Own profile |
| `content_report.create` | Report incorrect public content | Any authenticated or public user | Rate-limited |
| `content_report.triage` | Triage content reports | Content Editor/Reviewer | Assigned domains |
| `admin.membership.manage` | Invite/disable members, assign roles | Tenant Admin | Own tenant; cannot exceed own grants |
| `admin.settings.manage` | Organization settings, locale, timezone | Tenant Admin | Own tenant |
| `admin.workflow.manage` | Leave/approval/reminder/service-catalog configuration | Tenant Admin with HR policy approval | Own tenant; versioned |
| `notification.read_own` | View own notifications | All principals | Own records |
| `audit.read` | Review audit events | Security/Auditor, Tenant Admin (scoped) | Tenant/purpose limited |
| `retention.manage` | Configure/execute retention and deletion | Tenant Admin + compliance approver | Own tenant; legal-hold aware |
| `legal_hold.manage` | Apply/release legal hold | Compliance/Security role | Explicit grant only |

Implementation notes:

- Keep permission codes stable and versioned; do not derive authorization from job titles.
- Store role-to-permission mappings as data, not hard-coded `if role == "admin"` branches.
- Use `MembershipRole.scope` for coarse scope and dedicated assignment tables (for example `recruitment_assignment`, `approval_assignment`) where scope must be queried or enforced at row level.
- Cache effective permissions per session with a short TTL and invalidate on membership/role change; always re-check at request time.

### 5.6 Authorization enforcement pattern

Every protected route should compose an authentication dependency, a permission dependency, and an object-scope check in the service layer:

```python
# Pseudocode — the permission dependency resolves the active membership and capabilities.
@router.post("/leave/requests", response_model=LeaveRequestRead, status_code=201)
async def create_leave_request(
    payload: LeaveRequestCreate,
    principal: Principal = Depends(require_permission("leave.request.create")),
    service: LeaveService = Depends(get_leave_service),
) -> LeaveRequestRead:
    return await service.create(principal=principal, payload=payload)
```

Service-layer rules:

1. Reject inactive principals and expired/revoked sessions.
2. Reject if the required permission is absent.
3. Resolve `tenant_id` from the principal, never from the payload.
4. Load the target with `WHERE id = :id AND tenant_id = :tenant_id` and return `404` when not visible.
5. Re-check assignment/approval scope and current workflow state at the moment of mutation.
6. Write the state change and its audit event in one transaction; enqueue notifications via the transactional outbox.

Do not implement object authorization solely in routers or SQLAlchemy event hooks; centralize it in reusable policy helpers that can be unit tested.

## 6. Database design and data integrity

The SRS defines a logical model, not a final physical schema. Use UUID primary keys, UTC timestamps, foreign keys, explicit `tenant_id` on internal records, and soft deletion only where legally and operationally appropriate.

### 6.1 Main entity groups
- **Identity and access:** `Organization`, `User`, `TenantMembership`, `Role`, `Permission`, `RolePermission`, `MembershipRole`, `EmployeeProfile`.
- **Knowledge:** `PolicyDocument`, `KnowledgeChunk`, `HRQueryFeedback`.
- **Leave:** `LeaveType`, `LeaveRequest`, `LeaveDecision`.
- **Onboarding:** `OnboardingTemplate`, `OnboardingCase`, `OnboardingTask`.
- **Recruitment:** `Requisition`, `Candidate`, `Application`, `Interview`, `InterviewFeedback`.
- **Public learning:** `CareerContent`, `MockTest`, `Question`, `TestAttempt`, `AttemptAnswer`, `ResumeProfile`, `Course`, `ContentReport`.
- **Platform:** `Notification`, `AuditEvent`.

Refer to SRS section 11 for indicative attributes and relationships. Confirm final fields, data types, classifications, and retention with domain owners before migrations are approved.

### 6.2 Database controls
- Enforce foreign keys, unique constraints, check constraints, and valid status/date invariants in the database where practical.
- Index `tenant_id` alongside common lookup columns; index status and due dates for queues; evaluate full-text indexes for public content.
- Use transactions for multi-step state transitions and audit writes.
- Use optimistic version columns for concurrent updates to leave requests, applications, and content.
- Implement concurrency-safe leave overlap checks; consider exclusion constraints if the approved date/time semantics support them.
- Keep uploaded bytes in private object storage. Store opaque storage keys and metadata such as checksum, MIME type, size, scan status, and classification in PostgreSQL.
- Separate operational deletion from audit retention; exact rules require legal/compliance approval.
- Avoid storing secrets or unnecessary sensitive data in JSONB metadata.

### 6.3 Migration ownership and review
- Every schema change must be a reviewed migration committed to source control.
- Prefer expand-and-contract migrations for changes that need rolling deployment.
- Test migrations against a representative non-production dataset.
- Take and verify backups before risky production migrations.
- Document rollback/forward-fix strategy; do not assume every migration can be reversed safely.
- Run migrations through a controlled deployment step, not independently from every application replica.

### 6.4 Physical schema conventions (DBA baseline)

The SRS logical model leaves physical choices open. The following conventions should be ratified at architecture review and then applied consistently.

| Concern | Convention | Rationale |
|---|---|---|
| Naming | `snake_case`; plural table names (`leave_requests`); singular model class (`LeaveRequest`) | Predictable mapping to the SRS entity names; avoids quoting. |
| Reserved names | Use `users` or `app_user` instead of `user`; `organizations` for Organization/Tenant | `user` is reserved in PostgreSQL. |
| Primary keys | `uuid` generated by the application (UUIDv7 preferred) or `gen_random_uuid()` | SRS requires UUIDs; time-ordered UUIDs improve index locality. Do not expose sequential IDs. |
| Tenant key | One column named `tenant_id` referencing `organizations(id)` on every internal table, including child tables | Consistent joins, indexes, RLS predicates, and background-job filters. |
| Timestamps | `timestamptz` stored in UTC; `date` for calendar dates; `time` for partial-day boundaries | SRS requires UTC; tenant timezone/calendar logic belongs in the domain layer. |
| Business vs row time | Row `created_at`/`updated_at` separate from business timestamps (`submitted_at`, `decided_at`, `published_at`) | Auditing and reporting need both. |
| Money | `numeric(14,2)` plus ISO-4217 `char(3)` currency | Never use floating point for salary guidance or adjustments. |
| Status values | `text` + `CHECK` for stable workflow codes; lookup table for tenant-configurable values | Prevents invalid states while keeping migrations simple. |
| JSONB | Only for configuration, `settings`, form schemas, scoring rules, and minimized metadata; validate shape in the application | JSONB is not a substitute for relational constraints; never store secrets. |
| Text | `text` for names/content; `citext` (or a normalized unique index on `lower(email)`) for email | Preserves multilingual/Devanagari content and original name spelling. |
| Audit columns | `created_at`, `updated_at`, `created_by`, `updated_by`, `version integer NOT NULL DEFAULT 1` | Supports traceability and optimistic concurrency. |
| Soft deletion | `deleted_at timestamptz` only where retention policy permits; partial unique indexes `WHERE deleted_at IS NULL` | Hard deletion is required for some privacy requests; audit rows must not be soft-deleted away. |
| Foreign keys | `ON DELETE RESTRICT` by default; `CASCADE` only for owned draft children; `SET NULL` for optional actor references | Protects HR records from accidental loss. |
| Constraint names | `pk_`, `fk_`, `uq_`, `ck_`, `ix_` prefixes with table and column names | Operational clarity for migrations and incident response. |
| Collation / Unicode | Store normalized (NFC) text; use deterministic collation where uniqueness matters; do not rely on database case-folding for Hindi | Mixed Latin/Devanagari content must round-trip safely. |
| Sensitive columns | Separate highly sensitive fields into restricted tables or encrypted columns; never in JSONB blobs | Field-level access and crypto-shredding are easier to enforce. |

### 6.5 Entities required to implement the SRS (gap resolution)

SRS §11 is a logical model. Several requirements cannot be implemented safely without supporting entities. The following are **proposed additions**, not SRS-mandated names; each requires data-owner approval before migration.

| Proposed entity | SRS driver | Purpose and key constraints |
|---|---|---|
| `user_sessions` | FR-001, NFR-04 | Server-side session/refresh record where the identity provider does not manage revocation: `user_id`, `idp_session_id`, `expires_at`, `revoked_at`, `ip_hash`, `user_agent_hash`. |
| `leave_balances` | FR-010 | Per employee/leave type/period: `entitled`, `consumed`, `pending`, `carried_forward`, `version`; `UNIQUE (tenant_id, employee_id, leave_type_id, period_start, period_end)`. |
| `leave_ledger` | FR-010, FR-011 | Append-only reservation/consumption/reversal entries linked to request/decision; supports audit and recalculation. |
| `holiday_calendars`, `holidays` | FR-010 | Tenant/location calendar and dates; drives working-day and balance calculations. |
| `approval_rules`, `approval_rule_steps` | FR-011, FR-021 | Configure approver resolution (manager, role, named user), ordering, delegation, escalation; versioned and effective-dated. |
| `service_catalog_items` | FR-008 | Tenant-configurable HR request types with SLA, form schema, required fields, and queue assignment. |
| `hr_service_requests`, `hr_service_request_comments`, `hr_service_request_attachments` | FR-008 | Requester, assignee, priority, status, SLA due time, visibility of comments; audit and notifications. |
| `onboarding_template_tasks` | FR-013 | Template task definitions with owner rule, due-date offset, required evidence, and applicability rules. |
| `requisition_approvals` | FR-016 | Approval steps/outcomes for publication; approval state is not inferred from `approved_at` alone. |
| `privacy_notice_versions` | FR-019, NFR-05 | Versioned candidate/public privacy notice text and effective dates. |
| `candidate_consents` | FR-019 | Notice version, lawful basis, consent timestamp, source/channel, withdrawal timestamp; no consent inferred from application alone. |
| `application_stage_history` | FR-017, FR-029 | From/to stage, actor, reason, timestamp; makes pipeline changes auditable without parsing JSONB. |
| `interview_participants` | FR-018 | Interviewer, role, response status, conflict-of-interest flag. |
| `reminder_rules`, `reminder_instances` | FR-021, FR-012 | Rule configuration (offset, repeat, escalation, recipients) and per-target instances with a dedupe key to prevent duplicate sends. |
| `notification_templates`, `notification_preferences` | FR-012, FR-004 | Localized template versions, channel allowlist, and per-user preferences; template review status. |
| `documents` | FR-015 | Shared attachment/evidence metadata: owner type/id, storage key, checksum, MIME, size, scan status, classification, retention class. |
| `idempotency_keys` | FR-034 | Scoped key, request hash, in-progress/completed state, stored response, resource reference, expiry (see §6.9). |
| `content_versions`, `content_reviews` | FR-028 | Immutable career-content versions and reviewer decisions; publication points at a specific approved version. |
| `report_exports` | FR-020 | Async export job, filter hash, requested fields, file reference, expiry, requester, status. |
| `retention_policies`, `legal_holds`, `deletion_requests` | FR-031 | Retention clocks by entity/classification, hold scope, deletion/DSAR workflow state and evidence. |
| `hr_query_logs`, `hr_query_citations` | FR-005, FR-006, NFR-06 | Safe AI telemetry: answer status, model/version, source document/version IDs, latency; raw prompt optional/redacted per policy. |
| `outbox_events` | NFR-09 | Transactional outbox for notifications, indexing, exports, and retention jobs; avoids dual-write loss. |
| `knowledge_ingestion_jobs` | FR-005, §14 | Per policy version parse/chunk/embed status, failure reason, retry count, index generation. |
| `assessment_attempt_events` | FR-025, NFR-09 | Optional autosave/resume/abandon events if the approved attempt-resume design requires them. |

Additional DBA rules:

- Prefer normalized tables for anything queried, constrained, or reported; reserve JSONB for tenant configuration and provider payloads.
- Do not store raw identity-provider tokens in the database unless required and approved; if stored, encrypt and restrict access.
- Keep policy binaries and generated exports in private object storage; the database stores metadata and an opaque key only.
- Define a data-classification tag (`public`, `internal`, `confidential`, `restricted`) on documents, exports, and sensitive columns to drive retention and access policies.

### 6.6 Constraints and index catalogue

Index for access paths, not for every column. At minimum:

| Table | Constraint / index | Purpose |
|---|---|---|
| `tenant_memberships` | `UNIQUE (tenant_id, user_id)`; index `(user_id, status)` | One membership per user per tenant; fast session lookup. |
| `membership_roles` | `PRIMARY KEY (membership_id, role_id)`; index `role_id` | Role assignment integrity. |
| `employee_profiles` | `UNIQUE (tenant_id, employee_number)`; index `(tenant_id, department_id)`, `(tenant_id, manager_employee_id)` | Employee lookup and reporting. |
| `policy_documents` | `UNIQUE (tenant_id, title, version, locale)`; index `(tenant_id, status, effective_from)` | Prevent duplicate versions; retrieval eligibility. |
| `knowledge_chunks` | `UNIQUE (policy_document_id, chunk_index)`; index `(policy_document_id)` | Deterministic chunking and reindex. |
| `leave_requests` | index `(tenant_id, employee_id, start_at DESC)`; index `(tenant_id, status, start_at)` for approver queues | Own history and pending inbox. |
| `leave_requests` | exclusion constraint (below) where policy forbids overlap | Concurrency-safe overlap prevention. |
| `leave_balances` | unique per employee/type/period; `CHECK (consumed >= 0 AND pending >= 0)` | Balance integrity. |
| `hr_service_requests` | index `(tenant_id, status, sla_due_at)`, `(tenant_id, assignee_user_id, status)` | Queue and SLA monitoring. |
| `onboarding_tasks` | index `(tenant_id, owner_user_id, status, due_at)`, `(case_id)` | Task inbox and case progress. |
| `applications` | `UNIQUE (tenant_id, requisition_id, candidate_id)` where not withdrawn; index `(tenant_id, requisition_id, stage)` | Pipeline integrity and board queries. |
| `interviews` | index `(tenant_id, scheduled_at)`, `(application_id)` | Scheduling and calendar views. |
| `career_content` | index `(content_type, locale, status, published_at DESC)`; trigram index on `title`/`body` if approved | Public listing, locale filtering, search. |
| `mock_tests` / `questions` | index `(test_id, position)`; `UNIQUE (test_id, position)` | Stable ordering. |
| `test_attempts` | index `(user_id, started_at DESC)`; partial unique index for one `in_progress` attempt per test/user if required | Attempt history and duplicate prevention. |
| `attempt_answers` | `UNIQUE (attempt_id, question_id)` | One answer per question per attempt. |
| `notifications` | index `(recipient_user_id, status, scheduled_at)`; `UNIQUE (tenant_id, dedupe_key)` for internal rows (partial unique for public/null tenant) | Delivery queue and duplicate suppression. |
| `audit_events` | index `(tenant_id, occurred_at DESC)`, `(target_type, target_id)`, `(actor_user_id, occurred_at DESC)` | Investigation and entity history. |
| `idempotency_keys` | `UNIQUE (scope_key, user_id, endpoint, key)`; index `expires_at` | Retry safety (tenant and public scopes) and cleanup. |

Example concurrency-safe leave overlap constraint (only if the approved policy forbids overlapping requests):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE leave_requests
  ADD CONSTRAINT ck_leave_requests_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status IN ('pending', 'approved'));
```

Caveats: the predicate must match the implemented state machine; partial-day semantics must be represented by precise `start_at`/`end_at` values; `[)` permits back-to-back requests; cancelled/rejected rows are excluded. Verify the constraint behaves correctly for timezone/DST transitions using `timestamptz`.

Use `CHECK` constraints for date/status invariants, for example `CHECK (end_at > start_at)`, `CHECK (score >= 0 AND score <= max_score)`, and status allowlists. Validate the same rules in Pydantic/services so users receive actionable errors rather than raw constraint violations.

### 6.7 Row-Level Security (defense in depth)

RLS is recommended by SRS NFR-03 but is **not** a replacement for application authorization tests. If adopted:

```sql
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON leave_requests
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

Operational rules:

- Set `app.tenant_id` with `SET LOCAL` inside the request/worker transaction, immediately after beginning it; never rely on a session-level setting with a shared connection pool.
- Use a least-privilege application role that does not own the tables and does not have `BYPASSRLS`.
- Keep a separate migration/operations role for DDL and controlled maintenance; never use it for application traffic.
- Public content tables either live outside tenant RLS or use a dedicated policy exposing only `status = 'published'` and valid dates; keep private and public authorization paths distinct.
- Test RLS with cross-tenant IDs, nested resources, joins, aggregate reports, exports, and background jobs. A query that forgets `tenant_id` should fail closed under RLS.
- Document the performance cost of policy predicates and index `tenant_id` on every RLS-protected table.

### 6.8 Partitioning, retention, and storage lifecycle

Proposed physical retention design — **all periods require legal/compliance approval** (SRS A-12, FR-031):

| Data | Proposed treatment | Mechanism |
|---|---|---|
| `audit_events` | Monthly range partitions; retain per approved audit schedule; legal hold blocks partition drop | Declarative partitioning, `occurred_at`; optional WORM export to immutable storage |
| `notifications` | Monthly partitions or periodic purge after delivery + short operational window | Worker-driven delete by `created_at`; never log message bodies |
| `hr_query_logs` | Short retention (for example 90 days) with minimized content | Scheduled purge; aggregate metrics retained longer without personal data |
| `test_attempts` / `attempt_answers` | Retain per product/privacy policy; support user deletion | Cascade delete by owner where lawful; anonymize aggregate scoring data |
| Candidate records | Purge/anonymize after `retention_until` unless legal hold applies | Retention job with per-record evidence |
| Documents/exports | Object-storage lifecycle aligned with database metadata | Signed URLs expire; objects deleted by lifecycle rule and deletion job |
| Deleted employee data | Anonymize where referential integrity must remain; hard-delete where required | Deletion workflow + audit evidence; no silent cascade |

Retention job requirements: idempotent batches, dry-run mode, per-tenant scoping, legal-hold check before every delete, low batch sizes to avoid lock contention, metrics for deleted/blocked/failed counts, and an immutable record of what was deleted and why.

Partitioning caveat: a partitioned `audit_events` table cannot have a primary key on `id` alone when the partition key is `occurred_at`. Use a composite primary key such as `(id, occurred_at)` (and include it in foreign references, if any) or a per-partition unique index plus a non-unique global `id`. Confirm query plans and retention/partition-drop behavior before adopting partitioning.

### 6.9 Concurrency, idempotency, and transactional messaging

**Idempotency (FR-034).** Persist keys and outcomes atomically with the operation:

```sql
CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY,
  scope_key text NOT NULL,              -- 'tenant:<uuid>' or 'public'
  tenant_id uuid REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  endpoint text NOT NULL,
  key text NOT NULL,
  request_hash bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  response_status smallint,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (scope_key, user_id, endpoint, key)
);
```

Use `scope_key` rather than a nullable `tenant_id` in the uniqueness rule so public-user submissions (mock-test submit, resume operations) cannot collide with tenant-scoped keys. Tenant-scoped rows must still carry `tenant_id` for RLS/indexing; public rows leave it null and are authorized by the public principal.

Flow:

1. Require `Idempotency-Key` on leave submission, service-request creation, mock-test submit, export creation, and other critical submissions.
2. Attempt the key insert in the same transaction as the business write; a duplicate key with the same request hash returns the stored outcome, and a different hash returns `409 idempotency_conflict`.
3. If the first request is still `in_progress`, return `409` or `425` with a retry hint rather than starting a second operation.
4. Expire keys only after the documented replay window (for example 24 hours); cleanup is a background job.

**Optimistic concurrency.** Use `version` + `If-Match`/ETag for leave requests, applications, onboarding tasks, content, and configuration. Reject stale updates with `409 stale_version` and return the current representation for review.

**Decision atomicity.** For approvals, lock the target row (`SELECT ... FOR UPDATE`), re-check state and approver authorization, write the decision, update the parent status, append the audit event, and enqueue the notification outbox record in one transaction. Never rely on the approval screen's stale view.

**Transactional outbox.** Write `outbox_events` in the same transaction as the state change; a relay publishes to the queue. This prevents "committed but never notified" failures and allows idempotent consumers.

**Worker safety.** Use advisory locks or `FOR UPDATE SKIP LOCKED` for queue claims, a visibility timeout/lease, retry with exponential backoff, and a dead-letter table. Every job must be idempotent by a business dedupe key.

### 6.10 Migration and deployment safety (expanded)

- One reviewed, forward-only migration per change; commit both schema and data backfills separately.
- Use expand-and-contract for column/table changes: add nullable → backfill in batches → switch reads/writes → enforce constraint → remove old column in a later release.
- Create large indexes with `CREATE INDEX CONCURRENTLY` outside a transaction; set `lock_timeout` and `statement_timeout` for migration sessions.
- Avoid long-held locks and table rewrites during business hours; measure row counts and plan maintenance windows.
- Backfills must be batched, restartable, idempotent, and rate-limited; record progress in a migration ledger.
- Take a verified backup/snapshot before destructive or high-risk migrations; test restore, not only backup creation.
- Run migrations once through a controlled deployment job, not from every application replica.
- Seed reference data (permissions, role definitions, statuses, notification template defaults) through idempotent migrations, not ad-hoc scripts.
- Document a rollback or forward-fix plan per migration; some data changes cannot be safely reversed.
- Verify post-deploy invariants (counts, constraints, RLS policies, indexes) with automated checks.

## 7. API conventions

The SRS proposes `/api/v1/...` paths. Treat the catalogue as indicative until API review is complete.

### 7.1 Proposed endpoint catalogue

The SRS catalogue is indicative. The table below keeps the SRS routes and marks necessary additions as **(proposed)**. Every route requires a schema, permission, tenant/public scope, validation, rate-limit decision, audit rule, and tests.

**Identity, session, and preferences**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| POST | `/api/v1/auth/session` or identity callback | Establish session via the approved identity provider | None (public endpoint, rate-limited) |
| DELETE | `/api/v1/auth/session` **(proposed)** | Sign out and revoke the server-side session | Authenticated |
| GET | `/api/v1/me` | Current user, locale, active tenant, memberships, capabilities | Authenticated |
| GET/PUT | `/api/v1/preferences/locale` | Read/update language preference (`en`, `hi`) | Authenticated |
| GET | `/api/v1/me/notifications` **(proposed)** | Own in-app notification feed | `notification.read_own` |
| PATCH | `/api/v1/me/notifications/{id}` **(proposed)** | Mark read/acknowledged | `notification.read_own` |
| GET/PUT | `/api/v1/me/notification-preferences` **(proposed)** | Channel preferences | `notification.read_own` |

**HR knowledge assistant**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| POST | `/api/v1/hr-assistant/queries` | Ask a tenant policy question; returns answer, citations, `answer_status`, fallback route | `hr_assistant.query` |
| POST | `/api/v1/hr-assistant/feedback` | Rate/flag an answer or cite outdated content | `hr_assistant.feedback` |

**HR service requests (FR-008)**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| GET | `/api/v1/service-catalog` **(proposed)** | Request types/forms available to the user | `service_request.create` |
| GET/POST | `/api/v1/service-requests` **(proposed)** | List own/assigned requests; create request | `service_request.read_own` / `service_request.create` |
| GET/PATCH | `/api/v1/service-requests/{id}` **(proposed)** | View/update permitted request | `service_request.read_own` or `service_request.update_assigned` |
| POST | `/api/v1/service-requests/{id}/comments` **(proposed)** | Add requester-visible or internal comment | `service_request.read_own` / `service_request.update_assigned` |
| POST | `/api/v1/service-requests/{id}/attachments` **(proposed)** | Register an authorized upload | `service_request.create` / `service_request.update_assigned` |

**Leave**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| GET | `/api/v1/leave/types` **(proposed)** | Tenant leave types and form rules | `leave.request.create` |
| GET | `/api/v1/leave/balances` **(proposed)** | Own/applicable balances | `leave.request.read_own` |
| GET | `/api/v1/leave/calendar` **(proposed)** | Tenant holidays/working days | `leave.request.create` |
| GET/POST | `/api/v1/leave/requests` | List permitted requests / create request | `leave.request.read_own` / `leave.request.create` |
| GET/PATCH | `/api/v1/leave/requests/{id}` | View or permitted update/cancel | `leave.request.read_own` / `leave.request.cancel_own` |
| POST | `/api/v1/leave/requests/{id}/decision` | Approve/reject/request clarification | `leave.request.decide` |
| POST | `/api/v1/leave/requests/{id}/cancel` **(proposed)** | Explicit, policy-controlled cancellation | `leave.request.cancel_own` or `leave.request.decide` |

**Onboarding**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| GET/POST | `/api/v1/onboarding/cases` | List/create cases | `onboarding.case.read` / `onboarding.case.create` |
| GET/PATCH | `/api/v1/onboarding/cases/{id}` **(proposed)** | Case detail/progress/closure | `onboarding.case.read` |
| GET/PATCH | `/api/v1/onboarding/tasks/{id}` | Read/update assigned task | `onboarding.task.update_assigned` |
| POST | `/api/v1/onboarding/tasks/{id}/evidence` **(proposed)** | Attach evidence/document | `onboarding.task.update_assigned` |
| GET/POST | `/api/v1/onboarding/templates` **(proposed)** | Manage reusable templates | `onboarding.template.manage` |
| GET/PATCH | `/api/v1/onboarding/templates/{id}` **(proposed)** | Template detail/versioning | `onboarding.template.manage` |

**Recruitment**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| GET/POST | `/api/v1/recruitment/requisitions` | List/create requisitions | `recruitment.requisition.manage` |
| GET/PATCH | `/api/v1/recruitment/requisitions/{id}` **(proposed)** | Requisition detail/update | `recruitment.requisition.manage` |
| POST | `/api/v1/recruitment/requisitions/{id}/approval` **(proposed)** | Approve/reject publication | `recruitment.requisition.approve` |
| GET/POST | `/api/v1/recruitment/applications` **(proposed)** | List scoped applications; `POST` adds a candidate/application under an approved process | `recruitment.application.read_assigned` / `recruitment.application.create` |
| GET/PATCH | `/api/v1/recruitment/applications/{id}` | View/change permitted stage | `recruitment.application.read_assigned` / `recruitment.application.stage.update` |
| POST | `/api/v1/recruitment/interviews` | Create interview | `recruitment.interview.schedule` |
| PATCH | `/api/v1/recruitment/interviews/{id}` **(proposed)** | Reschedule/cancel/complete | `recruitment.interview.schedule` |
| POST | `/api/v1/recruitment/interviews/{id}/feedback` **(proposed)** | Submit structured feedback | `recruitment.feedback.submit` |
| GET | `/api/v1/recruitment/candidates/{id}` **(proposed)** | Scoped candidate detail | `recruitment.application.read_assigned` |

**Reports, exports, and audit**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| GET | `/api/v1/reports/hr/summary` | Tenant-scoped operational summary | `report.read` |
| POST | `/api/v1/reports/hr/exports` **(proposed)** | Request an async export | `report.export` |
| GET | `/api/v1/reports/exports/{id}` **(proposed)** | Export status and short-lived download link | `report.export` |
| GET | `/api/v1/admin/audit-events` | Authorized, filtered audit review | `audit.read` |

**Public career, courses, assessments, resume, feedback**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| GET | `/api/v1/career/content` | Public, published career content | Public |
| GET | `/api/v1/career/content/{id}` **(proposed)** | Published job/salary/exam detail | Public |
| GET | `/api/v1/career/exams/{id}` | Published exam guide | Public |
| GET | `/api/v1/courses` | Course catalogue | Public |
| GET | `/api/v1/courses/{id}` **(proposed)** | Course detail | Public |
| POST | `/api/v1/content-reports` | Flag public content for review | Public/authenticated, rate-limited |
| GET | `/api/v1/mock-tests` **(proposed)** | Published test listing | Public |
| POST | `/api/v1/mock-tests/{id}/attempts` | Start an eligible attempt | `assessment.attempt_own` |
| GET | `/api/v1/mock-test-attempts/{id}` **(proposed)** | Attempt state/questions (answer-key safe) | Owner |
| PATCH | `/api/v1/mock-test-attempts/{id}` **(proposed)** | Autosave answers/remaining state | Owner |
| POST | `/api/v1/mock-test-attempts/{id}/submit` | Submit and compute score server-side | Owner |
| GET | `/api/v1/mock-test-attempts/{id}/review` **(proposed)** | Score, explanations after allowed conditions | Owner |
| GET/POST | `/api/v1/resume-profiles` | Read/create own resume profile | `resume.manage_own` |
| PATCH | `/api/v1/resume-profiles/{id}` **(proposed)** | Update own profile | `resume.manage_own` |
| POST | `/api/v1/resume-profiles/{id}/export` **(proposed, format open)** | Generate export after format/privacy approval | `resume.manage_own` |

**Administration and content governance**

| Method | Endpoint | Purpose | Minimum permission |
|---|---|---|---|
| GET/POST | `/api/v1/admin/memberships` **(proposed)** | List/invite organization members | `admin.membership.manage` |
| PATCH | `/api/v1/admin/memberships/{id}` **(proposed)** | Enable/disable membership | `admin.membership.manage` |
| PUT | `/api/v1/admin/memberships/{id}/roles` **(proposed)** | Assign scoped roles | `admin.membership.manage` |
| GET | `/api/v1/admin/roles` **(proposed)** | Role/permission catalogue | `admin.membership.manage` |
| GET/PATCH | `/api/v1/admin/settings` **(proposed)** | Organization locale/timezone/settings | `admin.settings.manage` |
| GET/POST | `/api/v1/admin/leave-types` **(proposed)** | List/create leave configuration; `PATCH /{id}` to update | `leave.type.manage` |
| GET/POST | `/api/v1/admin/approval-rules` **(proposed)** | List/create approval chains; `PATCH /{id}` to version/update | `admin.workflow.manage` |
| GET/POST | `/api/v1/admin/reminder-rules` **(proposed)** | List/create reminder/escalation rules; `PATCH /{id}` to update | `admin.workflow.manage` |
| GET/POST | `/api/v1/admin/service-catalog` **(proposed)** | List/create request definitions; `PATCH /{id}` to update | `admin.workflow.manage` |
| GET/POST | `/api/v1/admin/content` **(proposed)** | Career content editorial CRUD; `PATCH /{id}` for drafts | `career_content.edit` |
| POST | `/api/v1/admin/content/{id}/submit-review` **(proposed)** | Submit draft for review | `career_content.edit` |
| POST | `/api/v1/admin/content/{id}/review` **(proposed)** | Record review decision | `career_content.review` |
| POST | `/api/v1/admin/content/{id}/publish` **(proposed)** | Publish approved version | `career_content.publish` |
| POST | `/api/v1/admin/content/{id}/archive` **(proposed)** | Expire/archive content | `career_content.publish` |
| GET | `/api/v1/admin/content-reports` **(proposed)** | Triage queue for user-reported content | `content_report.triage` |
| GET/PATCH | `/api/v1/admin/content-reports/{id}` **(proposed)** | Triage user-reported content | `content_report.triage` |
| GET/POST | `/api/v1/admin/deletion-requests` **(proposed)** | Retention/DSAR deletion workflow | `retention.manage` |

Operational endpoints (`/healthz`, `/readyz`, `/metrics`) should be exposed on a separate internal listener or protected network path, not as versioned business APIs.

### 7.2 API rules
- Publish OpenAPI documentation with request/response schemas, error codes, and permission expectations.
- Use consistent pagination, filtering, sorting, and field-selection rules; whitelist sortable/filterable fields.
- Validate request shape, sizes, enums, and domain invariants with Pydantic and service-layer checks.
- Use standard HTTP status codes and a consistent error envelope. Never return stack traces or internal provider details.
- Add request/correlation IDs to responses and logs.
- Apply rate limits to login/recovery, AI queries, content reporting, exports, and test submissions.
- For critical submission endpoints, support an `Idempotency-Key` or equivalent deduplication strategy. Persist the key and outcome atomically with the operation.
- Use optimistic concurrency (`version` or ETag/If-Match) where simultaneous edits can conflict.
- Do not accept `tenant_id`, `actor_id`, `approved_by`, or other trusted fields as authority from the client.

### 7.3 Error envelope and code catalogue (FR-033)

Use one error shape across all endpoints:

```json
{
  "error": {
    "code": "leave_overlap",
    "message_key": "leave.errors.overlap",
    "message": "The selected dates overlap an existing leave request.",
    "details": [
      {"field": "start_at", "code": "overlap", "message_key": "leave.errors.overlap_field"}
    ],
    "request_id": "01J...",
    "retryable": false
  }
}
```

| HTTP | Stable code examples | Client expectation |
|---|---|---|
| 400 | `invalid_request`, `unsupported_locale` | Fix request shape/parameters. |
| 401 | `unauthenticated`, `session_expired` | Re-authenticate; preserve return path. |
| 403 | `forbidden`, `mfa_required`, `tenant_required` | Show access-denied or step-up flow. |
| 404 | `not_found` | Do not reveal existence of unauthorized records. |
| 409 | `conflict`, `stale_version`, `idempotency_conflict`, `invalid_state_transition`, `already_decided` | Refresh and review; never silently overwrite. |
| 422 | `validation_error`, `business_rule_violation` | Map `details[].field` to form controls. |
| 425 | `operation_in_progress` | Retry after the indicated delay. |
| 429 | `rate_limited` | Respect `Retry-After`. |
| 503 | `provider_unavailable`, `ai_unavailable` | Show graceful fallback; retry only where safe. |
| 500 | `internal_error` | Correlate via `request_id`; never expose stack traces. |

Rules:

- Stable machine `code` values are part of the API contract; human-readable `message` is localized server-side only for notifications/emails. UI text normally comes from `message_key`.
- Validation errors must identify the field path and must not echo secrets or full sensitive values.
- Rate-limit responses include `Retry-After`; authentication failures avoid account-enumeration differences.
- Log the internal cause with the request/correlation ID, not in the response body.

### 7.4 Pagination, filtering, and sorting

- Use cursor pagination for high-volume/append-only collections (audit events, notifications, content); offset pagination is acceptable for small admin lists.
- Whitelist sortable and filterable fields per endpoint; reject unknown parameters with `422`.
- Bound page size (for example default 20, max 100) and export row limits; large exports are asynchronous.
- Return `next_cursor` (opaque, signed or server-encoded) rather than allowing arbitrary query expressions.
- Apply tenant and permission filters before aggregation; totals must not leak counts outside scope.

### 7.5 Idempotency and concurrency contract

| Endpoint class | Idempotency-Key | Concurrency control |
|---|---|---|
| Leave submit, service-request create, onboarding case create | Required | Duplicate detection + business uniqueness |
| Leave decision, requisition approval, content review/publish | Recommended | `If-Match`/`version` + row lock |
| Mock-test submit | Required | Attempt state + unique scoring guard |
| Export creation | Required | Filter hash + per-user job limit |
| Simple reads | Not required | ETag/`Cache-Control` where appropriate |

Replays with the same key and identical payload return the original status/body (or a safe representation); the same key with a different payload returns `409 idempotency_conflict`. Persist the outcome atomically with the operation, as described in §6.9.

### 7.6 Caching, locale, and headers

- Private HR responses: `Cache-Control: no-store` and no shared CDN caching. Public published content may use explicit short TTLs and revalidation.
- Send `X-Request-Id`/correlation ID on every response; accept a client request ID only as a correlation hint, never as authority.
- Negotiate locale from the authenticated preference, then `Accept-Language`, then tenant `default_locale`, then `en`; return `Content-Language`.
- Represent dates/times as ISO 8601 UTC (`Z`) and include the tenant timezone where formatting matters; do not send preformatted locale strings as the only representation.
- Return stable status/role/permission codes; the frontend owns localized labels.
- Security headers and CORS are deployment concerns but must be verified at the API edge; no wildcard credentialed CORS.

### 7.7 OpenAPI and contract governance

- Generate and publish OpenAPI 3.x for every version; include permission requirements, error codes, idempotency, and rate-limit notes in operation descriptions.
- Treat breaking changes as a new API version or an expand-and-contract migration with a deprecation window.
- Generate TypeScript clients/types for the frontend from OpenAPI where feasible; run contract tests in CI to detect drift.
- Document webhook/callback signatures and replay protection if provider callbacks are introduced.

## 8. Domain implementation notes

### 8.1 HR knowledge assistant
1. Authenticate user and resolve tenant, locale, and permissions.
2. Validate question size, input shape, and rate limits.
3. Retrieve only approved, current policy sources authorized for the user and tenant.
4. Apply retrieval authorization **before** calling the model. Treat user prompts and retrieved documents as untrusted data.
5. Generate an answer grounded in retrieved passages and return source title/version/section citations where available.
6. If sources are absent, conflicting, stale, or low confidence, clearly state uncertainty and offer an HR support route; never fabricate policy.
7. Record minimal safe telemetry: request ID, source IDs, feedback, model/version metadata, outcome. Avoid unnecessary retention of raw sensitive prompts.
8. Keep provider calls behind an adapter so model/provider changes do not affect domain logic.
9. Reindex when approved policy versions or access classifications change. Retire superseded content from retrieval.
10. Evaluate English and Hindi answers, missing evidence, conflicting policies, prompt injection, and cross-tenant leakage before release.

**AI restrictions:** AI is assistive only. It must not autonomously rank or reject candidates, or make hiring, promotion, termination, disciplinary, or compensation decisions in the MVP.

**Retrieval ingestion pipeline (SRS §14):**

1. Validate the uploaded policy document's MIME type/size, scan it, and store bytes privately.
2. Parse and normalize text; record page/section anchors for citations.
3. Chunk with deterministic boundaries and stable `chunk_index`; store the source document version and access classification on every chunk.
4. Generate embeddings/search index entries asynchronously; record the index generation and model version.
5. Atomically publish the new version and retire superseded chunks from retrieval only after indexing succeeds.
6. Support reindexing when a version, classification, or embedding model changes; keep ingestion jobs retryable and idempotent.

**Citation and answer contract:**

```json
{
  "request_id": "01J...",
  "answer": "...",
  "answer_status": "grounded",
  "citations": [
    {
      "document_id": "uuid",
      "title": "Leave Policy",
      "version": "3",
      "locale": "en",
      "section": "4.2",
      "effective_from": "2026-04-01",
      "url": "/api/v1/policies/uuid/download"
    }
  ],
  "fallback": null,
  "model": {"name": "...", "version": "..."}
}
```

`answer_status` values: `grounded`, `insufficient_evidence`, `conflicting_sources`, `stale_source`, `unauthorized_source`, `provider_unavailable`. Citations must reference only documents the user was authorized to retrieve at query time; never return a citation the user cannot access. Store citation IDs, answer status, latency, model/version, and feedback in telemetry; store raw prompt text only if an approved, minimized retention policy explicitly allows it.

### 8.2 Leave workflow
- Treat backend validation as authoritative; frontend validation is for usability only.
- Validate employee status, leave type, date range, partial-day rules, required fields, overlaps, configured balance, tenant calendar, and approval policy.
- Create the request, initial state, and audit event transactionally.
- Resolve approver from configured rules and record actor, timestamp, decision, and permitted comment.
- Recheck approver authorization and request state at decision time to avoid stale-screen decisions.
- Prevent duplicate submissions with idempotency and appropriate uniqueness/concurrency controls.
- Notify employee/approver asynchronously after the transaction commits.
- Model cancellation/modification as explicit, policy-controlled state transitions.
- Leave rules, accruals, holidays, balance calculations, and approval hierarchy remain tenant-configurable and require HR approval.

### 8.3 Onboarding
- Create cases only for the correct tenant and authorized HR users.
- Instantiate tasks from approved templates and rules such as role, department, location, and start date.
- Limit each task owner to permitted tasks; track due date, status, completion time, and required evidence.
- Store documents privately and provide authorized, time-limited access.
- Run reminders/escalations in background workers with retries and duplicate-send protection.
- Keep task status transitions explicit; support the SRS statuses: Not Started, In Progress, Blocked, Completed, Waived.

### 8.4 Recruitment
- Requisition publication must follow configured approval rules.
- Restrict candidate data by tenant, assigned vacancy, and permission.
- Record privacy notice version and applicable consent/lawful-basis metadata as approved by legal/privacy owners.
- Validate candidate/application stage transitions and audit them.
- Schedule interviews and send configured notifications.
- Human decision-makers record outcomes; do not implement autonomous AI ranking or rejection.
- Apply approved retention, archive, deletion, and access-request processes.

### 8.5 Public career content
- Public endpoints expose only content in the Published state and within its validity window.
- Store source/provider, checked date, locale, review date, expiry date, version, and reviewer metadata as appropriate.
- Require review before publishing; allow stricter multi-reviewer rules for sensitive/high-impact content.
- Mark salary data as geography-specific and estimated where appropriate; never promise salary outcomes.
- Include exam authority/notification, syllabus version, pattern, source, and last-checked date.
- Expire or unpublish stale time-sensitive content according to approved rules.
- Process user feedback into an editorial review queue.

### 8.6 Mock tests and resume profiles
- Compute scores server-side and keep correct answers unavailable until review conditions allow them to be revealed.
- Validate attempt state and prevent duplicate submission/scoring.
- Keep attempt history scoped to its owner.
- Resume content must be based on user-supplied facts; generated content must not invent qualifications or experience.
- Resume profiles are private by default unless the product explicitly approves a sharing feature and its consent controls.
- Decide server-side document export format and generation before implementation; the SRS leaves this open.

### 8.7 Reports, notifications, and exports
- Enforce report permissions and tenant scope in the backend.
- Aggregate only fields needed for the report; apply export-specific authorization and data minimization.
- Generate large exports asynchronously, store them privately, scan where applicable, and issue short-lived download links.
- Log export creation and access without logging report contents.
- Use durable workers, retries with backoff, dead-letter handling, delivery status, and idempotent processing.
- Do not send email/SMS until the provider and approved message templates are selected.

### 8.8 HR service requests (FR-008)

- Model request types in `service_catalog_items` with tenant-specific form schemas, required fields, SLA targets, and queue/assignee rules; validate the submitted form server-side against the catalog version used at creation.
- Suggested statuses: `open`, `in_progress`, `waiting_on_requester`, `resolved`, `closed`, `cancelled`. Transitions are explicit and permission-checked; resolution/closure records actor and timestamp.
- Requester-visible comments and internal notes are separate visibility classes. Never expose internal notes through the requester API, exports, or notifications.
- Attachments use the shared `documents` metadata and private storage; the requester may access only their request's documents via short-lived authorized URLs.
- Compute SLA due times from the catalog and tenant calendar; emit reminder/escalation events through the configured rules. Do not hard-code SLA values.
- Create request + initial status + audit event + outbox event transactionally, with idempotency on submission.
- Search/list endpoints must enforce `read_own` or `read_queue` scope and must not leak request existence across tenants.

### 8.9 Administration and configuration (FR-030)

- Administration is itself a permission-scoped domain; `Tenant Admin` is not a blanket bypass.
- Membership/role changes: prevent self-escalation, prevent granting permissions the actor does not hold (except an approved break-glass procedure), require MFA for privileged roles, invalidate permission caches, and audit before/after role sets.
- Configuration objects (leave types, approval rules, reminder rules, service catalog, settings) are versioned and effective-dated. Validate changes against active requests and publish them atomically; never mutate rules that are needed to interpret historical decisions.
- Use optimistic concurrency on settings and workflow definitions; require a change reason for high-impact changes.
- High-impact actions (role grants, retention changes, publishing, legal-hold release) should support a four-eyes/second-approver rule where policy requires it.
- Administrative reads of sensitive records are audited, including actor, target, purpose, and outcome.
- Do not allow configuration to disable mandatory security controls (authorization, audit, tenant isolation, retention).

### 8.10 Notifications and reminder rules (FR-012, FR-021)

- Model notification generation as: domain event → localized template version → channel decision → `notifications` row → provider adapter → delivery status.
- Support at least in-app notifications in the MVP; email/SMS only after providers and approved templates are selected. Store provider message IDs, not message bodies, in logs.
- Templates are localized (`en`, `hi`), reviewed, versioned, and referenced by stable `template_code`. Missing translations fall back to the tenant default with a recorded gap; never machine-translate sensitive policy text at send time.
- Respect user/channel preferences and quiet hours where configured; do not allow disabling mandatory security or workflow notifications.
- Deduplicate with a business `dedupe_key` (for example `leave:{request_id}:approved:{recipient_id}`) so retries and duplicate events do not spam users.
- Reminder rules define entity type, offset before/after due date, repeat interval, maximum repeats, escalation recipients, and channel. Rules are tenant-scoped, effective-dated, and validated (no negative intervals, no escalation to unauthorized roles).
- Workers claim jobs with leases, retry with exponential backoff, record attempt counts, and move exhausted jobs to a dead-letter state with alerting.
- Notifications must not include unnecessary sensitive details (for example full leave reasons or candidate feedback) in subject lines, logs, or push previews.

### 8.11 Retention, deletion, and data-subject requests (FR-031)

- Encode retention as data in `retention_policies` keyed by entity/classification and, where required, jurisdiction; do not bury retention periods in code.
- Compute a retention deadline per record or aggregate; expose it for review. Legal hold (`legal_holds`) overrides deletion and must be checked immediately before hard deletion.
- Deletion requests support identity verification, scope preview, approval where required, execution, and evidence. Distinguish erasure, anonymization, and restriction; preserve audit records and lawful obligations.
- Cascading behavior must be explicit per entity: hard delete owned drafts/attachments, anonymize records referenced by financial/audit history, and never silently delete another tenant's data.
- Purge backups according to the approved backup-retention schedule; document that backup expiry, not immediate deletion, is the recovery boundary.
- Scheduled retention jobs run per tenant in bounded batches, are idempotent, emit metrics (deleted/blocked/failed), and never run without legal-hold checks and an audit trail.
- Object storage lifecycle rules must match database metadata; orphaned objects are detected and removed by a separate reconciliation job.

### 8.12 Localization contract (FR-004, NFR-11)

- Supported locales: `en` and `hi` initially. Resolve locale from the authenticated user preference, then `Accept-Language`, then tenant `default_locale`, then `en`.
- API responses return stable codes (status, role, permission, error `message_key`) and ISO 8601 timestamps. The frontend owns UI labels and formatting; server-generated notifications/emails use reviewed localized templates.
- Store content with an explicit `locale`; do not treat machine translation as approved policy or exam content. Missing translations are flagged, not silently substituted with unreviewed text.
- Normalize Unicode (NFC) for search and uniqueness; test Devanagari input, mixed-script names, and sorting/collation.
- Tenant timezone governs business-day calculations, leave dates, SLA due times, and report ranges; store UTC and convert at the boundary.
- Never use translated text as a database key, permission code, status code, or API enum.
- Provide a translation-review workflow/owner for policy and public career content; record reviewer and review date.

### 8.13 Courses and content feedback (FR-027, FR-035)

- Course records include provider, canonical URL, locale, level, format, topic, source-checked date, availability status, and review state. Do not imply accreditation or placement outcomes without evidence.
- Validate URLs and label external providers accurately; consider a scheduled link-check job that flags broken/expired links for editorial review.
- `content_reports` capture content ID, reporter (nullable), reason category, optional comment, status, and timestamps. Rate-limit by user/IP and cap duplicates.
- Route reports to an editorial triage queue with statuses (`open`, `triaged`, `resolved`, `rejected`); record the resolution and link it to the content version change.
- Feedback is not a policy source and must not automatically alter public content or AI answers.
- Public APIs expose only published, in-window content; editorial metadata and internal notes stay private.

### 8.14 Audit trail design (FR-029, NFR-10)

`audit_events` should contain: `id`, `tenant_id` (nullable for public/platform events), `actor_user_id`/`actor_type`, `action`, `target_type`, `target_id`, `outcome`, `occurred_at`, `correlation_id`, `request_id`, `ip_hash`, `user_agent_hash`, and minimized `metadata`. Do not store secrets, full policy text, leave reasons, candidate feedback, or resume contents.

Minimum event catalogue:

| Area | Actions |
|---|---|
| Identity | `auth.login.succeeded`, `auth.login.failed`, `auth.logout`, `session.revoked`, `mfa.challenge.failed` |
| Access | `membership.created`, `membership.disabled`, `role.granted`, `role.revoked`, `permission.denied` |
| Knowledge/AI | `policy.published`, `policy.retired`, `ai.query.completed`, `ai.query.fallback`, `ai.feedback.created` |
| Leave | `leave.request.created`, `leave.request.updated`, `leave.request.decided`, `leave.request.cancelled`, `leave.balance.adjusted` |
| Service desk | `service_request.created`, `service_request.assigned`, `service_request.status_changed`, `service_request.closed` |
| Onboarding | `onboarding.case.created`, `onboarding.task.updated`, `onboarding.task.completed`, `onboarding.template.changed` |
| Recruitment | `requisition.created`, `requisition.approved`, `application.stage_changed`, `candidate.viewed`, `interview.scheduled`, `interview.feedback.submitted` |
| Content | `content.drafted`, `content.reviewed`, `content.published`, `content.expired`, `content.archived`, `content_report.resolved` |
| Reports | `report.export.requested`, `report.export.downloaded` |
| Administration | `settings.updated`, `workflow_rule.updated`, `retention_policy.updated`, `legal_hold.applied`, `legal_hold.released`, `deletion.executed` |

Implementation rules:

- Append-only: application roles have `INSERT` (and constrained `SELECT`) but no `UPDATE`/`DELETE`; use a dedicated writer or database trigger to reject mutation.
- Write the audit event in the same transaction as the business change; for external effects use the outbox.
- Treat audit reads as privileged and purpose-limited; audit access itself should be logged.
- Protect against tampering with restricted roles, partitioned storage, and periodic immutable export/hash chaining where required.
- Alert on repeated authorization denials, privileged role changes, mass exports, legal-hold changes, and retention-job anomalies.

### 8.15 Workflow state machines (SRS Appendix B)

Encode transitions in one domain module per entity and test them as a table. Reject invalid transitions with `409 invalid_state_transition`.

| Object | States and principal transitions |
|---|---|
| Leave request | `draft → pending` (submit); `pending → needs_clarification → pending`; `pending → approved/rejected`; `pending/approved → cancelled` subject to policy; terminal: `rejected`, `cancelled`. Decision after a terminal state returns `409 already_decided`. |
| Onboarding task | `not_started → in_progress → completed`; any active state → `blocked`; `blocked → in_progress`; permitted state → `waived`. Completion records actor/time/evidence. |
| Requisition | `draft → pending_approval → approved → open → on_hold → open`; `open/on_hold → closed/cancelled`; rejection returns to `draft` or terminates per policy. |
| Application | `received → screening → interview → offer → hired`; any active stage → `rejected/withdrawn`; terminal states are immutable except for an audited correction. |
| Career content | `draft → in_review → approved → published → expired/archived`; `in_review → draft` on changes requested; published content is immutable—publish a new version. |
| Mock-test attempt | `in_progress → submitted → evaluated`; `in_progress → abandoned` on expiry; submission after terminal state returns `409`. |

State machines must be enforced server-side, recorded in audit/stage history, and mirrored (not enforced) in the UI.

## 9. Security and privacy checklist

- [ ] HTTPS/TLS enforced in all deployed environments.
- [ ] Secure session configuration, CSRF protection where applicable, session revocation, and privileged-role MFA.
- [ ] Server-side object/action authorization on every protected request.
- [ ] Tenant isolation in queries, services, workers, exports, files, and AI retrieval.
- [ ] Cross-tenant and IDOR tests cover URL IDs, nested objects, file links, and exports.
- [ ] Input validation, parameterized queries/ORM, safe Markdown/HTML rendering, output encoding, and CSP.
- [ ] Strict CORS origin allowlist; no wildcard credentialed CORS.
- [ ] Rate limits and abuse monitoring for sensitive endpoints.
- [ ] File type/size allowlists, malware scanning, private storage, safe metadata, and expiring signed URLs.
- [ ] Secrets stored outside source control, client bundles, logs, and database dumps.
- [ ] Encryption in transit and managed encryption at rest for database, backups, and object storage.
- [ ] Sensitive values redacted from logs; audit access restricted.
- [ ] AI provider retention/training terms and data residency reviewed; unnecessary employee/candidate data excluded from model prompts.
- [ ] Retention/deletion, legal hold, privacy notices, and data-subject processes approved.
- [ ] Dependency/secret/static analysis, code review, threat modeling, container scanning, and security tests in CI/CD.
- [ ] Backups encrypted and isolated; restoration periodically tested; RPO/RTO approved.
- [ ] Privileged changes alerted and audited; periodic access review established.
- [ ] Consent/privacy-notice versions recorded where required; withdrawal and retention behavior implemented.
- [ ] Idempotency and optimistic-concurrency tests pass for all critical submissions and decisions.
- [ ] Audit events are append-only and mutation attempts by normal roles are denied.
- [ ] RLS (if enabled) is tested with cross-tenant IDs, joins, aggregates, exports, and workers.
- [ ] Data classification drives access, retention, logging, and export-field allowlists.

## 10. Observability and resilience

Use structured logs, metrics, traces, alerts, and correlation IDs. Do not log passwords, tokens, unnecessary personal data, sensitive policy text, candidate feedback, or full document contents.

Monitor at minimum:
- Request volume, latency, error rate, and saturation by route/domain.
- Authentication failures, authorization denials, rate-limit events, and privileged-role changes.
- Database pool health, slow queries, migration status, and connection errors.
- Queue depth, worker failures, retry count, dead-letter volume, and notification delivery.
- AI provider latency/errors, retrieval failures, citation coverage, fallback rate, user feedback, and evaluation regressions.
- Backup completion, restore-test status, and object-storage failures.

The SRS proposes p95 below 3 seconds for ordinary non-AI API requests and 99.5% monthly availability after launch. These are proposed targets, not contractual SLAs, and require load/capacity validation. Measure AI latency separately.

### 10.1 Structured log contract

Every request/job log line should include: `timestamp`, `level`, `service`, `environment`, `request_id`/`correlation_id`, `route` or `job`, `method`, `status`, `duration_ms`, `tenant_id` (internal), `actor_type`, `actor_id` (or a stable hash), `outcome`, and `error_code`. Never log tokens, cookies, passwords, full prompts, leave reasons, candidate feedback, resume contents, or document text. Hash or omit client IP/user agent where policy requires.

### 10.2 Minimum metrics and alerts

| Area | Metrics | Proposed alert trigger |
|---|---|---|
| API | request rate, p50/p95/p99 latency, 4xx/5xx rate, in-flight requests | p95 above target for 15 min; 5xx above baseline |
| Auth | login success/failure, MFA failures, session revocations, authorization denials | Spike in denials/failures; repeated tenant-scope violations |
| Database | pool utilization, wait time, slow queries, deadlocks, replication/backup lag, migration status | Pool saturation; deadlocks; failed backup |
| Queue | depth, age of oldest job, retries, dead-letter count, processing latency | Oldest job above SLA; DLQ growth |
| Notifications | queued/sent/failed, provider latency, bounce rate | Delivery failure spike |
| AI | latency, provider errors, retrieval failures, citation coverage, fallback rate, feedback score | Fallback/citation-coverage regression |
| Storage | upload failures, scan failures/rejections, signed-URL errors | Scan backlog; repeated access failures |
| Retention | deleted/blocked/failed counts, legal-hold blocks | Unexpected deletions or repeated failures |

Dashboards should separate public and internal traffic, and AI latency from ordinary API latency. Alerts must link to a runbook and include the correlation ID pattern for investigation.

### 10.3 Asynchronous job catalogue

| Job | Trigger | Idempotency/dedupe | Failure handling |
|---|---|---|---|
| Notification delivery | Outbox event | `dedupe_key` per recipient/template/entity | Retry/backoff, DLQ, provider status |
| Reminder/escalation scan | Schedule | One `reminder_instance` per rule/target/window | Retry, skip if target state changed |
| Knowledge ingestion/indexing | Policy publish/version change | Job per document version/generation | Retry, keep previous index active until success |
| Document malware scan | Upload registered | Document checksum/scan version | Quarantine; never serve unscanned files |
| Report export | Authorized request | Idempotency key + filter hash | Retry, expire artifact, notify requester |
| Retention/deletion | Schedule/approved request | Per-record/per-batch ledger | Stop on legal hold; alert on failure |
| Content expiry | Schedule | Per content version/date | Unpublish atomically; audit |
| Link/content checks | Schedule | Per course/content version | Flag for editorial review, do not auto-edit facts |
| Backup verification | Schedule | Run ID | Alert on failed restore/verification |

Workers must enforce tenant scope, run with least-privilege credentials, and use bounded concurrency. A job must be safe to run twice; use `FOR UPDATE SKIP LOCKED`, leases, and business dedupe keys rather than assuming exactly-once delivery.

### 10.4 Graceful degradation

- If AI/retrieval is unavailable, return `provider_unavailable` with an HR support route; never fabricate an answer.
- If email/SMS is unavailable, queue and retry; show in-app notification state and avoid blocking the business transaction.
- If object storage/scanning is unavailable, reject or quarantine uploads with a clear retry path; never bypass scanning.
- If the database is unavailable, fail closed for protected operations, return a stable `503`, and avoid partial writes.
- If a dependency is slow, apply timeouts/circuit breakers and return a safe fallback rather than exhausting workers.

## 11. Testing strategy

### Required layers
- **Unit tests:** domain rules, authorization predicates, state transitions, validation, locale handling.
- **Repository/integration tests:** PostgreSQL constraints, transactions, migrations, tenant filters, RLS if used.
- **API contract tests:** schemas, status codes, error envelopes, OpenAPI, permissions.
- **End-to-end workflow tests:** leave submit/decision, onboarding completion, recruitment stage changes, content publishing, mock-test submit.
- **Security tests:** tenant isolation, IDOR, privilege escalation, CSRF/CORS, rate limiting, file access, injection, audit tampering.
- **AI quality tests:** grounded answers, citations, missing/conflicting evidence, prompt injection, cross-tenant leakage, English/Hindi quality.
- **Resilience tests:** worker retries, provider outages, duplicate messages, queue recovery, backup restore, migration/rollback procedure.
- **Performance tests:** ordinary API p95 under agreed load; large report/export behavior.
- **Privacy tests:** log redaction, retention/deletion workflows, restricted fields, resume ownership.
- **UAT:** HR, employee representatives, recruiter, content reviewer, and public career user personas.

Use synthetic data outside production. No production release until critical security tests pass and unresolved critical/high defects are formally dispositioned.

### 11.1 Use-case test matrix (SRS §10)

| Use case | Critical positive test | Mandatory negative/security tests |
|---|---|---|
| UC-01 Ask HR policy | Grounded answer with authorized citations; English and Hindi | No source, conflicting/stale source, unauthorized document, prompt injection, cross-tenant retrieval, provider outage |
| UC-02 Submit leave | Valid request created, balanced reserved, routed, audited, idempotent | Invalid dates, overlap, insufficient balance, missing approver, duplicate submit, cross-tenant employee ID |
| UC-03 Approve leave | Authorized decision recorded atomically and notified | Stale screen/version, revoked role, already decided, approver outside scope, self-approval if prohibited |
| UC-04 Complete onboarding task | Assigned owner updates status/evidence | Non-owner update, reassigned task, missing evidence, invalid transition, expired upload link |
| UC-05 Move candidate stage | Valid stage transition with history/audit | Cross-tenant candidate, invalid transition, closed requisition, unauthorized recruiter, public user access |
| UC-06 Publish career content | Reviewed version published with source/date | Missing source/date, expired notice, reviewer conflict, unsupported locale, unauthorized publish |
| UC-07 Take mock test | Start/resume/submit; server score; review gating | Expired test, interrupted session, duplicate submit, answer-key leakage, another user's attempt |
| UC-08 Export HR report | Scoped export with allowlisted fields | Unauthorized fields, oversized export, injection in filters, timeout, cross-tenant rows, link expiry |

Also test: bilingual error/notification rendering, locale fallback, timezone/DST boundaries, RLS bypass attempts, audit immutability, retention/legal-hold behavior, and backup restore.

### 11.2 Test environment and data rules

- Use disposable PostgreSQL instances (Testcontainers or an isolated CI database) with real constraints, migrations, and RLS—not SQLite.
- Seed deterministic synthetic tenants, users, employees, candidates, and content; never use production data.
- Include a Hindi/Devanagari dataset for search, sorting, name handling, and PDF/export checks.
- Run migration tests from the previous release schema, including backfills and rollback/forward-fix validation.
- Keep security tests in CI and make cross-tenant/IDOR failures release-blocking.

## 12. Recommended implementation sequence

1. **Discovery and sign-off:** resolve identity provider/MFA, tenant lifecycle, leave rules, candidate privacy, data classification, retention, RPO/RTO, AI provider, language review, hosting, integrations, and success metrics.
2. **Security and technical foundation:** repository/CI, configuration and secrets, auth integration, permission model, tenant context, PostgreSQL migrations, audit events, structured logs, health checks, API conventions.
3. **Core MVP and AI knowledge assistant:** policy ingestion/versioning, permission-filtered retrieval, citations/fallback, locale support, employee/HR basic flows, leave submission and decisions.
4. **Career and recruitment modules:** public content lifecycle, exam guides, mock tests, resume profile, requisitions, candidate/application pipeline, interviews, and privacy controls.
5. **Reports, reminders, integrations, and release:** workers/queue, notifications, exports, dashboards, restore tests, UAT, security review, runbooks, rollback.
6. **Post-launch improvement:** monitor success metrics, review feedback and AI evaluation, refine retrieval/content, improve performance and accessibility, and prioritize later integrations.

Security, privacy, QA, content governance, and change control continue across every phase.

## 13. Release gates

Before production, obtain:
- Business sign-off on workflows, leave rules, approval hierarchy, recruitment stages, and content publishing.
- Security threat model and privacy/data-flow review.
- Passing tenant-isolation and object-level authorization tests.
- Tested migrations, backups/restores, monitoring, incident response, and rollback.
- AI evaluation covering evidence quality, conflicting/missing policy, prompt injection, cross-tenant leakage, and English/Hindi quality.
- UAT from the required personas.
- Approved operational runbooks, support ownership, RPO/RTO, and support commitments.

## 14. Open decisions — do not silently assume

The SRS leaves these decisions unresolved:
- Applicable legal/compliance jurisdictions and data residency.
- Identity provider, MFA, account recovery, and employee provisioning.
- Tenant onboarding and organization administration model.
- Exact leave rules, calendars, balances, approval chains, cancellation/modification.
- Candidate privacy notice, lawful basis/consent where applicable, retention, deletion, and access requests.
- AI provider/model, embedding/search strategy, data terms, provider retention, data residency, and evaluation thresholds.
- Email/SMS provider, object storage, background queue, hosting, monitoring, and secrets manager.
- Data classification, retention periods, audit retention, RPO/RTO, support SLA, incident notifications.
- Report metrics and exportable personal fields.
- Resume export format and whether users may explicitly share resumes.
- Hindi translation review ownership.
- Budget, team, target launch date, pilot organization, and baseline metrics.

## 15. Traceability and change management

Maintain a traceability matrix mapping every SRS requirement ID to:
- Backend module/service and API endpoint.
- Database entity/migration where applicable.
- Unit, integration, security, and end-to-end tests.
- Backlog item and UAT evidence.
- Owner, status, and release/version.

Any change to workflow, data model, API contract, security behavior, or scope must include rationale, impact assessment, priority, approval owner, and version history.

## Appendix A — SRS requirement traceability

Paths in this table are implementation locations in this guide plus the primary API/data artefact. Test IDs should be added when the backlog is baselined.

| ID | Requirement (abbreviated) | Implementation | Primary API / data | Test focus |
|---|---|---|---|---|
| FR-001 | Authenticate and authorize every protected request | §5.1, §5.6 | Sessions, auth dependencies | Authn/authz, session revocation |
| FR-002 | Tenant-scoped internal operations | §5.3, §6.7 | `tenant_id`, RLS | Cross-tenant isolation |
| FR-003 | Public/employee account separation | §5.4 | Principal audiences, memberships | Privilege escalation |
| FR-004 | English/Hindi UI and messages | §8.12 | Locale, `message_key`, templates | Locale fallback, notification rendering |
| FR-005 | Approved, versioned policy retrieval | §8.1 | `policy_documents`, `knowledge_chunks` | Retrieval eligibility, stale/retired versions |
| FR-006 | Citations and safe fallback | §8.1 | Citations, `answer_status` | Missing/conflicting evidence |
| FR-007 | Prompt/data safety | §8.1, §9 | Retrieval authorization, adapters | Prompt injection, leakage |
| FR-008 | HR service requests | §8.8 | `hr_service_requests`, comments, catalog | Ownership, internal notes, SLA |
| FR-009 | Leave submission | §8.2 | `leave_requests` | Validation, idempotency |
| FR-010 | Leave validation | §8.2, §6.6 | Balances, calendars, overlap constraint | Overlap, balance, DST, dates |
| FR-011 | Approval routing and decisions | §8.2, §6.9 | `approval_rules`, `leave_decisions` | Stale decision, scope, atomicity |
| FR-012 | Leave notifications | §8.10 | Notification templates/outbox | Retry, dedupe, locale |
| FR-013 | Onboarding templates | §8.3 | Template/task tables | Assignment rules, versioning |
| FR-014 | Onboarding tracking | §8.3 | Tasks, evidence | Ownership, transitions, overdue |
| FR-015 | Classified document access | §8.3, §6.5 | `documents`, signed URLs | IDOR, expiry, scan status |
| FR-016 | Requisitions and approval | §8.4 | Requisitions/approvals | Publication gate, scope |
| FR-017 | Candidate pipeline | §8.4 | Applications, stage history | Valid transitions, audit |
| FR-018 | Interview scheduling | §8.4 | Interviews, participants | Notifications, conflicts |
| FR-019 | Candidate privacy | §8.4, §6.5 | Consent, retention fields | Cross-tenant/role access |
| FR-020 | Reports and permitted exports | §8.7, §10.3 | Report queries, `report_exports` | Field allowlist, async export |
| FR-021 | Configurable reminder rules | §8.10 | `reminder_rules`, instances | Escalation, dedupe |
| FR-022 | Sourced job content | §8.5 | Career content fields | Source/date/expiry validation |
| FR-023 | Salary guidance caveats | §8.5 | Salary fields, currency/geography | Misleading-outcome tests |
| FR-024 | Exam source/syllabus metadata | §8.5 | Exam content fields | Missing/expired notice |
| FR-025 | Configurable mock tests | §8.6, §8.15 | Tests, questions, attempts | Server scoring, answer-key gating |
| FR-026 | Fact-based resume builder | §8.6 | Resume profiles | No invented facts, ownership |
| FR-027 | Course catalogue | §8.13 | Courses | Provider/date accuracy |
| FR-028 | Content review lifecycle | §8.5, §8.15 | `content_versions`, reviews | Reviewer separation, publish gates |
| FR-029 | Audit trail | §8.14 | `audit_events` | Immutability, coverage |
| FR-030 | Administration | §8.9 | Admin APIs, scoped roles | Self-escalation, four-eyes |
| FR-031 | Retention and deletion | §8.11 | Policies, holds, deletion requests | Legal hold, evidence |
| FR-032 | Accessibility | Frontend guide §9; §7.3 stable codes | API labels/keys | Cross-doc review |
| FR-033 | Documented API contract/errors | §7.3, §7.7 | OpenAPI, error envelope | Contract tests |
| FR-034 | Idempotent critical submissions | §6.9, §7.5 | `idempotency_keys` | Replay/conflict/concurrency |
| FR-035 | Content feedback | §8.13 | `content_reports` | Rate limit, triage |

| ID | NFR (abbreviated) | Implementation |
|---|---|---|
| NFR-01 | Security controls | §5, §7.6, §9 |
| NFR-02 | Deny-by-default authorization | §5.6, §7.3 |
| NFR-03 | Tenant isolation/RLS | §5.3, §6.7 |
| NFR-04 | Vetted auth, rate limits, MFA | §5.1, §5.4 |
| NFR-05 | Privacy/minimization | §8.11, §8.14 |
| NFR-06 | AI safety and telemetry | §8.1 |
| NFR-07 | p95 < 3s non-AI target | §10.2, load tests |
| NFR-08 | 99.5% availability target | §10.2, deployment design |
| NFR-09 | Resilience/retries/DLQ | §6.9, §10.3, §10.4 |
| NFR-10 | Protected audit | §8.14 |
| NFR-11 | Locale-aware formatting | §8.12 |
| NFR-12 | WCAG 2.2 AA target | Frontend guide §9 |
| NFR-13 | Maintainability/migrations | §3, §6.10, §7.7 |
| NFR-14 | Observability | §10.1, §10.2 |
| NFR-15 | RPO/RTO and restore tests | §6.10, §10.3 |
| NFR-16 | Secure SDLC | §4, §9, CI gates |

## Appendix B — SRS gap register and proposed resolutions

The SRS is a requirements document, not a physical design. The gaps below block or complicate implementation unless resolved. All resolutions are proposals for approval, not silent assumptions.

| Gap | Why it matters | Proposed resolution | Decision owner |
|---|---|---|---|
| G-01: FR-008 service requests have no entity/API in SRS §11–§12 | Cannot implement the requirement consistently | Add `service_catalog_items`, `hr_service_requests`, comments, attachments and `/service-requests` APIs | Product Owner + HR Ops |
| G-02: FR-021 reminder rules have no configuration model | Rules would be hard-coded or per-deployment | Add `reminder_rules`/`reminder_instances` with effective dates | HR policy owner + Engineering |
| G-03: FR-010 needs balances/holidays but SRS models only requests | Balance and working-day validation impossible | Add leave balances/ledger, holiday calendars, approval rules | HR/Finance + Legal |
| G-04: FR-030 admin capability lacks endpoints | Administration would be manual database changes | Add scoped admin APIs and four-eyes for privileged changes | Product + Security |
| G-05: FR-031 retention has no policy/hold model | Deletion cannot be auditable or legally defensible | Add retention policies, legal holds, deletion requests/jobs | Legal/Compliance |
| G-06: FR-034 idempotency has no storage contract | Retries can duplicate leave/tests/exports | Add `idempotency_keys` and a documented replay contract | Engineering |
| G-07: FR-015 document controls lack shared metadata | Files could be stored ad hoc with inconsistent access | Add `documents` metadata, scanning, signed-URL policy | Security + Engineering |
| G-08: FR-019 consent/lawful basis is unspecified | Candidate privacy obligations may not be met | Add privacy notice versions and consent records | Legal/Privacy |
| G-09: AI citation/answer-status schema is unspecified | Frontend cannot render uncertainty consistently | Adopt the citation/`answer_status` contract in §8.1 | Product + AI owner |
| G-10: FR-020 exports have no job/artifact model | Long exports risk timeouts and link leakage | Add async export jobs, private artifacts, expiry | Engineering |
| G-11: Status transition rules are only suggested | Invalid transitions and stale approvals possible | Adopt server-enforced state machines in §8.15 | HR Ops + Engineering |
| G-12: Public vs internal content storage boundary is not physical | Accidental tenant association/cache leakage | Separate public content authorization path and, if useful, schema/storage bucket | Architecture + Security |
| G-13: Hindi review ownership is undecided | Machine translation could be mistaken for approved policy | Add locale review state/owner and missing-translation flags | Content owner |
| G-14: Report metrics/personal fields are undecided | Exports may over-share personal data | Define metric catalogue and field allowlists before build | Product + Privacy |

## Appendix C — Decisions that must be approved before implementation

Inherited from SRS §17 and still open: identity provider/MFA/recovery, tenant lifecycle, leave and approval rules, candidate privacy/retention, AI provider/search/retention/data residency and evaluation thresholds, email/SMS/object storage/queue/hosting/secrets manager, data classification/RPO/RTO/SLA, report fields, resume export/sharing, Hindi review ownership, and budget/launch/pilot.

Until these are approved, keep affected behavior behind configuration, feature flags, or adapter interfaces; do not encode a vendor or legal assumption into domain logic or migrations.
