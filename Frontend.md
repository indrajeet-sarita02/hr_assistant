# Frontend Engineering Guide — HR Assistant

**Document:** `Frontend.md`  
**Source:** HR Assistant Application — Software Requirements Specification (SRS), Version 1.0, Draft for stakeholder review, 22 October 2026  
**Version:** 1.2 — Mobile-responsive implementation contract update, 22 October 2026  
**Status:** Engineering baseline for review; UI details not explicitly specified by the SRS are recommendations and must be validated with stakeholders.

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 22 Oct 2026 | Initial frontend baseline derived from SRS v1.0. |
| 1.1 | 22 Oct 2026 | Aligned to SRS §4, §8–§12 and Appendix B: added HR service desk, notification center, admin/config and content editorial routes; rendering/caching matrix; route-to-API-permission map; expanded localization, auth, API-client, accessibility, testing, and requirement traceability; added status-badge and page-state contracts. |
| 1.2 | 22 Oct 2026 | Added the mobile-responsive implementation contract: breakpoints, route-level mobile behavior, navigation patterns, touch/keyboard/safe-area rules, table and form adaptation, zoom/reflow requirements, and a responsive acceptance/test matrix. |

## 1. Purpose and scope

This document defines the frontend approach for the bilingual, responsive HR Assistant web application. The SRS specifies **Next.js** for the frontend, **FastAPI** for the backend, and **PostgreSQL** for the database.

The interface serves two distinct audiences:

- **Internal HR users:** employees, HR executives, HR managers/approvers, recruiters, company administrators, content reviewers, and scoped security/audit users.
- **Public career users:** people exploring HR careers, job/exam information, mock tests, resumes, and courses.

The frontend must support English and Hindi, protect private HR data, and provide accessible responsive web experiences. It must not imply that AI makes employment decisions or guarantees salary, job availability, placement, or exam success.

## 2. Requirements derived from the SRS

- Authenticate users and present only features permitted by their roles and scopes, while remembering that backend authorization is authoritative (FR-001–FR-003).
- Support English and Hindi across navigation, validation, key notifications, and selected content (FR-004).
- Present HR assistant answers with source citations, clear uncertainty, and a route to HR support when evidence is insufficient (FR-005–FR-007).
- Support HR service requests, including catalog-driven forms, own/assigned queues, comments, attachments, and status tracking (FR-008).
- Support leave submission/status/decision experiences, onboarding task tracking, recruitment workflows, reports, and reminders (FR-009–FR-021).
- Present public job/salary/exam content with source, checked date, review/expiry information where applicable (FR-022–FR-024).
- Support mock tests with configurable duration/question count/scoring, answer review, and explanations (FR-025).
- Support resume creation/editing from user-provided facts without inventing qualifications or experience (FR-026).
- Support course discovery, content review states, content feedback, and appropriate administration (FR-027–FR-030, FR-035).
- Support retention/deletion request status and legal-hold-aware messaging where the user is authorized (FR-031).
- Meet keyboard, focus, semantic labeling, readable error, and WCAG 2.2 AA target requirements (FR-032; NFR-12).
- Remain usable on mobile from 320 CSS px upward without horizontal page scrolling, clipped actions, hover-only controls, or desktop-only workflows; every permitted task must be completable on a phone or tablet.
- Consume documented API schemas/error codes and submit critical actions idempotently (FR-033–FR-034).
- Never expose secrets or private HR data in static output, public pages, client props, or shared caches (SRS architecture notes).

## 3. Recommended frontend architecture

Use Next.js with a feature-oriented structure. Prefer server rendering for public published career content where appropriate; private HR screens must be protected against public/static caching. Treat all data received from the browser as untrusted, and rely on FastAPI for authorization and business validation.

### 3.1 Suggested project layout

```text
frontend/
  app/
    [locale]/
      (public)/
        page.tsx
        career/
        jobs/
        exams/
        courses/
        mock-tests/
        resume/
        privacy/
        terms/
        accessibility/
        content-feedback/
      (auth)/
        sign-in/
        sign-out/
        account/
        session-expired/
        access-denied/
      (internal)/
        dashboard/
        hr-assistant/
        service-requests/
        leave/
        onboarding/
        recruitment/
        reports/
        notifications/
        admin/
          organization/
          members/
          roles/
          leave-types/
          approval-rules/
          reminder-rules/
          service-catalog/
          content/
          content-reports/
          retention/
        audit/
      layout.tsx
      error.tsx
      not-found.tsx
    api/                  # only if a deliberate Next.js BFF route is approved
  components/
    ui/
    layout/
    forms/
    feedback/
    data-display/
    accessibility/
  features/
    auth/
    preferences/
    hr-assistant/
    service-requests/
    leave/
    onboarding/
    recruitment/
    reports/
    career-content/
    mock-tests/
    resumes/
    courses/
    notifications/
    content-reports/
    administration/
  lib/
    api-client.ts
    auth.ts
    i18n/
    validation/
    formatting/
    permissions.ts        # presentation only; not security enforcement
    errors.ts
    status.ts
    idempotency.ts
    dates.ts
  messages/
    en/
    hi/
  public/
  tests/
    unit/
    component/
    e2e/
    accessibility/
  middleware.ts
  package.json
```

This layout is a recommendation; adapt it to the chosen Next.js routing mode and team conventions. Keep feature code cohesive and share design-system primitives rather than duplicating controls.

### 3.2 Rendering, caching, and data-boundary matrix

The SRS requires that private HR data never appear in static output, public props, or shared caches. Make the rendering mode an explicit decision per route group.

| Area | Rendering | Authentication | Caching | Data boundary |
|---|---|---|---|---|
| Public career pages/content | Server rendering or incremental static regeneration with explicit revalidation | Optional/public | Public CDN cache allowed; revalidate on publish/expiry | Published, in-window public content only |
| Auth/account pages | Dynamic | Public or authenticated | `no-store` | No private HR data |
| Internal HR pages | Dynamic server components/SSR | Required | `no-store`; no shared cache; no static generation | Tenant-scoped data fetched server-side or with private client calls |
| Mock-test attempt | Client-interactive with server-persisted state | Required | `no-store` | Owner-only attempt; no answer keys before allowed |
| Resume profile | Dynamic/client form | Required (public principal) | `no-store` | Owner-only by default |
| Admin/config | Dynamic | Required + permission | `no-store` | Tenant-scoped, audited |
| Error/not-found | Static shell allowed | N/A | No private data | No stack traces or identifiers |

Implementation rules:

- For private routes, set route-level dynamic rendering and `fetch` cache `no-store`; do not rely on a global default that a future change could flip.
- Never pass access tokens, private records, or service credentials into client component props, serialized RSC payloads, `NEXT_PUBLIC_*` variables, or source maps shipped to the browser.
- Public pages must call public APIs only; do not reuse an internal endpoint with a different UI.
- Add a CI check/review checklist that inspects build output for private strings (emails, candidate names, policy text) from synthetic fixtures.
- Decide explicitly whether a Next.js BFF is used (SRS open decision). If used, it must forward the session/CSRF context safely and must not become a second authorization implementation.

## 4. Navigation and page inventory

The final sitemap and page names require product review. The following is a suggested inventory based on the SRS.

### 4.1 Public career area
- Home / career landing page.
- HR job guide and role details with source, checked date, and review/expiry date.
- Salary guidance with geography, currency, range/estimate status, source, and checked date.
- Exam listing and exam guide with authority/notification, syllabus version, pattern, source, and last-checked date.
- Mock-test listing, instructions, active attempt (with resume), result, and answer explanations.
- Course catalogue with topic, level, language, format, provider, and source-checked date.
- Resume profile builder and preview; export/sharing only after the format and privacy behavior are approved.
- Public HR career assistant, if enabled by product scope.
- Content feedback/report form with confirmation and status expectations.
- Sign-in/account pages for users who save profiles or test history.
- Privacy notice and consent/preference controls appropriate to the public account.
- Terms, accessibility statement, and support/contact links as approved.

