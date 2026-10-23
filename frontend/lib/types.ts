export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface User {
  id: UUID;
  email: string;
  full_name: string;
  user_type: "internal" | "public" | string;
  status: string;
  locale: "en" | "hi" | string;
  timezone: string;
  last_login_at: ISODateTime | null;
}

export interface Tenant {
  id: UUID;
  name: string;
  slug: string;
  default_locale: string;
  timezone: string;
  status: string;
}

export interface Membership {
  id: UUID;
  tenant_id: UUID;
  status: string;
}

export interface Me {
  user: User;
  active_tenant: Tenant | null;
  membership: Membership | null;
  roles: string[];
  permissions: string[];
  audience: "hr-api-internal" | "career-api-public" | string;
}

export interface LocalePreference {
  locale: string;
}

export interface FormProperty {
  type?: string;
  title?: string;
  enum?: string[];
  description?: string;
}

export interface FormSchema {
  required?: string[];
  properties?: Record<string, FormProperty>;
}

export interface CatalogItem {
  id: UUID;
  code: string;
  name_en: string;
  name_hi: string | null;
  description: string | null;
  form_schema: FormSchema;
  sla_hours: number;
  queue_code: string;
  active?: boolean;
  version?: number;
}

export interface ServiceRequest {
  id: UUID;
  catalog_item_id: UUID;
  requester_user_id: UUID;
  assignee_user_id: UUID | null;
  subject: string;
  description: string;
  form_data: Record<string, unknown>;
  priority: "low" | "normal" | "high" | "urgent" | string;
  status: string;
  sla_due_at: ISODateTime;
  resolved_at: ISODateTime | null;
  closed_at: ISODateTime | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ServiceRequestComment {
  id: UUID;
  request_id: UUID;
  author_user_id: UUID;
  body: string;
  visibility: "requester" | "internal" | string;
  created_at: ISODateTime;
}

export interface LeaveType {
  id: UUID;
  code: string;
  name_en: string;
  name_hi: string | null;
  unit: string;
  requires_approval: boolean;
  allow_half_day: boolean;
  active?: boolean;
  version?: number;
}

export interface LeaveBalance {
  id: UUID;
  leave_type_id: UUID;
  period_start: ISODate;
  period_end: ISODate;
  entitled: string;
  consumed: string;
  pending: string;
  carried_forward: string;
}

export interface LeaveRequest {
  id: UUID;
  employee_id: UUID;
  leave_type_id: UUID;
  start_at: ISODateTime;
  end_at: ISODateTime;
  partial_day: boolean;
  reason: string | null;
  status: string;
  submitted_at: ISODateTime | null;
  decided_at: ISODateTime | null;
  current_approver_user_id: UUID | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Holiday {
  date: ISODate;
  name: string;
  working_day_override: boolean;
}

export interface LeaveCalendar {
  calendar_id: UUID;
  name: string;
  timezone: string;
  holidays: Holiday[];
}

export interface OnboardingTemplateTask {
  id: UUID;
  title: string;
  description: string | null;
  owner_rule: string;
  due_offset_days: number;
  required_evidence: boolean;
  position: number;
}

export interface OnboardingTemplate {
  id: UUID;
  name: string;
  status: string;
  version: number;
  created_at: ISODateTime;
  tasks: OnboardingTemplateTask[];
}

export interface OnboardingTask {
  id: UUID;
  case_id: UUID;
  title: string;
  owner_user_id: UUID;
  status: string;
  due_at: ISODateTime | null;
  completed_at: ISODateTime | null;
  evidence_document_id: UUID | null;
  version: number;
}

export interface OnboardingProgress {
  total: number;
  completed: number;
  percent: number;
}

export interface OnboardingCase {
  id: UUID;
  employee_id: UUID;
  template_id: UUID;
  start_date: ISODate;
  status: string;
  created_at: ISODateTime;
  progress: OnboardingProgress | null;
  tasks: OnboardingTask[];
}

export interface Requisition {
  id: UUID;
  title: string;
  department_id: UUID | null;
  location: string | null;
  employment_type: string;
  description: string;
  status: string;
  version: number;
  approved_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface Candidate {
  id: UUID;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: ISODateTime;
}

export interface Application {
  id: UUID;
  requisition_id: UUID;
  candidate_id: UUID;
  stage: string;
  status: string;
  applied_at: ISODateTime;
  version: number;
}

export interface Interview {
  id: UUID;
  application_id: UUID;
  scheduled_at: ISODateTime;
  duration_minutes: number;
  timezone: string;
  mode: string;
  location: string | null;
  status: string;
  version: number;
}

export interface ReportSummary {
  leave_pending: number;
  service_open: number;
  onboarding_active: number;
  applications_active: number;
  generated_at: ISODateTime;
}

export interface ReportExport {
  id: UUID;
  report_type: string;
  filters: Record<string, unknown>;
  requested_fields: unknown[];
  status: string;
  expires_at: ISODateTime | null;
  error_code: string | null;
  created_at: ISODateTime;
  completed_at: ISODateTime | null;
}

export interface Notification {
  id: UUID;
  channel: string;
  template_code: string;
  locale: string;
  subject: string;
  body: string;
  status: string;
  created_at: ISODateTime;
  read_at: ISODateTime | null;
}

export interface NotificationPreference {
  channel: string;
  enabled: boolean;
}

export interface DocumentRecord {
  id: UUID;
  owner_type: string;
  owner_id: UUID;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  scan_status: string;
  classification: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CareerContent {
  id: UUID;
  content_type: "article" | "job" | "salary" | "exam" | string;
  title: string;
  slug: string;
  locale: string;
  summary: string | null;
  body: string;
  source: string | null;
  source_checked_at: ISODate | null;
  effective_from: ISODate | null;
  expires_at: ISODate | null;
  geography: string | null;
  currency: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_is_estimate: boolean;
  exam_authority: string | null;
  syllabus_version: string | null;
  published_at: ISODateTime | null;
  salary_disclaimer: string | null;
  status?: string;
  version?: number;
}

export interface Course {
  id: UUID;
  title: string;
  provider: string;
  provider_url: string;
  locale: string;
  level: string;
  format: string;
  topic: string | null;
  source_checked_at: ISODate;
  published_at: ISODateTime | null;
  status?: string;
  expires_at?: ISODate | null;
  version?: number;
}

export interface MockTest {
  id: UUID;
  title: string;
  description: string | null;
  locale: string;
  duration_minutes: number;
  pass_score: number;
  status?: string;
}

export interface QuestionOption {
  id: string;
  text?: string;
  label?: string;
  [key: string]: unknown;
}

export interface QuestionSafe {
  id: UUID;
  position: number;
  prompt: string;
  options: QuestionOption[];
  max_score: number;
}

export interface Attempt {
  id: UUID;
  test_id: UUID;
  status: string;
  started_at: ISODateTime;
  expires_at: ISODateTime;
  submitted_at: ISODateTime | null;
  score: number | null;
  max_score: number | null;
  questions: QuestionSafe[];
}

export interface AttemptSubmitResult {
  attempt_id: UUID;
  status: string;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
}

export interface ReviewQuestion {
  question_id: UUID;
  prompt: string;
  options: QuestionOption[];
  answer: { option_id?: string } | null;
  correct_answer: { option_id?: string } & Record<string, unknown>;
  explanation: string | null;
  is_correct: boolean | null;
  score: number | null;
}

export interface AttemptReview {
  attempt_id: UUID;
  score: number | null;
  max_score: number | null;
  passed: boolean | null;
  questions: ReviewQuestion[];
}

export interface ResumeExperience {
  title?: string;
  company?: string;
  from?: string;
  to?: string;
  summary?: string;
}

export interface ResumeEducation {
  institution?: string;
  qualification?: string;
  year?: string;
}

export interface ResumeProfileData {
  skills?: string[];
  experience?: ResumeExperience[];
  education?: ResumeEducation[];
  languages?: string[];
  [key: string]: unknown;
}

export interface ResumeProfile {
  id: UUID;
  headline: string | null;
  summary: string | null;
  data: ResumeProfileData;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Role {
  id: UUID;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
}

export interface AdminMembership {
  id: UUID;
  user_id: UUID;
  status: string;
  created_at: ISODateTime;
  user: User | null;
  roles: string[];
}

export interface TenantSettings {
  name: string;
  default_locale: string;
  timezone: string;
  settings: Record<string, unknown>;
  version: number;
}

export interface ApprovalStep {
  id: UUID;
  step_order: number;
  approver_type: string;
  approver_role_id: UUID | null;
  approver_user_id: UUID | null;
  escalate_after_hours: number | null;
}

export interface ApprovalRule {
  id: UUID;
  code: string;
  name: string;
  entity_type: string;
  active: boolean;
  effective_from: ISODate;
  version: number;
  steps: ApprovalStep[];
}

export interface ReminderRule {
  id: UUID;
  name: string;
  entity_type: string;
  offset_hours: number;
  repeat_interval_hours: number | null;
  max_repeats: number;
  recipients: Record<string, unknown>;
  channel: string;
  active: boolean;
  effective_from: ISODate;
  version: number;
}

export interface ContentReport {
  id: UUID;
  content_type: string;
  content_id: UUID;
  reason_category: string;
  comment: string | null;
  status: string;
  resolution: string | null;
  created_at: ISODateTime;
}

export interface DeletionRequest {
  id: UUID;
  requester_user_id: UUID;
  subject_type: string;
  subject_id: UUID;
  scope: Record<string, unknown>;
  status: string;
  approved_by: UUID | null;
  evidence: Record<string, unknown>;
  created_at: ISODateTime;
  completed_at: ISODateTime | null;
}

export interface LegalHold {
  id: UUID;
  target_type: string;
  target_id: UUID;
  reason: string;
  status: string;
  applied_by: UUID;
  applied_at: ISODateTime;
  released_at: ISODateTime | null;
}

export interface AuditEvent {
  id: UUID;
  actor_user_id: UUID | null;
  actor_type: string;
  action: string;
  target_type: string | null;
  target_id: UUID | null;
  outcome: string;
  request_id: string | null;
  metadata_json: Record<string, unknown>;
  occurred_at: ISODateTime;
}

export interface AssistantModel {
  name: string;
  version: string;
  provider?: string | null;
}

export interface AssistantCitation {
  document_id: UUID;
  title: string;
  version: string;
  locale: string;
  section: string | null;
  effective_from: string | null;
  url: string;
}

export interface AssistantFallback {
  reason?: string;
  request_type?: string;
  [key: string]: unknown;
}

export interface AssistantAnswer {
  query_log_id: UUID;
  request_id: string;
  answer: string;
  answer_status: string;
  citations: AssistantCitation[];
  fallback: AssistantFallback | null;
  model: AssistantModel;
}

export interface ContentAdmin {
  id: UUID;
  content_type: string;
  title: string;
  slug: string;
  locale: string;
  summary: string | null;
  body: string;
  source: string | null;
  source_checked_at: ISODate | null;
  effective_from: ISODate | null;
  expires_at: ISODate | null;
  geography: string | null;
  currency: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_is_estimate: boolean;
  exam_authority: string | null;
  syllabus_version: string | null;
  status: string;
  version: number;
  published_at: ISODateTime | null;
  created_at?: ISODateTime;
  updated_at?: ISODateTime;
}

export interface CourseAdmin extends Course {
  status: string;
  version: number;
}

export interface TestAdmin extends MockTest {
  status: string;
  created_at?: ISODateTime;
}

export interface RoleDetail {
  id: UUID;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
}

export interface SettingsResponse {
  name: string;
  default_locale: string;
  timezone: string;
  settings: Record<string, unknown>;
  version: number;
}

export interface CalendarOut {
  calendar_id: UUID;
  name: string;
  timezone: string;
  holidays: Holiday[];
}

export interface Decision {
  id: UUID;
  request_id: UUID;
  actor_user_id: UUID;
  decision: string;
  comment: string | null;
  created_at: ISODateTime;
}
