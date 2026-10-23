import type { ReactNode } from "react";

export function Progress({
  value,
  max = 100,
  tone = "teal",
  label,
}: {
  value: number;
  max?: number;
  tone?: "teal" | "coral";
  label?: ReactNode;
}) {
  const boundedMax = max > 0 ? max : 100;
  const percent = Math.max(0, Math.min(100, (value / boundedMax) * 100));
  return (
    <div>
      <div
        className={`progress${tone === "coral" ? " progress-coral" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={boundedMax}
        aria-valuenow={Math.max(0, Math.min(boundedMax, value))}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <div className="progress-bar" style={{ width: `${percent}%` }} />
      </div>
      {label && <div className="progress-meta">{label}</div>}
    </div>
  );
}