### 4.2 Internal HR area
- Internal dashboard with role-appropriate summaries, pending actions, and reminders.
- HR knowledge assistant with citations, `answer_status` states, feedback, and HR support fallback.
- HR service desk: catalog/request form, own requests, assigned queue, request detail/comments/attachments.
- Employee leave list, request form, request detail/status, and approver inbox.
- Onboarding cases, case detail, assigned tasks, task evidence/status, and progress view.
- Recruitment requisitions, vacancy detail, application pipeline, candidate detail, and interview scheduling.
- Reports and permitted exports with queued/running/ready/failed states.
- Notification center and reminder/request status.
- Administration for organization settings, membership/role assignments, leave types, approval rules, reminder rules, service catalog, templates, and content where authorized.
- Content editorial queue with review, publish, expire, and archive actions.
- Content-report triage for editors/reviewers.
- Retention/deletion requests and legal-hold visibility for authorized compliance roles.
- Scoped audit event viewer for authorized users.

### 4.3 Role-aware navigation
Build navigation from the current user's verified profile and permitted capabilities. Hide irrelevant links for usability, but never treat hiding a link as authorization. The backend must reject unauthorized direct requests.

- Fetch capabilities with `/api/v1/me`; do not infer them from a role name.
- Treat navigation as a projection of permissions, with a route guard for defense in depth.
- Show a tenant switcher only when the user has multiple verified memberships; switching is explicit and clears tenant-scoped caches.
- When a capability is missing, prefer a clear access-denied state over rendering a broken page; the backend still returns authoritative `403`/`404`.

### 4.4 Illustrative route-to-API-and-permission map

Final routes require product approval. This map keeps page, API, and capability aligned during implementation.

| Route (under `/[locale]`) | Audience | Capability | Primary API |
|---|---|---|---|
| `/` | Public | Public | Public content endpoints |
| `/jobs`, `/jobs/[id]` | Public | Public | `GET /career/content` |
| `/exams`, `/exams/[id]` | Public | Public | `GET /career/exams/{id}` |
| `/courses`, `/courses/[id]` | Public | Public | `GET /courses` |
| `/mock-tests`, `/mock-tests/[id]` | Public/authenticated | `assessment.attempt_own` | `/mock-tests/{id}/attempts` |
| `/resume` | Public account | `resume.manage_own` | `/resume-profiles` |
| `/content-feedback` | Public | `content_report.create` | `POST /content-reports` |
| `/dashboard` | Internal | Authenticated | `GET /me`, dashboard/report endpoints |
| `/hr-assistant` | Internal | `hr_assistant.query` | `/hr-assistant/queries` |
| `/service-requests` | Internal | `service_request.read_own` | `/service-requests` |
| `/service-requests/new` | Internal | `service_request.create` | `POST /service-requests` |
| `/service-requests/queue` | HR Executive | `service_request.read_queue` | `GET /service-requests?scope=queue` |
| `/leave` | Internal | `leave.request.read_own` | `/leave/requests` |
| `/leave/new` | Internal | `leave.request.create` | `POST /leave/requests` |
| `/leave/approvals` | Approver | `leave.request.decide` | `GET /leave/requests?scope=approvals` |
| `/onboarding/cases` | HR/assigned | `onboarding.case.read` | `/onboarding/cases` |
| `/onboarding/tasks` | Assigned | `onboarding.task.update_assigned` | `/onboarding/tasks/{id}` |
| `/recruitment/requisitions` | Recruiter | `recruitment.requisition.manage` | `/recruitment/requisitions` |
| `/recruitment/applications` | Recruiter/interviewer | `recruitment.application.read_assigned` | `/recruitment/applications` |
| `/reports` | HR/Admin | `report.read` | `/reports/hr/summary` |
| `/notifications` | Any authenticated | `notification.read_own` | `/me/notifications` |
| `/admin/members` | Tenant Admin | `admin.membership.manage` | `/admin/memberships` |
| `/admin/roles` | Tenant Admin | `admin.membership.manage` | `/admin/roles` |
| `/admin/leave-types` | Tenant Admin/HR policy | `leave.type.manage` | `/admin/leave-types` |
| `/admin/approval-rules` | Tenant Admin | `admin.workflow.manage` | `/admin/approval-rules` |
| `/admin/reminder-rules` | Tenant Admin | `admin.workflow.manage` | `/admin/reminder-rules` |
| `/admin/service-catalog` | Tenant Admin | `admin.workflow.manage` | `/admin/service-catalog` |
| `/admin/content` | Editor/Reviewer | `career_content.edit` | `/admin/content` |
| `/admin/content-reports` | Editor/Reviewer | `content_report.triage` | `/admin/content-reports/{id}` |
| `/admin/retention` | Compliance/Admin | `retention.manage` | `/admin/deletion-requests` |
| `/audit` | Auditor/Admin | `audit.read` | `/admin/audit-events` |

## 5. English/Hindi localization

- Support at least `en` and `hi`; use a consistent locale routing and preference strategy approved by the team.
- Store UI strings in translation dictionaries rather than hard-coding text inside components.
- Translate navigation, buttons, labels, form validation, empty states, status labels, errors, notifications, and accessibility labels.
- Use locale-aware formatting for dates, times, numbers, and currency. Apply the tenant timezone for internal HR workflows where relevant.
- Do not assume that all content can be safely machine-translated. HR policy translations and public career/exam content require a defined review owner and process.
- Preserve original names and identifiers where translation would cause ambiguity.
- Ensure language switching preserves the current route where possible and does not accidentally switch the user's tenant/account context.
- Test long Hindi strings, wrapping, font rendering, mixed Latin/Devanagari content, screen-reader pronunciation, and mobile layouts.
- If a required translation is missing, use a controlled fallback and flag it for review; never silently translate sensitive policy wording at runtime as if it were approved.

### 5.1 Recommended locale strategy

- Use a `[locale]` path segment for shareable pages (`/en/...`, `/hi/...`); supported locales are `en` and `hi` initially.
- Persist the authenticated preference server-side via `/preferences/locale`; use a locale cookie for anonymous/public pages. Precedence: authenticated preference → explicit cookie → `Accept-Language` → `en`.
- Language switching should preserve the current route and query state, maintain authentication/tenant context, and update `<html lang>` and direction.
- Public pages should emit `hreflang` alternates and localized metadata; do not index duplicate/missing-translation pages as equivalent content.
- Internal pages must not change tenant/account context when the locale changes.
- Avoid automatic redirect loops and respect an explicit user choice over browser headers.

### 5.2 Message and error conventions

- Store strings in namespaced dictionaries (`leave.form.startDate`, `common.actions.cancel`) with ICU message syntax for plurals/gender where needed.
- Never concatenate translated fragments; use complete messages with placeholders.
- Render localized text from stable backend codes (`message_key`), not from raw server `message` strings, except for server-generated notifications/emails where the backend is authoritative.
- Provide a typed message key registry and a CI check for missing keys in either locale.
- Missing key behavior: fall back to English, render a safe generic message, log a non-PII telemetry event, and flag the key for translation review (never show the key itself to end users).
- Do not translate identifiers, status codes, permission names, document titles, or user-entered names.

### 5.3 Formatting and content review

