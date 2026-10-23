"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Plus,
  Sun,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Progress } from "@/components/ui/Progress";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonCards } from "@/components/ui/States";
import { apiGet } from "@/lib/api-client";
import { formatDate, formatNumber, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import { leaveStatuses } from "@/lib/status";
import type {
  CalendarOut,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  Page,
} from "@/lib/types";

interface LeaveData {
  balances: LeaveBalance[];
  types: LeaveType[];
  requests: Page<LeaveRequest>;
  calendars: CalendarOut[];
}

export default function LeavePage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const searchParams = useSearchParams();
  const canApprove = hasPermission(me?.permissions, permissions.leaveDecide);
  const canCreate = hasPermission(me?.permissions, permissions.leaveCreate);
  const [tab, setTab] = useState<"mine" | "approvals">(
    searchParams.get("tab") === "approvals" && canApprove ? "approvals" : "mine",
  );
  const [status, setStatus] = useState("");

  const { data, loading, error, reload } = useAsync<LeaveData>(async () => {
    const [balances, types, requests, calendars] = await Promise.all([
      apiGet<LeaveBalance[]>("/leave/balances").catch(() => []),
      apiGet<LeaveType[]>("/leave/types").catch(() => []),
      apiGet<Page<LeaveRequest>>(
        `/leave/requests?limit=100${status ? `&request_status=${encodeURIComponent(status)}` : ""}`,
      ),
      apiGet<CalendarOut[]>("/leave/calendar").catch(() => []),
    ]);
    return { balances, types, requests, calendars };
  }, [status]);

  const typeNames = useMemo(() => {
    const map = new Map<string, LeaveType>();
    for (const type of data?.types ?? []) map.set(type.id, type);
    return map;
  }, [data?.types]);

  const requests = useMemo(() => {
    const items = data?.requests.items ?? [];
    if (tab === "approvals") {
      return items.filter(
        (item) =>
          ["pending", "needs_clarification"].includes(item.status) &&
          (!item.current_approver_user_id ||
            item.current_approver_user_id === me?.user.id),
      );
    }
    return items;
  }, [data?.requests.items, tab, me?.user.id]);

  const holidays = useMemo<Holiday[]>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 90);
    return (data?.calendars.flatMap((calendar) => calendar.holidays) ?? [])
      .filter((holiday) => {
        const date = new Date(`${holiday.date}T00:00:00`);
        return date >= start && date <= end;
      })
      .sort(
        (a, b) =>
          new Date(`${a.date}T00:00:00`).getTime() -
          new Date(`${b.date}T00:00:00`).getTime(),
      );
  }, [data?.calendars]);

  return (
    <div className="page">
      <PageHeader
        title={t("leave.title")}
        description={t("leave.subtitle")}
        actions={
          canCreate ? (
            <Link className="btn btn-primary" href={`/${locale}/leave/new`}>
              <Plus size={16} aria-hidden="true" />
              {t("leave.new_title")}
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : (
        <>
          {data?.balances.length ? (
            <section aria-labelledby="balances-title" className="mb-4">
              <div className="section-head">
                <div>
                  <h2 id="balances-title">{t("leave.balance")}</h2>
                  <p>{t("leave.approver_note")}</p>
                </div>
              </div>
              <div className="grid grid-3">
                {data.balances.slice(0, 6).map((balance) => {
                  const type = typeNames.get(balance.leave_type_id);
                  const entitled =
                    Number(balance.entitled || 0) +
                    Number(balance.carried_forward || 0);
                  const used =
                    Number(balance.consumed || 0) + Number(balance.pending || 0);
                  const available = Math.max(0, entitled - used);
                  return (
                    <article className="card card-pad" key={balance.id}>
                      <div className="row-between">
                        <div>
                          <div className="tiny muted">{t("leave.balance_available")}</div>
                          <div className="stat-value" style={{ fontSize: 30 }}>
                            {formatNumber(available, locale)}
                          </div>
                          <div className="small" style={{ fontWeight: 650 }}>
                            {type
                              ? locale === "hi" && type.name_hi
                                ? type.name_hi
                                : type.name_en
                              : t("leave.type")}
                          </div>
                        </div>
                        <span className="feature-icon">
                          <CalendarDays size={18} aria-hidden="true" />
                        </span>
                      </div>
                      <div className="mt-3">
                        <Progress
                          value={used}
                          max={entitled || 1}
                          label={t("leave.balance_used")}
                        />
                      </div>
                      <div className="row-between mt-2 tiny muted">
                        <span>
                          {t("leave.balance_entitled")}: {formatNumber(entitled, locale)}
                        </span>
                        <span>
                          {t("leave.balance_pending")}:{" "}
                          {formatNumber(Number(balance.pending || 0), locale)}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="split">
            <section className="card" aria-labelledby="leave-requests-title">
              <div className="card-header">
                <div>
                  <h2 id="leave-requests-title">{t("leave.requests_title")}</h2>
                  <p>{canApprove ? t("leave.team_scope") : t("leave.subtitle")}</p>
                </div>
                <span className="badge badge-neutral">{requests.length}</span>
              </div>

              <div className="toolbar" style={{ paddingTop: 14 }}>
                {canApprove && (
                  <div className="segmented" role="group" aria-label={t("leave.approvals")}>
                    <button
                      type="button"
                      className={`segment${tab === "mine" ? " is-active" : ""}`}
                      aria-pressed={tab === "mine"}
                      onClick={() => setTab("mine")}
                    >
                      {t("leave.my_leave")}
                    </button>
                    <button
                      type="button"
                      className={`segment${tab === "approvals" ? " is-active" : ""}`}
                      aria-pressed={tab === "approvals"}
                      onClick={() => setTab("approvals")}
                    >
                      {t("leave.approvals")}
                    </button>
                  </div>
                )}
                <label className="sr-only" htmlFor="leave-status">
                  {t("requests.status")}
                </label>
                <select
                  id="leave-status"
                  className="select"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">{t("app.all")}</option>
                  {leaveStatuses.map((item) => (
                    <option value={item} key={item}>
                      {t(`status.${item}`)}
                    </option>
                  ))}
                </select>
              </div>

              {requests.length === 0 ? (
                <EmptyState
                  icon={tab === "approvals" ? CheckCircle2 : CalendarDays}
                  title={
                    tab === "approvals" ? t("leave.no_approvals") : t("leave.empty_title")
                  }
                  body={t("leave.empty_body")}
                  action={
                    tab === "mine" && canCreate ? (
                      <Link className="btn btn-primary" href={`/${locale}/leave/new`}>
                        <Plus size={15} aria-hidden="true" />
                        {t("leave.new_title")}
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <DataTable
                  caption={t("leave.requests_title")}
                  rows={requests}
                  getKey={(row) => row.id}
                  columns={[
                    {
                      key: "type",
                      label: t("leave.type"),
                      render: (row) => {
                        const type = typeNames.get(row.leave_type_id);
                        return (
                          <div>
                            <Link
                              className="row"
                              href={`/${locale}/leave/${row.id}`}
                              style={{ fontWeight: 650 }}
                            >
                              {type
                                ? locale === "hi" && type.name_hi
                                  ? type.name_hi
                                  : type.name_en
                                : t("leave.details_title")}
                              <ChevronRight size={13} aria-hidden="true" />
                            </Link>
                            <div className="tiny muted">
                              {t("requests.ref", { id: shortReference(row.id) })}
                            </div>
                          </div>
                        );
                      },
                    },
                    {
                      key: "dates",
                      label: t("leave.dates"),
                      render: (row) => (
                        <div>
                          <div className="small">
                            {formatDate(row.start_at, locale)} –{" "}
                            {formatDate(row.end_at, locale)}
                          </div>
                          <div className="tiny muted">
                            {row.partial_day
                              ? t("leave.half_day")
                              : t("leave.day_count", {
                                  count: Math.max(
                                    1,
                                    Math.ceil(
                                      (new Date(row.end_at).getTime() -
                                        new Date(row.start_at).getTime()) /
                                        86400000,
                                    ),
                                  ),
                                })}
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
                      key: "approver",
                      label: t("leave.approver"),
                      render: (row) =>
                        row.current_approver_user_id === me?.user.id ? (
                          <span className="badge badge-warning">
                            <Clock3 size={11} aria-hidden="true" />
                            {t("leave.pending_decision")}
                          </span>
                        ) : (
                          <span className="tiny muted">
                            {row.current_approver_user_id
                              ? shortReference(row.current_approver_user_id)
                              : "—"}
                          </span>
                        ),
                    },
                  ]}
                />
              )}
            </section>

            <div className="stack">
              <section className="card">
                <div className="card-header">
                  <h2>
                    <Sun size={15} aria-hidden="true" style={{ display: "inline", marginRight: 5 }} />
                    {t("leave.holidays")}
                  </h2>
                </div>
                <div className="card-body">
                  {holidays.length === 0 ? (
                    <p className="muted small">{t("leave.holidays_empty")}</p>
                  ) : (
                    <div className="timeline">
                      {holidays.slice(0, 6).map((holiday) => (
                        <div className="timeline-item" key={`${holiday.date}-${holiday.name}`}>
                          <span className="timeline-dot" />
                          <div>
                            <div className="small" style={{ fontWeight: 650 }}>
                              {holiday.name}
                            </div>
                            <div className="tiny muted">
                              {formatDate(holiday.date, locale)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h2>{t("leave.approver_note")}</h2>
                </div>
                <div className="card-body">
                  <p className="small muted">{t("leave.team_scope")}</p>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
