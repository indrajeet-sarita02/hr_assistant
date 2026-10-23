export function hasPermission(
  permissions: string[] | null | undefined,
  permission: string,
): boolean {
  return Boolean(permissions?.includes(permission));
}

export function hasAnyPermission(
  permissions: string[] | null | undefined,
  required: readonly string[],
): boolean {
  if (!permissions || permissions.length === 0) return false;
  return required.some((permission) => permissions.includes(permission));
}

export const permissions = {
  assistant: "hr_assistant.query",
  assistantFeedback: "hr_assistant.feedback",
  serviceCreate: "service_request.create",
  serviceReadOwn: "service_request.read_own",
  serviceReadQueue: "service_request.read_queue",
  serviceUpdate: "service_request.update_assigned",
  leaveCreate: "leave.request.create",
  leaveReadOwn: "leave.request.read_own",
  leaveReadScope: "leave.request.read_scope",
  leaveDecide: "leave.request.decide",
  leaveCancelOwn: "leave.request.cancel_own",
  leaveTypeManage: "leave.type.manage",
  onboardingRead: "onboarding.case.read",
  onboardingCreate: "onboarding.case.create",
  onboardingTask: "onboarding.task.update_assigned",
  onboardingTemplate: "onboarding.template.manage",
  recruitmentManage: "recruitment.requisition.manage",
  recruitmentApprove: "recruitment.requisition.approve",
  recruitmentApplications: "recruitment.application.read_assigned",
  recruitmentApplicationCreate: "recruitment.application.create",
  recruitmentStage: "recruitment.application.stage.update",
  recruitmentInterview: "recruitment.interview.schedule",
  reportRead: "report.read",
  reportExport: "report.export",
  notificationRead: "notification.read_own",
  resumeManage: "resume.manage_own",
  assessmentOwn: "assessment.attempt_own",
  contentEdit: "career_content.edit",
  contentReview: "career_content.review",
  contentPublish: "career_content.publish",
  contentReportTriage: "content_report.triage",
  courseManage: "course.manage",
  assessmentManage: "assessment.manage",
  adminMembers: "admin.membership.manage",
  adminSettings: "admin.settings.manage",
  adminWorkflow: "admin.workflow.manage",
  auditRead: "audit.read",
  retentionManage: "retention.manage",
  legalHoldManage: "legal_hold.manage",
} as const;

export function canAccessAnyAdmin(perms: string[] | null | undefined): boolean {
  return hasAnyPermission(perms, [
    permissions.adminMembers,
    permissions.adminSettings,
    permissions.adminWorkflow,
    permissions.leaveTypeManage,
    permissions.auditRead,
    permissions.retentionManage,
    permissions.legalHoldManage,
    permissions.contentEdit,
    permissions.contentReview,
    permissions.contentReportTriage,
  ]);
}