- Use `Intl.DateTimeFormat`, `Intl.NumberFormat`, and `Intl.RelativeTimeFormat` with the active locale; format instants in the tenant timezone for HR workflows and show the timezone where ambiguity matters.
- Use ISO currency codes and explicit geography for salary guidance; never infer currency from locale alone.
- Hindi content requires a named reviewer and review date; machine translation is a drafting aid, not approval.
- Test Devanagari font loading/subsetting, line height, text expansion, mixed Latin/Devanagari, and screen-reader pronunciation.
- Show a clear "content language" indicator when the requested locale is unavailable and the user is viewing fallback content.

## 6. Authentication, sessions, and protected UI

- Integrate with the approved identity provider and session design. The SRS leaves the provider and MFA policy undecided.
- Do not store long-lived access tokens in browser local storage unless a formally reviewed architecture explicitly requires it.
- For cookie-based sessions, coordinate CSRF protections and cookie configuration with the backend.
- Show clear signed-out, session-expired, access-denied, and account-recovery states.
- After sign-in, load the current user, locale, active tenant memberships, and permitted capabilities from the backend.
- Treat tenant switching, if enabled, as an explicit action. Refresh all tenant-scoped data after switching and clear stale caches.
- Do not place privileged secrets, service credentials, private HR records, or unrestricted API tokens in client bundles.
- Avoid public static generation or shared caching for private HR pages/data. Review Next.js caching, fetch caching, route handlers, and CDN behavior explicitly.
- Frontend permission checks are for presentation only. FastAPI must authorize every protected operation.

### 6.1 Session and identity flow

1. Sign-in redirects to the approved identity provider; the backend establishes an `HttpOnly`, `Secure`, `SameSite` session cookie (public and internal sessions use distinct audiences/cookies).
2. On app load, fetch `/api/v1/me` server-side to obtain user, locale, active tenant, memberships, and capabilities.
3. Store only non-sensitive presentation state (for example sidebar collapse) in browser storage; never store access tokens or private HR records in `localStorage`.
4. For cookie-authenticated mutations, send the CSRF token/header required by the backend and ensure the API client attaches it consistently.
5. On sign-out, call the revoke endpoint, clear client caches, and avoid leaving back-button-accessible private pages.

### 6.2 Route guards and private-data handling

- Use middleware for coarse redirects (unauthenticated → sign-in) and server-side checks in layouts/pages for authorization-critical rendering.
- Middleware is not the sole authorization control; every data fetch still relies on backend enforcement.
- Private route groups must be dynamic and `no-store`. Verify that no private page is statically generated, ISR-cached, or served from a shared CDN cache.
- Do not cache authenticated API responses in a shared cache; scope any client cache to the session and clear it on tenant/user change.
- Render `403` for known-but-forbidden operations and `404` where revealing existence would leak sensitive records.

### 6.3 Tenant switching

If multi-tenant switching is enabled:

1. Treat it as an explicit, labeled action; never silently switch based on a URL or email domain.
2. Call the backend to set the active membership; re-fetch `/me` and capabilities.
3. Clear all tenant-scoped query caches, form state, and previously loaded lists; cancel in-flight requests.
4. Navigate to a neutral dashboard and show the new organization name.
5. If the switch fails, keep the previous tenant and show an error; never display mixed-tenant data.

### 6.4 Session expiry and recovery UX

- Show a clear, non-destructive "session expired" page/dialog with a return path after re-authentication.
- Do not lose unsaved form data silently; where safe, preserve it locally for the same session and warn before discarding.
- Distinguish unauthenticated (`401`), forbidden (`403`), not found (`404`), rate-limited (`429`), and provider outage (`503`) states.
- Provide account-recovery guidance without revealing whether an account exists.
- For privileged roles, show MFA/step-up requirements explicitly and support a retry flow.

## 7. API client and data handling

Create a centralized typed API client that:
- Uses the approved API base URL and consistent request headers.
- Handles session/CSRF requirements, locale preference, correlation/request IDs where appropriate, and abort/cancellation.
- Parses the backend's documented error envelope and maps validation errors to fields.
- Handles `401` (authentication required/expired), `403` (not permitted), `404` (not found), `409` (conflict/stale version/idempotency), `422` (validation), `429` (rate limited), and `5xx` errors consistently.
- Supports pagination and approved filters/sorts without allowing arbitrary server query expressions.
- Avoids automatic retries for non-idempotent mutations unless the API contract includes idempotency safeguards.
- Invalidates relevant caches after mutations and tenant changes.
- Never logs tokens, sensitive form content, candidate information, leave reasons, or full HR assistant prompts in browser telemetry.

Use generated TypeScript types from OpenAPI if the team adopts that workflow. Keep frontend and backend API contracts versioned and test for drift.

### 7.1 Typed client contract

```ts
// Illustrative — implementation may differ.
type ApiError = {
  error: {
    code: string;          // stable machine code
    message_key: string;   // localizable key
    message?: string;      // fallback/notification text
    details?: Array<{ field?: string; code: string; message_key: string }>;
    request_id: string;
    retryable?: boolean;
  };
};

async function apiFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept-Language", getLocale());
  headers.set("X-Request-Id", crypto.randomUUID());
  if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
  const csrf = readCsrfToken();
  if (csrf && isMutation(init.method)) headers.set("X-CSRF-Token", csrf);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw await toApiError(res);
  return res.status === 204 ? (undefined as T) : res.json();
}
```

Client rules:

- One centralized client; no ad-hoc `fetch` in components with different auth/error behavior.
- Never log request/response bodies for sensitive endpoints; log stable codes and `request_id` only.
- Generate an idempotency key once per user submission intent and reuse it for retries; do not generate a new key on retry.
- Send `If-Match`/`version` for stale-sensitive updates and surface a conflict/review path.
- Do not retry non-idempotent mutations automatically. Retry safe reads with jitter and a cap; respect `Retry-After`.
- Invalidate/refetch affected caches after mutations and tenant changes.
- Normalize dates as ISO 8601 strings at the boundary; format only at render time.

### 7.2 Error-to-UI mapping

| Backend code/status | UI behavior | User message intent |
|---|---|---|
| `401 unauthenticated/session_expired` | Redirect to sign-in with return path or show session-expired dialog | "Please sign in again." |
| `403 forbidden/mfa_required` | Access-denied page or step-up flow; do not render partial private data | "You do not have access." |
| `404 not_found` | Not-found page; avoid confirming existence | "We couldn't find that item." |
| `409 stale_version` | Keep the form, fetch latest, show comparison/refresh | "This changed since you opened it." |
| `409 idempotency_conflict` | Stop, explain, allow a new attempt with a new key | "This action was already submitted." |
| `409 invalid_state_transition/already_decided` | Refresh state, disable stale actions | "This request can no longer be changed." |
| `422 validation_error` | Map `details[].field` to controls; focus first error; announce to screen readers | Field-specific, translated |
| `425/409 operation_in_progress` | Show pending state and safe retry affordance | "Still processing…" |
| `429 rate_limited` | Disable retry until `Retry-After`, show countdown | "Too many attempts. Try again shortly." |
| `503 provider_unavailable` | Show fallback route (for AI: HR support) | "Temporarily unavailable." |
| `5xx` | Show generic error with `request_id`, no stack/provider detail | "Something went wrong." |

Never surface raw backend messages, stack traces, SQL/provider details, or internal IDs in the UI. Use `message_key` with a safe localized fallback.

### 7.3 Idempotency, concurrency, and optimistic UI

- Disable submit while a mutation is pending and show progress; still handle duplicate responses safely.
- Reuse the idempotency key across retries of the same intent; discard it after success or a definitive validation failure.
- For edits (leave, applications, content, admin config), send the record `version`; on `409`, do not overwrite—show a review-and-reapply flow.
- Optimistic UI is allowed only when the action is reversible and failure is clearly surfaced; never optimistically show an approval, publish, or deletion as final.
- After success, invalidate list/detail caches and reconcile with the server response rather than trusting client-computed state.

