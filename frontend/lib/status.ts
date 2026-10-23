import type { Translator } from "./i18n";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const statusTones: Record<string, StatusTone> = {
  draft: "neutral",
  pending: "info",
  pending_approval: "info",
  needs_clarification: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  not_started: "neutral",
  in_progress: "info",
  blocked: "warning",
  completed: "success",
  waived: "neutral",
  open: "info",
  on_hold: "warning",
  closed: "neutral",
  received: "neutral",
  screening: "info",
  interview: "info",
  offer: "success",
  hired: "success",
  withdrawn: "neutral",
  in_review: "info",
  published: "success",
  expired: "warning",
  archived: "neutral",
  submitted: "info",
  evaluated: "success",
  abandoned: "neutral",
  resolved: "success",
  waiting_on_requester: "warning",
  active: "success",
  inactive: "neutral",
  sent: "info",
  read: "neutral",
  queued: "info",
  running: "info",
  ready: "success",
  failed: "danger",
  executed: "success",
  reviewing: "info",
  dismissed: "neutral",
  grounded: "success",
  insufficient_evidence: "warning",
  exempt: "neutral",
  enabled: "success",
  disabled: "neutral",
};

export function statusTone(status: string): StatusTone {
  return statusTones[status] ?? "neutral";
}

export function statusLabel(t: Translator, status: string): string {
  const key = `status.${status}`;
  const label = t(key);
  return label === key ? t("status.unknown") : label;
}

const labelToStatus: Record<string, string> = {};
for (const status of Object.keys(statusTones)) {
  labelToStatus[status] = status;
}

export const leaveStatuses = [
  "draft",
  "pending",
  "needs_clarification",
  "approved",
  "rejected",
  "cancelled",
] as const;

export const serviceStatuses = [
  "open",
  "in_progress",
  "waiting_on_requester",
  "resolved",
  "closed",
] as const;

export const taskStatuses = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
  "waived",
] as const;

export const applicationStages = [
  "received",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

export const requisitionStatuses = [
  "draft",
  "pending_approval",
  "approved",
  "open",
  "on_hold",
  "closed",
  "cancelled",
] as const;

export const priorityTones: Record<string, StatusTone> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

export function priorityLabel(t: Translator, priority: string): string {
  const key = `priority.${priority}`;
  const label = t(key);
  return label === key ? priority : label;
}
