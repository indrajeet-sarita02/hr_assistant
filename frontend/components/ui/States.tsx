export function Spinner({ light = false }: { light?: boolean }) {
  return <span className={`spinner${light ? " spinner-light" : ""}`} aria-hidden="true" />;
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="loading-panel" role="status" aria-live="polite">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="stack-sm" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="skeleton skeleton-line"
          style={{ width: `${[92, 76, 58, 84, 66][index % 5]}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}