### 7.4 Caching and refetching

- Private data: no shared cache; use per-session in-memory query cache with explicit invalidation.
- Public content: use revalidation tags/time windows and invalidate on publish/expire events or short TTLs.
- Do not persist API responses containing personal data in service workers or offline caches unless a reviewed offline feature exists.
- On tenant/locale/session change, clear or namespace caches by tenant/user.

## 8. Feature-specific UX and behavior

### 8.1 HR knowledge assistant
- Provide a question input with clear length/usage feedback and loading, retry, empty, error, and provider-unavailable states.
- Display answer citations with document title/version/section when supplied by the API.
- Make it clear when the answer is uncertain, no approved source was found, or HR support is needed.
- Provide answer feedback and a way to flag outdated/incorrect answers.
- Do not display documents or citations the backend has not authorized for the user.
- Avoid rendering unsafe HTML. Sanitize Markdown/rich content and protect against XSS.
- Explain that the assistant is informational and does not override approved policy or human HR decisions.
- Render the API `answer_status` explicitly: `grounded` (show citations), `insufficient_evidence` (state no approved source and offer HR support), `conflicting_sources` (summarize the conflict, do not pick a winner), `stale_source` (flag and link to HR), `provider_unavailable` (retry/contact HR), `unauthorized_source` (do not reveal the source).
- Show only citations returned by the backend and only allow navigation to documents the user is authorized to access; a citation download must use the authorized, time-limited endpoint.
- Preserve the question/answer for the current session only as needed; do not place it in URLs, analytics, or long-lived browser storage.
- Make the feedback categories meaningful (incorrect, outdated, missing source, unclear, other) and confirm submission without implying an immediate policy change.

### 8.2 Leave management
- Form fields should reflect the tenant's configured leave types and policy requirements.
- Support date range, partial-day options where enabled, and reason only when policy requires it.
- Validate required fields and obvious date issues in the UI, but show server validation as authoritative.
- Present request status, submission time, approver/owner where permitted, decision comments, and next steps.
- For approvers, show only requests in their authorized scope and require an explicit action with confirmation where appropriate.
- Prevent double-click/double-submit, show pending state, and handle retry safely according to the API's idempotency contract.
- Handle stale data/conflicts with a refresh/review path rather than silently overwriting.
- Keep restricted leave reasons and comments out of analytics and logs.

### 8.3 Onboarding
- Show case progress and task owner, due date, status, and completion details according to permissions.
- Allow users to update only tasks assigned to them or otherwise explicitly permitted.
- Make blocked, overdue, completed, and waived states distinguishable without relying on color alone.
- For evidence uploads, display allowed file types/size and upload progress; explain scan/review status where relevant.
- Never expose raw object-storage keys or permanent public file URLs.

### 8.4 Recruitment
- Provide requisition status, department, location, owner, and approval state.
- Show candidate/application records only when authorized for the assigned tenant/vacancy.
- Present pipeline stages from backend configuration and prevent unsupported stage changes in the UI.
- Support interview scheduling, participant selection, status, and notification feedback.
- Use structured, role-appropriate feedback fields where defined. Avoid encouraging unnecessary sensitive or discriminatory notes.
- Clearly keep hiring decisions with authorized humans; do not present AI ranking/rejection functionality in the MVP.

### 8.5 Reports and exports
- Show only report types and filters permitted to the user.
- Explain filter scope, date range, timezone, and whether an export may contain personal data.
- For long-running exports, show queued/running/ready/failed states and expiration of download links.
- Use accessible table semantics, pagination, and clear empty states.
- Do not expose a download URL longer than necessary or cache exports in public/shared browser storage.

### 8.6 Public job, salary, and exam content
- Show source, source authority/provider, last-checked date, review date, and expiry information when applicable.
- Mark salary guidance as an estimate/range with geography and currency; avoid guaranteed-outcome language.
- Show exam authority/notification, syllabus version, pattern, and source date.
- Flag stale/expired information and direct users to official sources where appropriate.
- Include a visible content feedback path.
- Render only published, valid content returned by the public API.

### 8.7 Mock tests
- Show instructions, duration, question count, scoring rules, and submission behavior before an attempt starts.
- Keep answer keys hidden until review conditions allow them.
- Show remaining time accessibly and avoid relying on color or animation alone.
- Handle refresh, connection interruption, and expired attempts according to the backend contract; do not assume client time is authoritative.
- Submit answers safely and display the server-computed score and explanations.
- Prevent duplicate submissions in the UI while still handling retry responses correctly.
- Confirm before final submission and communicate whether answers can be changed afterward.

### 8.8 Resume builder
- Use structured fields for education, work experience, skills, and other user-provided facts.
- Allow review/editing before any generated text is saved or exported.
- Never invent qualifications, dates, employers, achievements, or experience.
- Keep profiles private by default unless explicit sharing is approved and implemented with consent and revocation controls.
- Avoid storing resume contents in client logs, analytics, or URL parameters.
- The export format and server-side document generation are open decisions in the SRS; do not commit to a format until approved.

### 8.9 Content administration
- Display clear states such as Draft, In Review, Approved, Published, Expired, and Archived.
- Provide source, locale, checked date, reviewer, review-by date, expiry date, and version fields where relevant.
- Validate required source/date metadata before submission; the backend remains authoritative.
- Show reviewer/publisher permissions and approval history.
- Require a clear confirmation for publishing, archiving, or other high-impact changes.
- Make missing or expired content metadata visible to editors rather than silently hiding the issue.
- Show a preview of the published rendering (including the source block) before publishing.
- Publish immutable versions; never silently mutate published content, and show version history/diff.
- Prevent publishing stale time-sensitive content unless an authorized, recorded override applies.

### 8.10 HR service desk

- Present the tenant's service catalog with clear categories, expected SLA, and required fields; render dynamic forms from the backend's approved form schema and validate only for usability.
- Support attachments with allowed types/size, progress, scan/review status, and removal before submission. Never show permanent storage URLs.
- Show request status history, assignee/queue where permitted, requester-visible comments, and next expected action. Internal notes must never appear in the requester view.
- Distinguish requester and HR-queue views by capability; do not rely on query parameters for scope.
- Handle SLA warning/overdue states with text plus icon, not color alone.
- Prevent duplicate submission with a pending state and idempotency key; preserve the draft on recoverable validation errors.
- After resolution/closure, offer a feedback or reopen path only if the tenant's policy supports it.

### 8.11 Notifications and reminders

- Provide an in-app notification center with unread count, filters (all/unread/mentions/approvals), mark-as-read, and deep links to the authorized destination.
- Respect notification preferences for optional channels; mandatory security/workflow notices remain visible in-app.
- Do not put sensitive content (leave reason, candidate feedback, policy text, resume data) in notification previews or page titles.
- Announce new notifications accessibly (polite live region), not by focus-stealing popups.
- Display reminder and overdue states consistently with the workflow status; deep links must re-check authorization on the destination page.
- Handle delivery lag/failure honestly: show "queued" rather than claiming an email was sent when delivery is not confirmed.
- Mark notifications for a previous tenant inaccessible after switching; clear unread state per tenant.

### 8.12 Administration and configuration

