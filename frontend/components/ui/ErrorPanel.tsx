"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { ApiError, errorMessage } from "@/lib/api-client";

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
  const retryAfter = error instanceof ApiError ? error.retryAfterSeconds : null;
  const [remaining, setRemaining] = useState<number | null>(retryAfter);

  useEffect(() => {
    setRemaining(retryAfter);
    if (retryAfter === null || retryAfter <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((current) =>
        current === null || current <= 1 ? null : current - 1,
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const message =
    remaining !== null && remaining > 0
      ? `${errorMessage(error, t)} ${t("errors.retry_in", {
          seconds: remaining,
        })}`
      : errorMessage(error, t);
  const retryDisabled = remaining !== null && remaining > 0;

  if (compact) {
    return (
      <div className="alert alert-error" role="alert">
        <AlertTriangle size={17} aria-hidden="true" />
        <div>
          <strong>{t("state.error_title")}</strong>
          {message}
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
        <p>{message}</p>
        {onRetry && (
          <button
            type="button"
            className="btn btn-secondary mt-3"
            onClick={onRetry}
            disabled={retryDisabled}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {t("app.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
