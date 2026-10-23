import type { ReactNode } from "react";

import type { StatusTone } from "@/lib/status";

export function Badge({
  children,
  tone = "neutral",
  className = "",
  plain = false,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
  plain?: boolean;
}) {
  return (
    <span
      className={`badge badge-${tone}${plain ? " badge-plain" : ""} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