- Separate organization settings, membership, roles, leave types, approval rules, reminder rules, and service catalog into focused pages with clear save/cancel behavior.
- Show effective dates and version history for workflow configuration; warn when a change affects in-flight requests.
- Disallow self-lockout/self-escalation in the UI and mirror backend restrictions; indicate required second approval where four-eyes applies.
- Require an explicit confirmation (with a summary of impact) for role grants, retention changes, publishing, and destructive actions.
- Use optimistic concurrency; on conflict, show the latest values and require review rather than overwriting.
- Link each high-impact change to its audit event/history where the user has `audit.read`.
- Validate required fields and metadata before submission, but surface server-side validation authoritatively.
- Hide configuration pages the user cannot use; still handle direct URL access with a safe access-denied state.

### 8.13 Content editorial queue and report triage

- Provide a queue with filters for state (`draft`, `in_review`, `approved`, `published`, `expired`, `archived`), locale, content type, owner, and review/expiry date.
- Make reviewer/publisher separation visible; do not show a publish action to a user who only has edit permission.
- Sort by review-by/expiry date and highlight overdue reviews; do not rely on color alone.
- Show the affected content version and locale in every queue row so editors do not act on the wrong edition.
- Triage content reports with reason, affected content/version, reporter (if not anonymous), status, and resolution link; never expose reporter identity publicly.
- Allow statuses such as `open`, `triaged`, `resolved`, and `rejected`, with a required resolution note for closure.
- Expire/archive actions require confirmation and explain the public impact, as described in §8.9.
- Never auto-edit factual content based on a report; route it to an authorized human review.

### 8.14 Course catalogue

- Show topic, level, language, format, provider, and source-checked date; label external links and availability honestly.
- Do not imply accreditation, placement, or outcomes without approved evidence.
- Flag stale or broken links for editors; do not auto-edit factual content.
- Provide accessible filters, empty states, and pagination; support Hindi/English labels independent of course language.

### 8.15 Account, privacy, and consent

- Show which account type the user has (public career vs internal employee) and prevent UI paths that imply privilege escalation.
- Display the applicable privacy notice version and capture consent where required; record withdrawal and explain its effect.
- Provide a clear route to request access/correction/deletion where supported; do not promise immediate deletion if legal retention applies.
- Keep resume profiles and test history private by default; sharing, if approved, requires explicit consent and revocation controls.
- Provide an accessibility statement, support contact, and security-reporting route as approved.

## 9. Responsive design and accessibility

Target WCAG 2.2 AA as stated in the SRS. Test desktop, tablet, and mobile widths.

- Use semantic HTML, headings in logical order, labeled inputs, accessible names, and proper table headers.
- Ensure full keyboard operation, visible focus, sensible focus order, and no keyboard traps.
- Announce validation errors and async status updates to assistive technology.
- Maintain readable contrast, zoom/reflow support, and usable touch targets.
- Do not use color alone for status or errors; combine color with text/icon/shape.
- Make dialogs, menus, dropdowns, test timers, charts, and notifications keyboard and screen-reader accessible.
- Support reduced-motion preferences and avoid unnecessary animation.
- Keep forms usable on small screens; preserve user-entered data after recoverable errors where safe.
- Test both English and Hindi layouts with browser zoom and screen readers.
- Include automated accessibility checks and manual keyboard/screen-reader testing; automation alone is not sufficient.

### 9.1 WCAG 2.2 AA focus areas

Beyond the baseline checklist, explicitly verify the newer 2.2 criteria likely to affect this product:

| Criterion | Application in HR Assistant |
|---|---|
| 2.4.11 Focus Not Obscured | Sticky headers, cookie banners, side panels, and test timers must not hide the focused control. |
| 2.4.13 Focus Appearance | Focus indicator must be clearly visible and meet contrast/size expectations. |
| 2.5.7 Dragging Movements | Provide non-drag alternatives for pipeline boards, reordering, and scheduling. |
| 2.5.8 Target Size (Minimum) | Touch targets at least 24×24 CSS px with adequate spacing. |
| 3.2.6 Consistent Help | Keep support/help in a consistent location across pages. |
| 3.3.7 Redundant Entry | Do not ask users to re-enter data already provided in the same flow (for example leave dates, candidate details). |
| 3.3.8 Accessible Authentication | Do not require puzzle/CAPTCHA-only cognitive tests; support paste/password managers and accessible recovery. |

### 9.2 Component behavior requirements

- **Status badges:** text label + icon/shape + color; never color alone. Include a legend where statuses are dense.
- **Mock-test timer:** announce meaningful thresholds (for example 5 minutes/1 minute) via polite live region, not every second; allow pausing the announcement, not the server-authoritative clock.
- **Tables:** captions, scope-correct headers, sortable-state announcements, pagination labels, and a mobile alternative that preserves semantics.
- **Dialogs/drawers:** focus trap, labelled title, escape/close, restore focus, and no background interaction.
- **Forms:** persistent labels, field-level errors associated via `aria-describedby`, summary + focus to first error, and preserved input on recoverable failure.
- **Async updates:** loading skeletons are not a substitute for status text; announce success/failure and avoid focus jumps.
- **Charts:** provide a table/text summary; do not rely on hover-only tooltips.
- **Route changes:** move focus to the page heading/main landmark and announce the new page title.
- **Skip link/landmarks:** provide skip-to-content and consistent header/nav/main/footer landmarks.

### 9.3 Mobile-responsive implementation contract

The responsive design is part of the MVP acceptance criteria, not a later enhancement. The exact CSS breakpoints are implementation details that may be tuned through UAT; the behavior in this subsection is required at every supported width.

**Supported baseline**

- Design and test from **320 CSS px** to **1440 CSS px** and above, in portrait and landscape.
- Support current evergreen Chrome, Edge, Firefox, and Safari on desktop and mobile, plus the default Android and iOS browsers. Confirm the final device/browser matrix with product and QA (see §14).
- Do not build a native application for the MVP. The responsive web app is the mobile experience; offline write queues and background sync are out of scope.

**Width bands**

| Width band | Baseline layout behavior |
|---|---|
| 320–479 px | Compact single-column layout. Primary action remains visible without horizontal scroll. Navigation collapses to a menu/sheet. Secondary metadata may stack; tables become labelled record cards. |
| 480–767 px | Single-column forms and cards. Two columns only for short summaries or paired values. Bottom navigation may be used for internal routes. |
| 768–1023 px | Tablet layout: two-column content where useful, collapsible navigation, stacked detail panels, and full-width primary actions. Do not force a shrunken desktop sidebar. |
| 1024–1279 px | Desktop shell with navigation rail/sidebar, three-column content maximum, and reduced spacing compared with wide desktop. |
| 1280 px and above | Full desktop layout with persistent sidebar and the documented content maximum width. Reading-oriented public pages remain measure-limited. |

Breakpoints must be driven by available space rather than user-agent/device detection. Features must not be hidden merely because the viewport is small; they may be reorganized.

### 9.4 Route-level mobile behavior

