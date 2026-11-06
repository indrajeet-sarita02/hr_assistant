"use client";

import { useI18n } from "@/components/layout/LocaleProvider";
import {
  Circle,
  CircleDot,
  Info,
  AlertOctagon,
  AlertTriangle,
} from "lucide-react";
import {
  priorityLabel,
  priorityTones,
  statusLabel,
  statusTone,
  type StatusTone,
} from "@/lib/status";

import { Badge } from "./Badge";

// Frontend.md §9.2 / §11 (a11y) and SRS Appendix B: status is never conveyed by
// color alone — each badge pairs a text label with an icon glyph in a second
// modality.
const toneIcon: Record<StatusTone, typeof Circle> = {
  neutral: Circle,
  info: Info,
  success: CircleDot,
  warning: AlertTriangle,
  danger: AlertOctagon,
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone = statusTone(status);
  const Icon = toneIcon[tone];
  return (
    <Badge tone={tone} className="status-badge">
      <Icon
        size={11}
        aria-hidden="true"
        className="status-badge-icon"
        strokeWidth={2.5}
      />
      {statusLabel(t, status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useI18n();
  const tone = priorityTones[priority] ?? "neutral";
  const Icon = toneIcon[tone];
  return (
    <Badge tone={tone} className="status-badge">
      <Icon
        size={11}
        aria-hidden="true"
        className="status-badge-icon"
        strokeWidth={2.5}
      />
      {priorityLabel(t, priority)}
    </Badge>
  );
}
