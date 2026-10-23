import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  optionalLabel,
  children,
  className = "",
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optionalLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-coral" aria-hidden="true">
            *
          </span>
        )}
        {!required && optionalLabel && (
          <span className="label-optional">{optionalLabel}</span>
        )}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
      {error && (
        <div className="error-text" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