- **Public header:** below the desktop navigation breakpoint, collapse all public links into an accessible menu. The menu must also contain the language switcher, sign-in/workspace action, and skip link destination; language switching must never be unavailable on mobile.
- **Internal shell:** on small screens, use a compact top bar plus bottom navigation for the highest-frequency destinations (for example Overview, HR assistant, Service desk, Leave, More). “More” opens a labelled sheet containing every remaining permitted destination, language choice, account/session actions, and sign-out. The sheet must trap focus while open, close on Escape/backdrop, and restore focus.
- **Dashboard:** stat cards reflow from four columns to two to one. Pending-action cards remain ordered by urgency; charts must include a text/table summary and must not require hover.
- **HR assistant:** conversation and citations stack. The composer must remain usable when the virtual keyboard is open and must not be covered by the bottom navigation or safe-area inset. Long answers wrap; citation tables/cards remain readable.
- **Service desk and leave:** forms are single-column on phones. Date/time controls remain reachable, required-field errors appear inline and in a summary, and the submit action does not scroll away from the final field. Approval/rejection controls remain available to authorized approvers but require an explicit confirmation or comment step.
- **Onboarding:** tasks appear as an ordered list with evidence/status actions attached to each task. Evidence selection uses the platform file picker and communicates upload/scan state; it must not depend on drag-and-drop.
- **Recruitment:** provide a list/card fallback for any pipeline or board. Stage changes must never require dragging. Candidate contact details and feedback are not placed in notification previews or page titles.
- **Reports:** summary cards and export fields stack; dense data tables render as labelled cards. Export status and any unavailable download action must be stated honestly, including expiry.
- **Notifications:** unread counts and mark-as-read actions remain visible without hover; preferences switch rows stack rather than shrinking labels.
- **Administration/config:** forms, version history, and destructive actions stack in reading order. Confirmation dialogs and impact summaries must remain fully visible at 320 px; destructive actions must not be hidden behind horizontal scroll.
- **Mock tests:** keep the timer and submission state visible without covering content. Question navigation may collapse into a disclosure, but question status must remain conveyed in text. Options and navigation controls meet the touch-target rules below. Prevent accidental double submission and warn before leaving an active attempt.
- **Auth/account states:** the two-panel sign-in layout becomes a single column; marketing/brand content must not block access to the form. Session-expired, access-denied, and recovery states use full-width actions on phones.

### 9.5 Touch, viewport, and content rules

- Target **44×44 CSS px** for primary touch controls and navigation items; never fall below the WCAG 2.2 minimum of 24×24 CSS px, including spacing.
- Respect `env(safe-area-inset-*)` for fixed headers, bottom navigation, sheets, and toasts on notched devices.
- Do not make critical actions hover-only. Hover may enhance affordance only.
- Use at least 16 px text in primary mobile inputs to avoid unwanted browser zoom; keep body text readable and allow browser text resizing without loss of content.
- Avoid fixed-position form fields and sticky footers that obscure the focused input when the virtual keyboard opens. After focus, scroll the field and its error message fully into view.
- Keep sticky headers, timers, banners, and toasts from obscuring focused controls (WCAG 2.4.11). Use appropriate `scroll-margin`/scroll padding and a compact mobile header.
- Wrap long identifiers, emails, and unbroken content; truncate only where the full value is available through an accessible label, copy action, or detail view.
- Do not require horizontal scrolling for page content. If a genuinely unavoidable dense visualization remains, provide a labelled alternative and a visible scroll affordance; it must not be the only way to complete a task.
- Preserve semantics when tables become cards: each card value retains its column label, and interactive controls keep accessible names.
- Reflow at 200% browser zoom and at 400% zoom/320 CSS px equivalent without two-dimensional scrolling, clipped content, or hidden actions.
- Maintain state and entered data across orientation changes and recoverable validation errors.
- Reduce non-essential animation and honor `prefers-reduced-motion`; loading and async state must still be announced in text.
- On slow or interrupted mobile networks, show honest pending/offline states and retry controls. Do not claim a save or notification delivery succeeded until the server confirms it.

### 9.6 Responsive test matrix and acceptance

At minimum, exercise these representative viewports (or equivalent browser-emulated sizes) in both `en` and `hi`:

| Viewport | Orientation | Focus |
|---|---|---|
| 320×568 | Portrait | Reflow, no clipping, bottom-sheet dialogs, mock-test options |
| 360×800 | Portrait | Android-like touch targets, keyboard behavior, internal navigation sheet |
| 390×844 | Portrait | iOS-like safe areas, sign-in, composer, sticky action groups |
| 768×1024 | Portrait and landscape | Tablet two-column behavior, tables/cards, permissions |
| 1024×768 | Landscape | Sidebar breakpoint transition, dense tables |
| 1280×800 | Landscape | Standard desktop shell |
| 1440×900 | Landscape | Wide layout and reading measure |

Required responsive acceptance checks:

- Every permitted MVP task can be completed at 320 px width, including sign-in, asking the assistant, submitting leave/service requests, onboarding task updates, recruitment stage changes, report/export actions, notification preferences, and authorized content/admin actions.
- No horizontal page scroll, clipped labels, unreachable buttons, or focus-obscured controls in the tested flows.
- Navigation, language switching, session expiry, access denied, and sign-out remain reachable at every width.
- Forms retain data after recoverable validation/network errors; virtual-keyboard use does not hide the active field or its error.
- Tables/cards preserve header semantics, and status is conveyed by text plus shape/icon as well as color.
- Dialogs/sheets trap focus, close with Escape where applicable, and restore focus.
- Touch targets and spacing meet §9.5; zoom/reflow and reduced-motion checks pass.
- No private HR data appears in page titles, notification previews, responsive off-canvas markup, or hidden mobile-only DOM that the user is not authorized to see.

## 10. Frontend security checklist

- [ ] Private HR routes and data are never statically published or shared-cacheable.
- [ ] No secret or private HR data is embedded in public page props or client bundles.
- [ ] Auth/session expiration and access-denied flows are handled.
- [ ] Tenant switch clears/refetches tenant-scoped data and local state.
- [ ] UI permission checks are not relied on as security controls.
- [ ] All mutations use the approved CSRF/session scheme.
- [ ] Unsafe HTML/Markdown is sanitized; output is encoded appropriately.
- [ ] File upload UI enforces usability limits while backend enforces security limits and scanning.
- [ ] Sensitive fields are excluded from browser logs, analytics, URLs, and error reporting.
- [ ] CSP and other security headers are configured in coordination with deployment/backend.
- [ ] Dependencies are pinned and scanned; secrets are scanned in CI.
- [ ] No credentials or tokens are committed to source control.
- [ ] Error pages do not expose stack traces, provider details, or internal identifiers.
- [ ] Public career APIs and pages expose only published public content.
- [ ] Resume profiles, test history, candidate data, and HR records are scoped to the owner/authorized role.
- [ ] No access/refresh tokens or private records are stored in `localStorage`/`sessionStorage` or exposed in URLs.
- [ ] CSP is defined with explicit sources; inline scripts are nonce/hash-based; unsafe HTML is sanitized server-side and client-side.
- [ ] No PII, free-text leave reasons, candidate feedback, resume contents, or assistant prompts are sent to analytics/error reporting.
- [ ] Consent/privacy-notice version is displayed and captured where required; withdrawal is handled.
- [ ] If a Next.js BFF exists, it forwards auth/CSRF safely, never bypasses FastAPI authorization, and is excluded from public caching.
- [ ] Source maps and build artifacts do not expose internal endpoints, secrets, or private fixture data.
- [ ] External links/course URLs are validated and use safe `rel` attributes where opened in a new context.

## 11. Frontend testing strategy

- **Unit tests:** formatting, localization fallback, validation helpers, state transitions, API error mapping.
- **Component tests:** forms, tables, status badges, dialogs, citation display, upload controls, mock-test timer.
- **API contract tests:** frontend assumptions match OpenAPI schemas and error behavior.
- **End-to-end tests:** sign-in, locale switch, leave submission/approval, onboarding task update, recruitment stage update, content publish/review, mock-test attempt, resume edit.
- **Authorization UX tests:** employee cannot see approver-only actions; public user cannot see internal navigation; unauthorized API response is handled safely.
- **Tenant-switch tests:** stale data is cleared and the new tenant's data is fetched.
- **Localization tests:** English/Hindi strings, dates, currency, text expansion, missing translations, mixed-language content.
- **Accessibility tests:** automated scans plus keyboard, screen-reader, zoom, contrast, and error-state checks.
- **Security tests:** XSS, unsafe Markdown, CSRF integration, cache leakage, sensitive data in logs/URLs, upload UX edge cases.
- **Responsive tests:** minimum 320 px phone, common 360/390 px phones, tablet portrait/landscape, 1024 px sidebar transition, and 1280/1440 px desktop; include both locales, 200% zoom, 400% reflow, virtual-keyboard interaction, safe-area insets, and orientation changes. Verify task parity across widths, not just that pages render.
- **Performance tests:** route loading, large tables, public content rendering, and mock-test interactions.

