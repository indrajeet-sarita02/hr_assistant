"use client";

import { Children, cloneElement, isValidElement } from "react";
import type { ReactNode } from "react";

// Frontend.md §9.2 / §13: field-level errors must be programmatically
// associated with the control they describe (aria-describedby). The shared
// Field component stamps a stable describe id on its child control(s), so
// forms built on Field satisfy the association contract without per-form
// wiring; forms that manage their own describedby keep it (ids are merged).
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
  const describedByIds: string[] = [];
  if (htmlFor && hint !== undefined && hint !== null && hint !== "") {
    describedByIds.push(`${htmlFor}-hint`);
  }
  if (htmlFor && error !== undefined && error !== null && error !== "") {
    describedByIds.push(`${htmlFor}-error`);
  }
  const describeIds = describedByIds.length
    ? describedByIds.join(" ")
    : undefined;

  const wired = Children.map(children, (child) => {
    if (!describeIds || !isValidElement(child)) return child;
    const props = child.props as { "aria-describedby"?: string };
    const existing = props["aria-describedby"];
    const merged = existing ? `${existing} ${describeIds}` : describeIds;
    return cloneElement(child as React.ReactElement<{
      "aria-describedby"?: string;
    }>, { "aria-describedby": merged });
  });

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
      {wired}
      {hint && (
        <div
          className="hint"
          id={htmlFor ? `${htmlFor}-hint` : undefined}
        >
          {hint}
        </div>
      )}
      {error && (
        <div
          className="error-text"
          role="alert"
          id={htmlFor ? `${htmlFor}-error` : undefined}
        >
          {error}
        </div>
      )}
    </div>
  );
}
