"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    // Deliberately do not log error contents: pages can contain private HR data.
  }, [error]);

  return (
    <main className="standalone-state" role="main">
      <div className="state-card">
        <span className="empty-icon">
          <AlertTriangle size={24} aria-hidden="true" />
        </span>
        <h1>{t("state.error_title")}</h1>
        <p>{t("state.error_body")}</p>
        {error.digest && (
          <p className="hint">{t("state.request_id", { id: error.digest })}</p>
        )}
        <button type="button" className="btn btn-primary" onClick={reset}>
          <RefreshCw size={16} aria-hidden="true" />
          {t("app.retry")}
        </button>
      </div>
    </main>
  );
}
