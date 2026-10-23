"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Plus, UserPlus } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
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
import type { OnboardingCase, OnboardingTemplate, Page } from "@/lib/types";

export default function OnboardingPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const canCreate = hasPermission(me?.permissions, permissions.onboardingCreate);
  const canRead = hasPermission(me?.permissions, permissions.onboardingRead);
  const [status, setStatus] = useState("");

  const { data, loading, error, reload } = useAsync(async () => {
    const [cases, templates] = await Promise.all([
      apiGet<Page<OnboardingCase>>("/onboarding/cases?limit=100"),
      canCreate
        ? apiGet<OnboardingTemplate[]>("/onboarding/templates").catch(() => [])
        : Promise.resolve([]),
    ]);
    return { cases, templates };
  }, [canCreate]);

  const cases = useMemo(() => {
    const items = data?.cases.items ?? [];
    return status ? items.filter((item) => item.status === status) : items;
  }, [data?.cases.items, status]);

  const templateName = useMemo(() => {
    const map = new Map<string, string>();
    for (const template of data?.templates ?? []) map.set(template.id, template.name);
    return map;
  }, [data?.templates]);

  if (!canRead) {
    return (
      <div className="page">
        <PageHeader title={t("state.forbidden_title")} description={t("state.forbidden_body")} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t("onboarding.title")}
        description={t("onboarding.subtitle")}
        actions={
          canCreate ? (
            <Link className="btn btn-primary" href={`/${locale}/onboarding/new`}>
              <Plus size={16} aria-hidden="true" />
              {locale === "hi" ? "केस बनाएँ" : "Create case"}
            </Link>
          ) : undefined
        }
      />

      <div className="toolbar">
        <label className="sr-only" htmlFor="case-status">
          {t("requests.status")}
        </label>
        <select
          id="case-status"
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t("app.all")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="completed">{t("status.completed")}</option>
          <option value="cancelled">{t("status.cancelled")}</option>
        </select>
        <span className="spacer" />
        <span className="tiny muted">
          {t("onboarding.tasks_remaining", {
            count: cases.reduce(
              (total, item) =>
                total + Math.max(0, (item.progress?.total ?? 0) - (item.progress?.completed ?? 0)),
              0,
            ),
          })}
        </span>
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : cases.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={UserPlus}
            title={t("onboarding.case_empty_title")}
            body={t("onboarding.case_empty_body")}
            action={
              canCreate ? (
                <Link className="btn btn-primary" href={`/${locale}/onboarding/new`}>
                  <Plus size={15} aria-hidden="true" />
                  {locale === "hi" ? "केस बनाएँ" : "Create case"}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-2">
          {cases.map((item) => {
            const remaining = Math.max(
              0,
              (item.progress?.total ?? 0) - (item.progress?.completed ?? 0),
            );
            return (
              <article className="card card-pad" key={item.id}>
                <div className="row-between">
                  <span className="badge badge-neutral">
                    <UserPlus size={11} aria-hidden="true" />
                    {t("onboarding.case_ref", { id: shortReference(item.id) })}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <h2 className="section-title mt-3">
                  {templateName.get(item.template_id) || t("onboarding.case_title")}
                </h2>
                <div className="row wrap mt-2 tiny muted">
                  <span className="row">
                    <CalendarDays size={12} aria-hidden="true" />
                    {t("onboarding.start_date")}: {formatDate(item.start_date, locale)}
                  </span>
                  <span>·</span>
                  <span>
                    {t("onboarding.owner_employee")}: {shortReference(item.employee_id)}
                  </span>
                </div>

                <div className="mt-3">
                  <Progress
                    value={item.progress?.percent ?? 0}
                    label={
                      item.progress
                        ? `${formatNumber(item.progress.completed, locale)}/${formatNumber(item.progress.total, locale)} ${t("onboarding.tasks").toLowerCase()}`
                        : t("onboarding.progress_empty")
                    }
                  />
                </div>

                <div className="row-between mt-3">
                  <span className="tiny muted">
                    {remaining > 0
                      ? t("onboarding.tasks_remaining", { count: remaining })
                      : t("status.completed")}
                  </span>
                  <Link className="btn btn-secondary btn-sm" href={`/${locale}/onboarding/${item.id}`}>
                    {t("app.view_all")}
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="aside-card mt-3">
        <h3>
          <CheckCircle2 size={13} aria-hidden="true" style={{ display: "inline", marginRight: 5 }} />
          {t("onboarding.only_assigned")}
        </h3>
        <p>{t("onboarding.subtitle")}</p>
      </div>
    </div>
  );
}
