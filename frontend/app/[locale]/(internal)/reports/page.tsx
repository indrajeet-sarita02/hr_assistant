"use client";

import { useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Download,
  FileBarChart2,
  LifeBuoy,
  RotateCcw,
  UserPlus,
  UsersRound,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner, SkeletonCards } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { formatDateTime, formatNumber, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { newIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, permissions } from "@/lib/permissions";
import type { ReportExport, ReportSummary } from "@/lib/types";

const reportFields = {
  hr_summary: [
    "leave_request_id",
    "employee_id",
    "leave_type",
    "status",
    "start_at",
    "end_at",
  ],
  service_queue: [
    "request_id",
    "subject",
    "priority",
    "status",
    "sla_due_at",
    "assignee_user_id",
  ],
} as const;

export default function ReportsPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const canExport = hasPermission(me?.permissions, permissions.reportExport);
  const [reportType, setReportType] = useState<"hr_summary" | "service_queue">(
    "hr_summary",
  );
  const [selected, setSelected] = useState<string[]>([
    ...reportFields.hr_summary,
  ]);
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [history, setHistory] = useState<ReportExport[]>([]);
  const key = useRef(newIdempotencyKey());

  const { data, loading, error, reload } = useAsync(
    () => apiGet<ReportSummary>("/reports/hr/summary"),
    [],
  );

  const fields = useMemo(() => reportFields[reportType], [reportType]);

  function changeType(next: "hr_summary" | "service_queue") {
    setReportType(next);
    setSelected([...reportFields[next]]);
  }

  function toggleField(field: string) {
    setSelected((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field],
    );
  }

  async function requestExport() {
    if (!selected.length) {
      setActionError({ message: t("reports.no_fields") });
      return;
    }
    setWorking("request");
    setActionError(null);
    try {
      const created = await apiFetch<ReportExport>("/reports/hr/exports", {
        method: "POST",
        idempotencyKey: key.current,
        json: {
          report_type: reportType,
          filters: {},
          fields: selected,
        },
      });
      setHistory((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      key.current = newIdempotencyKey();
      notify(t("reports.requested"));
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function refreshExport(id: string) {
    setWorking(id);
    setActionError(null);
    try {
      const updated = await apiGet<ReportExport>(`/reports/exports/${id}`);
      setHistory((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  if (!hasPermission(me?.permissions, permissions.reportRead)) {
    return (
      <div className="page">
        <PageHeader
          title={t("state.forbidden_title")}
          description={t("state.forbidden_body")}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => reload()}
            disabled={loading}
          >
            <RotateCcw size={15} aria-hidden="true" />
            {t("app.retry")}
          </button>
        }
      />

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : data ? (
        <>
          <div className="section-head">
            <div>
              <h2>{t("reports.summary")}</h2>
              <p>
                {t("reports.generated", {
                  time: formatDateTime(data.generated_at, locale),
                })}
              </p>
            </div>
          </div>

          <div className="stat-grid">
            <article className="stat-card">
              <div>
                <div className="stat-label">{t("reports.leave_pending")}</div>
                <div className="stat-value">
                  {formatNumber(data.leave_pending, locale)}
                </div>
              </div>
              <span className="stat-icon">
                <BarChart3 size={18} aria-hidden="true" />
              </span>
            </article>
            <article className="stat-card">
              <div>
                <div className="stat-label">{t("reports.service_open")}</div>
                <div className="stat-value">
                  {formatNumber(data.service_open, locale)}
                </div>
              </div>
              <span className="stat-icon stat-icon-coral">
                <LifeBuoy size={18} aria-hidden="true" />
              </span>
            </article>
            <article className="stat-card">
              <div>
                <div className="stat-label">{t("reports.onboarding_active")}</div>
                <div className="stat-value">
                  {formatNumber(data.onboarding_active, locale)}
                </div>
              </div>
              <span className="stat-icon stat-icon-gold">
                <UserPlus size={18} aria-hidden="true" />
              </span>
            </article>
            <article className="stat-card">
              <div>
                <div className="stat-label">
                  {t("reports.applications_active")}
                </div>
                <div className="stat-value">
                  {formatNumber(data.applications_active, locale)}
                </div>
              </div>
              <span className="stat-icon">
                <UsersRound size={18} aria-hidden="true" />
              </span>
            </article>
          </div>
        </>
      ) : null}

      <div className="split mt-4">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("reports.exports")}</h2>
              <p>{t("reports.exports_body")}</p>
            </div>
            <FileBarChart2 size={18} aria-hidden="true" />
          </div>
          <div className="card-body stack">
            {!canExport ? (
              <Alert tone="info" title={t("state.forbidden_title")}>
                {t("state.forbidden_body")}
              </Alert>
            ) : (
              <>
                {Boolean(actionError) && (
                  <Alert tone="error" title={t("state.error_title")}>
                    {errorMessage(actionError, t)}
                  </Alert>
                )}

                <div>
                  <div className="field-label">{t("reports.report_type")}</div>
                  <div className="segmented" role="group" aria-label={t("reports.report_type")}>
                    <button
                      type="button"
                      className={`segment${reportType === "hr_summary" ? " is-active" : ""}`}
                      aria-pressed={reportType === "hr_summary"}
                      onClick={() => changeType("hr_summary")}
                    >
                      {t("reports.hr_summary")}
                    </button>
                    <button
                      type="button"
                      className={`segment${reportType === "service_queue" ? " is-active" : ""}`}
                      aria-pressed={reportType === "service_queue"}
                      onClick={() => changeType("service_queue")}
                    >
                      {t("reports.service_queue")}
                    </button>
                  </div>
                </div>

                <fieldset>
                  <legend className="field-label">{t("reports.fields")}</legend>
                  <div className="check-grid">
                    {fields.map((field) => (
                      <label className="checkbox-row" key={field}>
                        <input
                          type="checkbox"
                          checked={selected.includes(field)}
                          onChange={() => toggleField(field)}
                        />
                        <span className="small">
                          {t(`reports.field_${field}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Alert tone="info" title={t("reports.export_note")}>
                  {t("reports.download_pending")}
                </Alert>

                <div className="row">
                  <span className="tiny muted">
                    {t("reports.fields_requested", {
                      count: selected.length,
                    })}
                  </span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={working === "request" || !selected.length}
                    onClick={() => void requestExport()}
                  >
                    {working === "request" ? (
                      <Spinner light />
                    ) : (
                      <Download size={15} aria-hidden="true" />
                    )}
                    {t("actions.create")}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("reports.history")}</h2>
              <p>{t("reports.export_status")}</p>
            </div>
            <span className="badge badge-neutral">{history.length}</span>
          </div>
          <div className="card-body">
            {history.length === 0 ? (
              <p className="small muted">{t("reports.empty_export")}</p>
            ) : (
              <div className="stack-sm">
                {history.map((item) => (
                  <article className="export-row" key={item.id}>
                    <div className="spacer">
                      <div className="row-between">
                        <div>
                          <div className="small" style={{ fontWeight: 650 }}>
                            {t(`reports.${item.report_type}`)}
                          </div>
                          <div className="tiny muted">
                            {t("reports.export_ref", {
                              id: shortReference(item.id),
                            })}
                          </div>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="row-between mt-2">
                        <span className="tiny muted">
                          {t("reports.fields_requested", {
                            count: item.requested_fields.length,
                          })}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={working === item.id}
                          onClick={() => void refreshExport(item.id)}
                        >
                          <RotateCcw size={12} aria-hidden="true" />
                          {t("app.retry")}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
