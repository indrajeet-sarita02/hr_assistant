"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { errorMessage } from "@/lib/api-client";

export function ErrorPanel({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (compact) {
    return (
      <div className="alert alert-error" role="alert">
        <AlertTriangle size={17} aria-hidden="true" />
        <div>
          <strong>{t("state.error_title")}</strong>
          {errorMessage(error, t)}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="empty-state">
        <span className="empty-icon">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <h3>{t("state.error_title")}</h3>
        <p>{errorMessage(error, t)}</p>
        {onRetry && (
          <button type="button" className="btn btn-secondary mt-3" onClick={onRetry}>
            <RefreshCw size={15} aria-hidden="true" />
            {t("app.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
