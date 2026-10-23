import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  meta,
  icon: Icon,
  tone = "teal",
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  icon?: LucideIcon;
  tone?: "teal" | "coral" | "gold" | "info";
  href?: string;
}) {
  const content = (
    <>
      {Icon && (
        <span className="stat-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
      )}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </>
  );

  const className = `stat-card${tone === "teal" ? "" : ` stat-${tone}`}`;

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}
