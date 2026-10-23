"use client";

import { useMemo, useState } from "react";
import { Filter, ScrollText } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCards } from "@/components/ui/States";
import { apiGet } from "@/lib/api-client";
import { formatDateTime, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import type { AuditEvent, Page } from "@/lib/types";

const outcomeTone: Record<string, string> = {
  success: "badge-success",
  failure: "badge-danger",
  denied: "badge-warning",
};

export default function AuditPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const { data, loading, error, reload } = useAsync(
    () =>
      apiGet<Page<AuditEvent>>(
        `/admin/audit-events?limit=100${action ? `&action=${encodeURIComponent(action)}` : ""}${targetType ? `&target_type=${encodeURIComponent(targetType)}` : ""}`,
      ),
    [action, targetType],
  );

  const actions = useMemo(
    () => Array.from(new Set((data?.items ?? []).map((item) => item.action))).sort(),
    [data?.items],
  );
  const targetTypes = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.items ?? [])
            .map((item) => item.target_type)
            .filter((item): item is string => Boolean(item)),
        ),
      ).sort(),
    [data?.items],
  );

  if (!hasPermission(me?.permissions, permissions.auditRead)) {
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
        title={t("admin.audit_title")}
        description={t("admin.audit_body")}
      />

      <div className="toolbar">
        <Filter size={14} aria-hidden="true" />
        <label className="sr-only" htmlFor="audit-action">
          {t("admin.audit_action")}
        </label>
        <select
          id="audit-action"
          className="select"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        >
          <option value="">{t("admin.audit_action")}</option>
          {actions.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="audit-target">
          {t("admin.audit_target")}
        </label>
        <select
          id="audit-target"
          className="select"
          value={targetType}
          onChange={(event) => setTargetType(event.target.value)}
        >
          <option value="">{t("admin.audit_target")}</option>
          {targetTypes.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="tiny muted">{data?.total ?? 0}</span>
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState
            icon={ScrollText}
            title={t("admin.audit_empty")}
            body={t("admin.audit_empty_body")}
          />
        </div>
      ) : (
        <div className="card">
          <DataTable
            caption={t("admin.audit_title")}
            rows={data?.items ?? []}
            getKey={(row) => row.id}
            columns={[
              {
                key: "time",
                label: t("admin.audit_time"),
                render: (row) => (
                  <span className="small">
                    {formatDateTime(row.occurred_at, locale)}
                  </span>
                ),
              },
              {
                key: "action",
                label: t("admin.audit_action"),
                render: (row) => (
                  <span className="mono small">{row.action}</span>
                ),
              },
              {
                key: "actor",
                label: t("admin.audit_actor"),
                render: (row) => (
                  <span className="tiny muted">
                    {row.actor_user_id
                      ? shortReference(row.actor_user_id)
                      : row.actor_type}
                  </span>
                ),
              },
              {
                key: "target",
                label: t("admin.audit_target"),
                render: (row) => (
                  <span className="tiny muted">
                    {row.target_type || "—"}
                    {row.target_id ? ` · ${shortReference(row.target_id)}` : ""}
                  </span>
                ),
              },
              {
                key: "outcome",
                label: t("admin.audit_outcome"),
                render: (row) => (
                  <span
                    className={`badge ${outcomeTone[row.outcome] || "badge-neutral"}`}
                  >
                    {row.outcome}
                  </span>
                ),
              },
              {
                key: "details",
                label: t("admin.audit_details"),
                render: (row) => (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelected(row)}
                  >
                    {t("actions.view_details")}
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={t("admin.audit_details")}
        description={selected?.action}
        closeLabel={t("app.close")}
      >
        {selected && (
          <div className="stack">
            <dl className="detail-list">
              <div>
                <dt>{t("admin.audit_time")}</dt>
                <dd>{formatDateTime(selected.occurred_at, locale)}</dd>
              </div>
              <div>
                <dt>{t("admin.audit_actor")}</dt>
                <dd>
                  {selected.actor_user_id
                    ? shortReference(selected.actor_user_id)
                    : selected.actor_type}
                </dd>
              </div>
              <div>
                <dt>{t("admin.audit_target")}</dt>
                <dd>
                  {selected.target_type || "—"}
                  {selected.target_id ? ` · ${selected.target_id}` : ""}
                </dd>
              </div>
              <div>
                <dt>Request</dt>
                <dd className="mono tiny">{selected.request_id || "—"}</dd>
              </div>
            </dl>
            <div>
              <div className="tiny muted">{t("admin.audit_details")}</div>
              <pre className="metadata-block">
                {JSON.stringify(selected.metadata_json, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
