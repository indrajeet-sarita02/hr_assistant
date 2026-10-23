"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  LifeBuoy,
  MessageSquareText,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Progress } from "@/components/ui/Progress";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonCards } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiGet } from "@/lib/api-client";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  shortReference,
} from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import type {
  CalendarOut,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  Notification,
  OnboardingCase,
  Page,
  ReportSummary,
  ServiceRequest,
} from "@/lib/types";

interface DashboardData {
  balances: LeaveBalance[] | null;
  leaveTypes: LeaveType[] | null;
  leave: Page<LeaveRequest> | null;
  service: Page<ServiceRequest> | null;
  notifications: Page<Notification> | null;
  cases: Page<OnboardingCase> | null;
  summary: ReportSummary | null;
  calendars: CalendarOut[] | null;
}

async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const perms = me?.permissions;
  const canLeave = hasPermission(perms, permissions.leaveReadOwn);
  const canService = hasPermission(perms, permissions.serviceReadOwn);
  const canOnboarding = hasPermission(perms, permissions.onboardingRead);
  const canReports = hasPermission(perms, permissions.reportRead);
  const canNotify = hasPermission(perms, permissions.notificationRead);
  const canDecide = hasPermission(perms, permissions.leaveDecide);

  const { data, loading, error, reload } = useAsync<DashboardData>(
    async () => {
      const [
        balances,
        leaveTypes,
        leave,
        service,
        notifications,
        cases,
        summary,
        calendars,
      ] = await Promise.all([
        canLeave ? safe(apiGet<LeaveBalance[]>("/leave/balances")) : Promise.resolve(null),
        canLeave ? safe(apiGet<LeaveType[]>("/leave/types")) : Promise.resolve(null),
        canLeave ? safe(apiGet<Page<LeaveRequest>>("/leave/requests?limit=6")) : Promise.resolve(null),
        canService
          ? safe(apiGet<Page<ServiceRequest>>("/service-requests?limit=6"))
          : Promise.resolve(null),
        canNotify
          ? safe(apiGet<Page<Notification>>("/me/notifications?limit=5"))
          : Promise.resolve(null),
        canOnboarding
          ? safe(apiGet<Page<OnboardingCase>>("/onboarding/cases?limit=5"))
          : Promise.resolve(null),
        canReports ? safe(apiGet<ReportSummary>("/reports/hr/summary")) : Promise.resolve(null),
        canLeave ? safe(apiGet<CalendarOut[]>("/leave/calendar")) : Promise.resolve(null),
      ]);
      return {
        balances,
        leaveTypes,
        leave,
        service,
        notifications,
        cases,
        summary,
        calendars,
      };
    },
    [
      me?.user.id,
      canLeave,
      canService,
      canOnboarding,
      canReports,
      canNotify,
    ],
  );

  const leaveTypeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of data?.leaveTypes ?? []) {
      map.set(type.id, locale === "hi" && type.name_hi ? type.name_hi : type.name_en);
    }
    return map;
  }, [data?.leaveTypes, locale]);

  const upcomingHoliday = useMemo<Holiday | null>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const holidays =
      data?.calendars?.flatMap((calendar) => calendar.holidays ?? []) ?? [];
    return (
      holidays
        .filter((holiday) => new Date(`${holiday.date}T00:00:00`) >= today)
        .sort(
          (a, b) =>
            new Date(`${a.date}T00:00:00`).getTime() -
            new Date(`${b.date}T00:00:00`).getTime(),
        )[0] ?? null
    );
  }, [data?.calendars]);

  const pendingLeave = (data?.leave?.items ?? []).filter((request) =>
    ["pending", "needs_clarification"].includes(request.status),
  );
  const openService = (data?.service?.items ?? []).filter((request) =>
    ["open", "in_progress", "waiting_on_requester"].includes(request.status),
  );
  const unread = (data?.notifications?.items ?? []).filter((item) => !item.read_at);
  const activeCases = (data?.cases?.items ?? []).filter(
    (item) => item.status !== "completed" && item.status !== "closed",
  );

  const leaveStat =
    data?.summary?.leave_pending ?? pendingLeave.length;
  const serviceStat = data?.summary?.service_open ?? openService.length;
  const onboardingStat =
    data?.summary?.onboarding_active ?? activeCases.length;

  if (loading) {
    return (
      <div className="page">
        <PageHeader title={t("app.loading")} description={t("dashboard.subtitle")} />
        <SkeletonCards count={4} />
        <div className="mt-4">
          <SkeletonCards count={2} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorPanel error={error} onRetry={reload} />
      </div>
    );
  }

  const visibleStats = [
    canLeave
      ? {
          label: canDecide ? t("dashboard.pending_leave") : t("dashboard.stat_leave"),
          value: formatNumber(leaveStat, locale),
          icon: CalendarDays,
          href: `/${locale}/leave${canDecide ? "?tab=approvals" : ""}`,
          meta: canDecide
            ? t("dashboard.view_approvals")
            : t("dashboard.leave_title"),
        }
      : null,
    canService
      ? {
          label: t("dashboard.stat_service"),
          value: formatNumber(serviceStat, locale),
          icon: LifeBuoy,
          href: `/${locale}/requests`,
          meta: t("requests.queue"),
          tone: "coral" as const,
        }
      : null,
    canOnboarding
      ? {
          label: t("dashboard.stat_onboarding"),
          value: formatNumber(onboardingStat, locale),
          icon: UserPlus,
          href: `/${locale}/onboarding`,
          meta: t("onboarding.cases"),
          tone: "gold" as const,
        }
      : null,
    canNotify
      ? {
          label: t("dashboard.stat_unread"),
          value: formatNumber(unread.length, locale),
          icon: Bell,
          href: `/${locale}/notifications`,
          meta: t("dashboard.notifications_title"),
          tone: "info" as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    icon: typeof CalendarDays;
    href: string;
    meta: string;
    tone?: "teal" | "coral" | "gold" | "info";
  }>;

  return (
    <div className="page">
      <PageHeader
        eyebrow={locale === "hi" ? "आपका कार्यक्षेत्र" : "Your workspace"}
        title={t("dashboard.greeting", {
          timeOfDay: t("dashboard.afternoon"),
          name: me?.user.full_name?.split(" ")[0] || "",
        })}
        description={t("dashboard.subtitle")}
        actions={
          <>
            {hasPermission(perms, permissions.assistant) && (
              <Link className="btn btn-primary" href={`/${locale}/assistant`}>
                <MessageSquareText size={16} aria-hidden="true" />
                {t("actions.ask")}
              </Link>
            )}
            {hasPermission(perms, permissions.serviceCreate) && (
              <Link className="btn btn-secondary" href={`/${locale}/requests/new`}>
                <LifeBuoy size={16} aria-hidden="true" />
                {t("actions.new_request")}
              </Link>
            )}
          </>
        }
      />

      {!visibleStats.length && (
        <Alert tone="info" title={t("app.advisory")}>
          {t("state.forbidden_body")}
        </Alert>
      )}

      {visibleStats.length > 0 && (
        <div className="stat-grid">
          {visibleStats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              meta={stat.meta}
              icon={stat.icon}
              href={stat.href}
              tone={stat.tone}
            />
          ))}
        </div>
      )}

      <div className="split mt-4">
        <div className="stack">
          <section className="card" aria-labelledby="attention-title">
            <div className="card-header">
              <div>
                <h2 id="attention-title">{t("dashboard.actions_title")}</h2>
                <p>{t("dashboard.subtitle")}</p>
              </div>
              <span className="badge badge-neutral">
                {formatNumber(pendingLeave.length + openService.length, locale)}
              </span>
            </div>
            <div className="card-body">
              {pendingLeave.length === 0 && openService.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title={t("dashboard.actions_empty")}
                  body={t("assistant.disclaimer")}
                />
              ) : (
                <div className="stack-sm">
                  {pendingLeave.map((request) => (
                    <Link
                      key={request.id}
                      className="test-list-card"
                      href={`/${locale}/leave/${request.id}`}
                    >
                      <span className="feature-icon">
                        <CalendarDays size={16} aria-hidden="true" />
                      </span>
                      <div className="spacer">
                        <div className="section-title">
                          {leaveTypeName.get(request.leave_type_id) || t("leave.details_title")}
                        </div>
                        <div className="tiny muted">
                          {formatDate(request.start_at, locale)} –{" "}
                          {formatDate(request.end_at, locale)}
                        </div>
                      </div>
                      <StatusBadge status={request.status} />
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  ))}
                  {openService.map((request) => (
                    <Link
                      key={request.id}
                      className="test-list-card"
                      href={`/${locale}/requests/${request.id}`}
                    >
                      <span className="feature-icon feature-icon-coral">
                        <Inbox size={16} aria-hidden="true" />
                      </span>
                      <div className="spacer">
                        <div className="section-title">{request.subject}</div>
                        <div className="tiny muted">
                          {t("requests.ref", { id: shortReference(request.id) })} ·{" "}
                          {formatDate(request.created_at, locale)}
                        </div>
                      </div>
                      <StatusBadge status={request.status} />
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="quick-title">
            <div className="card-header">
              <h2 id="quick-title">{t("dashboard.quick_title")}</h2>
            </div>
            <div className="card-body">
              <div className="grid grid-2">
                {hasPermission(perms, permissions.assistant) && (
                  <Link className="test-list-card" href={`/${locale}/assistant`}>
                    <span className="feature-icon">
                      <Sparkles size={16} aria-hidden="true" />
                    </span>
                    <span className="spacer section-title">{t("dashboard.quick_assistant")}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
                {hasPermission(perms, permissions.serviceCreate) && (
                  <Link className="test-list-card" href={`/${locale}/requests/new`}>
                    <span className="feature-icon feature-icon-coral">
                      <LifeBuoy size={16} aria-hidden="true" />
                    </span>
                    <span className="spacer section-title">{t("dashboard.quick_request")}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
                {hasPermission(perms, permissions.leaveCreate) && (
                  <Link className="test-list-card" href={`/${locale}/leave/new`}>
                    <span className="feature-icon feature-icon-gold">
                      <CalendarDays size={16} aria-hidden="true" />
                    </span>
                    <span className="spacer section-title">{t("dashboard.quick_leave")}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
                {hasPermission(perms, permissions.assessmentOwn) && (
                  <Link className="test-list-card" href={`/${locale}/mock-tests`}>
                    <span className="feature-icon">
                      <Clock3 size={16} aria-hidden="true" />
                    </span>
                    <span className="spacer section-title">{t("dashboard.quick_tests")}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          </section>

          {canOnboarding && (
            <section className="card" aria-labelledby="onboarding-summary-title">
              <div className="card-header">
                <div>
                  <h2 id="onboarding-summary-title">{t("onboarding.cases")}</h2>
                  <p>{t("onboarding.subtitle")}</p>
                </div>
                <Link className="btn btn-ghost btn-sm" href={`/${locale}/onboarding`}>
                  {t("app.view_all")}
                </Link>
              </div>
              <div className="card-body">
                {activeCases.length === 0 ? (
                  <p className="muted small">{t("onboarding.case_empty_body")}</p>
                ) : (
                  <div className="stack-sm">
                    {activeCases.slice(0, 3).map((item) => {
                      const progress = item.progress;
                      return (
                        <Link
                          className="test-list-card"
                          href={`/${locale}/onboarding/${item.id}`}
                          key={item.id}
                        >
                          <span className="feature-icon">
                            <UserPlus size={16} aria-hidden="true" />
                          </span>
                          <div className="spacer">
                            <div className="row-between">
                              <span className="section-title">
                                {t("onboarding.case_ref", { id: shortReference(item.id) })}
                              </span>
                              <StatusBadge status={item.status} />
                            </div>
                            <div className="mt-2">
                              <Progress
                                value={progress?.percent ?? 0}
                                label={
                                  progress
                                    ? `${progress.completed}/${progress.total} ${t("onboarding.tasks").toLowerCase()}`
                                    : t("onboarding.progress_empty")
                                }
                              />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="leave-balance-title">
            <div className="card-header">
              <h2 id="leave-balance-title">{t("dashboard.leave_title")}</h2>
              <Link className="btn btn-ghost btn-sm" href={`/${locale}/leave`}>
                {t("nav.leave")}
              </Link>
            </div>
            <div className="card-body">
              {!data?.balances?.length ? (
                <p className="muted small">{t("dashboard.leave_empty")}</p>
              ) : (
                <div className="stack-sm">
                  {data.balances.slice(0, 4).map((balance) => {
                    const entitled = Number(balance.entitled || 0);
                    const consumed = Number(balance.consumed || 0);
                    const pending = Number(balance.pending || 0);
                    const available = Math.max(
                      0,
                      entitled + Number(balance.carried_forward || 0) - consumed - pending,
                    );
                    return (
                      <div key={balance.id}>
                        <div className="row-between">
                          <span className="small" style={{ fontWeight: 650 }}>
                            {leaveTypeName.get(balance.leave_type_id) || t("nav.leave")}
                          </span>
                          <span className="small">
                            {formatNumber(available, locale)} {t("dashboard.leave_available")}
                          </span>
                        </div>
                        <div className="mt-2">
                          <Progress
                            value={consumed + pending}
                            max={entitled || 1}
                            label={t("dashboard.leave_used", {
                              used: formatNumber(consumed + pending, locale),
                              entitled: formatNumber(entitled, locale),
                            })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {upcomingHoliday && (
                <>
                  <hr className="divider" />
                  <div className="eyebrow">{t("dashboard.holiday_title")}</div>
                  <div className="row-between mt-1">
                    <span className="small" style={{ fontWeight: 650 }}>
                      {upcomingHoliday.name}
                    </span>
                    <span className="tiny muted">
                      {formatDate(upcomingHoliday.date, locale)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="notifications-title">
            <div className="card-header">
              <h2 id="notifications-title">{t("dashboard.notifications_title")}</h2>
              <Link className="btn btn-ghost btn-sm" href={`/${locale}/notifications`}>
                {t("app.view_all")}
              </Link>
            </div>
            <div className="card-body">
              {!data?.notifications?.items.length ? (
                <p className="muted small">{t("dashboard.notifications_empty")}</p>
              ) : (
                <div className="stack-sm">
                  {data.notifications.items.slice(0, 4).map((notification) => (
                    <Link
                      className="notification-row"
                      href={`/${locale}/notifications`}
                      key={notification.id}
                    >
                      <span className={`notification-state${notification.read_at ? "" : " is-unread"}`} />
                      <div className="spacer">
                        <div className="small" style={{ fontWeight: 600 }}>
                          {notification.subject}
                        </div>
                        <div className="tiny muted">
                          {formatDateTime(notification.created_at, locale)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          {hasPermission(perms, permissions.reportRead) && (
            <section className="card" aria-labelledby="report-summary-title">
              <div className="card-header">
                <h2 id="report-summary-title">{t("nav.insights")}</h2>
                <Link className="btn btn-ghost btn-sm" href={`/${locale}/reports`}>
                  <BarChart3 size={14} aria-hidden="true" />
                  {t("nav.reports")}
                </Link>
              </div>
              <div className="card-body">
                <dl className="detail-list">
                  <div>
                    <dt>{t("reports.leave_pending")}</dt>
                    <dd>{formatNumber(data?.summary?.leave_pending ?? 0, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t("reports.service_open")}</dt>
                    <dd>{formatNumber(data?.summary?.service_open ?? 0, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t("reports.onboarding_active")}</dt>
                    <dd>{formatNumber(data?.summary?.onboarding_active ?? 0, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t("reports.applications_active")}</dt>
                    <dd>{formatNumber(data?.summary?.applications_active ?? 0, locale)}</dd>
                  </div>
                </dl>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
