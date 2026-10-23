"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  MapPin,
  Plus,
  UserRound,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkeletonCards } from "@/components/ui/States";
import { apiGet } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasAnyPermission, hasPermission, permissions } from "@/lib/permissions";
import { requisitionStatuses } from "@/lib/status";
import type { Application, Page, Requisition } from "@/lib/types";

export default function RecruitmentPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const perms = me?.permissions;
  const canManage = hasPermission(perms, permissions.recruitmentManage);
  const canReadApps = hasPermission(perms, permissions.recruitmentApplications);
  const canAccess = hasAnyPermission(perms, [
    permissions.recruitmentManage,
    permissions.recruitmentApprove,
    permissions.recruitmentApplications,
  ]);
  const [status, setStatus] = useState("");

  const { data, loading, error, reload } = useAsync(async () => {
    const requisitions = await apiGet<Page<Requisition>>("/recruitment/requisitions?limit=100");
    const applications = canReadApps
      ? await apiGet<Page<Application>>("/recruitment/applications?limit=100").catch(
          () => ({ items: [], total: 0, limit: 100, offset: 0 }),
        )
      : null;
    return { requisitions, applications };
  }, [canReadApps]);

  const requisitions = useMemo(() => {
    const items = data?.requisitions.items ?? [];
    return status ? items.filter((item) => item.status === status) : items;
  }, [data?.requisitions.items, status]);

  const counts = useMemo(() => {
    const items = data?.requisitions.items ?? [];
    return {
      open: items.filter((item) => item.status === "open").length,
      pending: items.filter((item) => item.status === "pending_approval").length,
      applications: data?.applications?.total ?? 0,
    };
  }, [data]);

  if (!canAccess) {
    return (
      <div className="page">
        <PageHeader title={t("state.forbidden_title")} description={t("state.forbidden_body")} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t("recruitment.title")}
        description={t("recruitment.subtitle")}
        actions={
          canManage ? (
            <Link className="btn btn-primary" href={`/${locale}/recruitment/new`}>
              <Plus size={16} aria-hidden="true" />
              {t("recruitment.new_requisition")}
            </Link>
          ) : undefined
        }
      />

      <div className="stat-grid">
        <article className="stat-card">
          <div>
            <div className="stat-label">{t("recruitment.open_roles")}</div>
            <div className="stat-value">{formatNumber(counts.open, locale)}</div>
          </div>
          <span className="stat-icon">
            <BriefcaseBusiness size={18} aria-hidden="true" />
          </span>
        </article>
        <article className="stat-card">
          <div>
            <div className="stat-label">{t("recruitment.pending_approval")}</div>
            <div className="stat-value">{formatNumber(counts.pending, locale)}</div>
          </div>
          <span className="stat-icon stat-icon-gold">
            <UserRound size={18} aria-hidden="true" />
          </span>
        </article>
        <article className="stat-card">
          <div>
            <div className="stat-label">{t("recruitment.applications")}</div>
            <div className="stat-value">{formatNumber(counts.applications, locale)}</div>
          </div>
          <span className="stat-icon stat-icon-coral">
            <ArrowRight size={18} aria-hidden="true" />
          </span>
        </article>
      </div>

      <div className="toolbar mt-4">
        <label className="sr-only" htmlFor="requisition-status">
          {t("requests.status")}
        </label>
        <select
          id="requisition-status"
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t("app.all")}</option>
          {requisitionStatuses.map((item) => (
            <option value={item} key={item}>
              {t(`status.${item}`)}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="tiny muted">
          {t("recruitment.total_applications", { count: counts.applications })}
        </span>
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : requisitions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BriefcaseBusiness}
            title={t("recruitment.empty_requisitions")}
            body={t("recruitment.empty_requisitions_body")}
            action={
              canManage ? (
                <Link className="btn btn-primary" href={`/${locale}/recruitment/new`}>
                  <Plus size={15} aria-hidden="true" />
                  {t("recruitment.new_requisition")}
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-2">
          {requisitions.map((requisition) => {
            const applications =
              data?.applications?.items.filter(
                (application) => application.requisition_id === requisition.id,
              ) ?? [];
            return (
              <article className="card card-pad" key={requisition.id}>
                <div className="row-between">
                  <StatusBadge status={requisition.status} />
                  <span className="tiny muted">
                    {formatDate(requisition.created_at, locale)}
                  </span>
                </div>
                <h2 className="section-title mt-3">{requisition.title}</h2>
                <div className="row wrap mt-2 tiny muted">
                  {requisition.location && (
                    <span className="row">
                      <MapPin size={12} aria-hidden="true" />
                      {requisition.location}
                    </span>
                  )}
                  <span>·</span>
                  <span>
                    {requisition.employment_type === "full_time"
                      ? t("recruitment.full_time")
                      : requisition.employment_type === "part_time"
                        ? t("recruitment.part_time")
                        : requisition.employment_type === "contract"
                          ? t("recruitment.contract")
                          : t("recruitment.internship")}
                  </span>
                </div>
                <p className="section-copy mt-2 line-clamp-3">{requisition.description}</p>
                <div className="row-between mt-3">
                  <span className="tiny muted">
                    {t("recruitment.total_applications", {
                      count: applications.length,
                    })}
                  </span>
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={`/${locale}/recruitment/${requisition.id}`}
                  >
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
        <h3>{t("recruitment.human_decision")}</h3>
        <p>{t("recruitment.apply_note")}</p>
      </div>
    </div>
  );
}