Use synthetic data in development/test/staging. Include negative cases, not only happy paths.

### 11.1 Use-case coverage (SRS §10)

| Use case | Frontend scenarios |
|---|---|
| UC-01 Ask policy | Grounded citations, insufficient/stale/conflicting states, provider outage, feedback, sanitized Markdown, Hindi rendering |
| UC-02 Submit leave | Dynamic fields, date validation, overlap/balance errors, duplicate submit, draft recovery, mobile layout |
| UC-03 Approve leave | Approver inbox scope, stale-screen conflict, confirm/comment, already-decided state, success announcement |
| UC-04 Onboarding task | Assigned-only update, evidence upload/scan states, blocked/overdue/waived badges, progress view |
| UC-05 Candidate stage | Authorized pipeline, valid/invalid transitions, confirmation, audit/history visibility, hidden candidate data |
| UC-06 Publish content | Draft metadata validation, reviewer/publisher separation, preview, publish confirmation, expire/archive |
| UC-07 Mock test | Instructions, timer/resume, autosave/offline handling, submit confirmation, answer-key gating, result/review |
| UC-08 Export report | Scope/filters explanation, queued/running/ready/failed states, link expiry, accessible tables |

### 11.2 Tooling and test data

- Use Playwright for end-to-end flows, Testing Library for components, axe for automated accessibility, and MSW or a test API for deterministic contract behavior.
- Generate TypeScript types from OpenAPI and fail CI on schema drift.
- Test both `en` and `hi` for every screen; include long strings, Devanagari, mixed script, and text expansion.
- Use fake timers for mock-test countdown/expiry tests; server time remains authoritative.
- Include cross-tenant, IDOR, stale-version, rate-limit, and provider-outage scenarios in E2E/contract suites.
- Run visual regression on public pages and critical internal forms in both locales and representative viewports.
- Verify no private data appears in the static build, RSC payloads, browser cache, analytics events, or error reports.

## 12. Recommended implementation sequence

1. **Discovery and UI sign-off:** validate personas, navigation, role matrix, workflows, English/Hindi content ownership, accessibility target, and responsive breakpoints.
2. **Frontend foundation:** Next.js setup, routing, design tokens/components, locale framework, API client, error handling, authentication integration, protected route patterns, telemetry redaction, and CI.
3. **Core MVP and HR assistant:** dashboards/navigation, assistant question/answer/citations/fallback, leave request/status/approval screens, basic onboarding views.
4. **Career and recruitment:** public job/exam/course pages, mock-test flows, resume profile, requisition and application pipeline, interview scheduling, and content review UI.
5. **Reports, reminders, and release readiness:** report tables/exports, notification states, administration, accessibility/security review, UAT, browser testing, and production cache review.
6. **Post-launch improvement:** analyze approved, privacy-safe feedback and usage metrics; improve usability, localization, accessibility, and performance.

Security, privacy, accessibility, QA, and content governance continue across all phases.

## 13. Frontend acceptance criteria

A frontend feature is ready when:
- Its SRS requirement IDs are mapped to implementation and tests.
- English and Hindi UI strings are present or a documented translation gap is approved.
- Loading, empty, success, validation, permission-denied, network-error, and retry states are implemented where relevant.
- Private data cannot leak through public/static output, browser cache, URLs, analytics, or client logs.
- Backend authorization errors are handled safely and no UI-only authorization assumption exists.
- Keyboard and screen-reader operation is tested for the feature.
- Both locales are tested at phone, tablet, and desktop widths; no horizontal page scroll or clipped actions occur at 320 px, and the full authorized task is completable on mobile.
- Virtual-keyboard, safe-area, dialog/sheet, touch-target, 200% zoom, and 400% reflow checks pass for the feature.
- API contracts and end-to-end tests pass.
- Product/HR owners have completed applicable UAT.

## 14. Open decisions — do not silently assume

The SRS does not finalize:
- Identity provider, login/MFA, account recovery, session model, and employee provisioning.
- Final route/sitemap, design system, brand, and visual design.
- Whether Next.js uses a backend-for-frontend (BFF) route layer or calls FastAPI directly.
- Locale URL strategy versus account preference and how locale is persisted.
- Exact permissions and tenant-switching behavior.
- Leave form fields, partial-day rules, required reason fields, status transition UI, and approval hierarchy.
- Which internal roles can view each report/export and which fields exports may contain.
- Resume export format, server-side generation, and whether sharing is supported.
- AI provider behavior, citation schema, feedback categories, and approved fallback contact route.
- Hindi translation/review owners and source-of-truth content.
- Final accessibility testing ownership and browser/device support matrix.

## 15. Traceability and change management

Map every relevant SRS requirement ID to:
- Route/page/component/feature.
- API endpoint and contract.
- Unit/component/E2E/accessibility/security tests.
- Backlog item, acceptance criteria, and UAT evidence.
- Owner, status, and release/version.

Changes to navigation, roles, workflow states, localization, privacy, or API contracts must include rationale, impact assessment, approval owner, priority, and version history.

## Appendix A — SRS requirement traceability (frontend)

| ID | Requirement (abbreviated) | Route/feature | Key UX/security behavior | Tests |
|---|---|---|---|---|
| FR-001 | Authenticate/authorize | Auth guard, API client | Cookie session, 401/403 handling | E2E, security |
| FR-002 | Tenant scope | Layout/tenant switch | Re-fetch and clear caches on switch | Tenant-switch |
| FR-003 | Account separation | Public vs internal navigation | No privilege path from public account | Authorization UX |
| FR-004 | English/Hindi | `[locale]`, messages | Complete dictionaries, fallback flagged | Localization |
| FR-005 | Policy retrieval | HR assistant | Citation rendering | Component/E2E |
| FR-006 | Citations/fallback | HR assistant | `answer_status`, HR route | E2E, AI UX |
| FR-007 | Prompt safety | HR assistant | Sanitized output, no unauthorized citations | Security |
| FR-008 | HR service requests | Service desk | Catalog forms, comments, attachments | E2E |
| FR-009 | Leave submission | Leave form | Dynamic rules, pending state | E2E |
| FR-010 | Leave validation | Leave form | Field/date/overlap errors, authoritative server errors | Validation |
| FR-011 | Approval | Approver inbox/detail | Scoped actions, stale conflict | E2E |
| FR-012 | Notifications | Notification center | Preferences, accessible announcements | Component/E2E |
| FR-013 | Onboarding templates | Admin onboarding | Template versioning | E2E |
| FR-014 | Onboarding tracking | Cases/tasks | Owner/due/status/evidence | E2E |
| FR-015 | Document access | Uploads/evidence | Type/size/scan, no raw URLs | Security |
| FR-016 | Requisitions | Recruitment | Approval state, publication gate | E2E |
| FR-017 | Pipeline | Application board/detail | Valid transitions, confirmation | E2E |
| FR-018 | Interviews | Scheduling | Participants, notifications, conflicts | E2E |
| FR-019 | Candidate privacy | Recruitment views | Scoped rendering, consent/notice | Security |
| FR-020 | Reports/exports | Reports | Scope explanation, async states, link expiry | E2E |
| FR-021 | Reminder rules | Admin reminders | Effective dates, validation | Component |
| FR-022 | Job content | Public jobs | Source/checked/expiry display | Content |
| FR-023 | Salary guidance | Public salary | Range/estimate/geography/currency | Content |
| FR-024 | Exam content | Public exams | Authority/syllabus/source date | Content |
| FR-025 | Mock tests | Test flow | Timer/resume/autosave/review gating | E2E |
| FR-026 | Resume builder | Resume | Fact-based fields, private default | E2E/privacy |
| FR-027 | Courses | Courses | Provider/level/language/date | Component |
| FR-028 | Content review | Editorial queue | Draft/review/publish/expire/archive | E2E |
| FR-029 | Audit trail | Audit viewer | Scoped read-only history | E2E |
| FR-030 | Administration | Admin pages | Scoped config, confirmations | E2E |
| FR-031 | Retention/deletion | Retention screens | Hold-aware request/status | E2E |
| FR-032 | Accessibility | All routes | WCAG 2.2 AA target | a11y |
| FR-033 | API documentation | API client/contracts | Typed schemas, error codes | Contract |
| FR-034 | Idempotency | All mutations | One key per intent, no duplicate submit | E2E |
| FR-035 | Content feedback | Public/internal reports | Rate limit, confirmation, triage | E2E |

