"use client";

import { useI18n } from "@/components/layout/LocaleProvider";
import {
  priorityLabel,
  priorityTones,
  statusLabel,
  statusTone,
} from "@/lib/status";

import { Badge } from "./Badge";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <Badge tone={statusTone(status)} className="status-badge">
      {statusLabel(t, status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useI18n();
  return (
    <Badge tone={priorityTones[priority] ?? "neutral"} className="status-badge">
      {priorityLabel(t, priority)}
    </Badge>
  );
}
