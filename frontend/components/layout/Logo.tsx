import Link from "next/link";

export function Logo({
  locale,
  subtitle,
  compact = false,
}: {
  locale: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <Link className="brand" href={`/${locale}`} aria-label="HR Assist home">
      <span className="brand-mark" aria-hidden="true">
        HR
      </span>
      {!compact && (
        <span className="brand-copy">
          <span className="brand-name">HR Assist</span>
          {subtitle && <span className="brand-sub">{subtitle}</span>}
        </span>
      )}
    </Link>
  );
}
