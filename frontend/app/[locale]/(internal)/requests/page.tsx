"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LifeBuoy, Plus, SearchCheck } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PriorityBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonCards } from "@/components/ui/States";
import { apiGet } from "@/lib/api-client";
import { formatDate, formatDateTime, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import { serviceStatuses } from "@/lib/status";
import type { Page, ServiceRequest } from "@/lib/types";

export default function ServiceRequestsPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [scope, setScope] = useState<"all" | "mine">(
    searchParams.get("tab") === "mine" ? "mine" : "all",
  );
  const canQueue = hasPermission(me?.permissions, permissions.serviceReadQueue);
  const canCreate = hasPermission(me?.permissions, permissions.serviceCreate);

  const { data, loading, error, reload } = useAsync(
    () =>
      apiGet<Page<ServiceRequest>>(
        `/service-requests?limit=100${status ? `&request_status=${encodeURIComponent(status)}` : ""}`,
      ),
    [status],
  );

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (scope === "mine") {
      return items.filter((item) => item.requester_user_id === me?.user.id);
    }
    return items;
  }, [data?.items, scope, me?.user.id]);

  return (
    <div className="page">
      <PageHeader
        title={t("requests.title")}
        description={t("requests.subtitle")}
        actions={
          canCreate ? (
            <Link className="btn btn-primary" href={`/${locale}/requests/new`}>
              <Plus size={16} aria-hidden="true" />
              {t("requests.new_title")}
            </Link>
          ) : undefined
        }
      />

      <div className="toolbar">
        {canQueue && (
          <div className="segmented" role="group" aria-label={t("requests.queue")}>
            <button
              type="button"
              className={`segment${scope === "all" ? " is-active" : ""}`}
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              {t("requests.all_requests")}
            </button>
            <button
              type="button"
              className={`segment${scope === "mine" ? " is-active" : ""}`}
              aria-pressed={scope === "mine"}
              onClick={() => setScope("mine")}
            >
              {t("requests.my_requests")}
            </button>
          </div>
        )}
        <label className="sr-only" htmlFor="request-status">
          {t("requests.status")}
        </label>
        <select
          id="request-status"
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t("app.all")}</option>
          {serviceStatuses.map((item) => (
            <option key={item} value={item}>
              {t(`status.${item}`)}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="tiny muted">
          {t("requests.open_requests")}: {data?.items.filter((item) => !["closed", "cancelled"].includes(item.status)).length ?? 0}
        </span>
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : (
        <div className="card">
          {rows.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title={t("requests.empty_title")}
              body={t("requests.empty_body")}
              action={
                canCreate ? (
                  <Link className="btn btn-primary" href={`/${locale}/requests/new`}>
                    <Plus size={15} aria-hidden="true" />
                    {t("actions.new_request")}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <DataTable
              caption={t("requests.my_requests")}
              rows={rows}
              getKey={(row) => row.id}
              columns={[
                {
                  key: "subject",
                  label: t("requests.subject"),
                  render: (row) => (
                    <div>
                      <Link className="row" href={`/${locale}/requests/${row.id}`}>
                        <span style={{ fontWeight: 650 }}>{row.subject}</span>
                        <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                      <div className="tiny muted">
                        {t("requests.ref", { id: shortReference(row.id) })} ·{" "}
                        {formatDate(row.created_at, locale)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: t("requests.status"),
                  render: (row) => <StatusBadge status={row.status} />,
                },
                {
                  key: "priority",
                  label: t("requests.priority"),
                  render: (row) => <PriorityBadge priority={row.priority} />,
                },
                {
                  key: "sla",
                  label: t("requests.sla"),
                  render: (row) => {
                    const overdue = new Date(row.sla_due_at).getTime() < Date.now();
                    return (
                      <span className={overdue ? "text-danger small" : "small"}>
                        {overdue ? t("requests.overdue") : formatDateTime(row.sla_due_at, locale)}
                      </span>
                    );
                  },
                },
                {
                  key: "assignee",
                  label: t("requests.assign"),
                  render: (row) => (
                    <span className="small muted">
                      {row.assignee_user_id
                        ? t("requests.assigned", {
                            name: shortReference(row.assignee_user_id),
                          })
                        : t("requests.unassigned")}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