Cross-cutting NFR coverage: NFR-01, NFR-02, NFR-05, and NFR-06 are covered by §6, §7, and §10; NFR-11 and NFR-12 by §5 and §9; NFR-07, NFR-13, and NFR-14 by §3.2, §7, and §11. NFR-03, NFR-04, NFR-08, NFR-09, NFR-10, NFR-15, and NFR-16 are backend/deployment-owned but require visible session, outage, and access-denied UX.

## Appendix B — Status label, tone, and bilingual contract

Statuses come from SRS Appendix B. Labels must be rendered as text plus icon/shape; color alone is insufficient. Hindi strings below are **draft** and require the approved language reviewer.

| Object | Code | English label | Hindi label (draft) | Tone |
|---|---|---|---|---|
| Leave | `draft` | Draft | प्रारूप | Neutral |
| Leave | `pending` | Pending | लंबित | Info |
| Leave | `needs_clarification` | Needs clarification | स्पष्टीकरण आवश्यक | Warning |
| Leave | `approved` | Approved | स्वीकृत | Success |
| Leave | `rejected` | Rejected | अस्वीकृत | Danger |
| Leave | `cancelled` | Cancelled | रद्द | Neutral |
| Onboarding task | `not_started` | Not started | प्रारंभ नहीं हुआ | Neutral |
| Onboarding task | `in_progress` | In progress | प्रगति पर | Info |
| Onboarding task | `blocked` | Blocked | अवरुद्ध | Warning |
| Onboarding task | `completed` | Completed | पूर्ण | Success |
| Onboarding task | `waived` | Waived | छूट दी गई | Neutral |
| Requisition | `draft` | Draft | प्रारूप | Neutral |
| Requisition | `pending_approval` | Pending approval | स्वीकृति लंबित | Info |
| Requisition | `approved` | Approved | स्वीकृत | Success |
| Requisition | `open` | Open | खुला | Success |
| Requisition | `on_hold` | On hold | रोका गया | Warning |
| Requisition | `closed` | Closed | बंद | Neutral |
| Requisition | `cancelled` | Cancelled | रद्द | Danger |
| Application | `received` | Received | प्राप्त | Neutral |
| Application | `screening` | Screening | स्क्रीनिंग | Info |
| Application | `interview` | Interview | साक्षात्कार | Info |
| Application | `offer` | Offer | प्रस्ताव | Success |
| Application | `hired` | Hired | नियुक्त | Success |
| Application | `rejected` | Rejected | अस्वीकृत | Danger |
| Application | `withdrawn` | Withdrawn | वापस लिया | Neutral |
| Career content | `draft` | Draft | प्रारूप | Neutral |
| Career content | `in_review` | In review | समीक्षा में | Info |
| Career content | `approved` | Approved | स्वीकृत | Success |
| Career content | `published` | Published | प्रकाशित | Success |
| Career content | `expired` | Expired | समाप्त | Warning |
| Career content | `archived` | Archived | संग्रहीत | Neutral |
| Mock attempt | `in_progress` | In progress | प्रगति पर | Info |
| Mock attempt | `submitted` | Submitted | जमा | Info |
| Mock attempt | `evaluated` | Evaluated | मूल्यांकित | Success |
| Mock attempt | `abandoned` | Abandoned | छोड़ा गया | Neutral |

Rules: unknown status codes render a neutral "Unknown status" with a safe fallback; never guess from an HTTP status; keep labels in message dictionaries, not conditionals inside components.

## Appendix C — Page-state contract

Every data-driven screen should define these states before implementation:

| State | Expected UI |
|---|---|
| Initial loading | Accessible skeleton/progress text; no private placeholder data |
| Empty (no records) | Explanation + permitted primary action |
| Empty (no results for filters) | Clear filters/reset action |
| Validation error | Field association, summary, focus management, preserved input |
| Permission denied | 403 page, no partial data, route back to safe area |
| Not found | 404 page without existence disclosure |
| Conflict/stale | Latest data + review/reapply, never silent overwrite |
| Rate limited | Countdown from `Retry-After`, disabled retry |
| Provider outage | Fallback route (AI → HR support; email → in-app state) |
| Session expired | Modal/page with return path; safe draft preservation |
| Partial data | Label unavailable sections; do not fabricate values |
| Success | Confirmation with status/next step and cache refresh |
| Offline/interrupted | Honest banner, retry; mock-test autosave state explained |

## Appendix D — Frontend gap register

| Gap | Impact | Proposed resolution | Owner |
|---|---|---|---|
| F-01: No service-desk screens in v1.0 | FR-008 cannot be used | Add service desk + queue + detail flows (§8.10) | Product/HR Ops |
| F-02: No notification center | Users miss approvals/reminders | Add notification center/preferences (§8.11) | Product |
| F-03: Admin/config UI unspecified | FR-030 would require manual DB changes | Add scoped admin pages (§8.12) | Product/Security |
| F-04: Content editor/report triage unspecified | FR-028/FR-035 incomplete | Add editorial queue/report triage (§8.13) | Content owner |
| F-05: Answer-status/citation schema unspecified | Inconsistent AI UX | Adopt backend contract (§8.1) | Product/AI owner |
| F-06: Status labels not defined bilingually | Inconsistent states | Adopt Appendix B with language review | Content owner |
| F-07: No explicit rendering/cache decision | Private-data leakage risk | Adopt §3.2 and verify build output | Architecture/Security |
| F-08: BFF decision open | Auth/caching ambiguity | Decide before implementing `app/api` routes | Architecture |
| F-09: Locale URL vs preference open | SEO/deep-link inconsistency | Adopt §5.1 after product review | Product |
| F-10: Resume export/sharing open | Privacy/UI rework risk | Keep private and defer export until approved | Product/Privacy |
| F-11: Retention/DSAR UX unspecified | FR-031 not operable | Add hold-aware request/status screens | Legal/Product |
| F-12: Mock-test resume/autosave contract open | Attempt loss/duplicate submits | Agree attempt-state contract with backend | Product/Engineering |

## Appendix E — Cross-document consistency

- API paths, permission codes, status codes, and state machines must match `backend.md` §7, §8.15, and Appendix B of the SRS.
- Any change to a status, permission, error code, or route requires updates to both engineering guides and the traceability matrix.
- Backend authorization is authoritative; frontend capability checks are presentation and route-hygiene only.
- The SRS remains the source of truth for requirements. Where this guide proposes a resolution to an SRS gap, it is explicitly marked as a proposal pending stakeholder approval.
