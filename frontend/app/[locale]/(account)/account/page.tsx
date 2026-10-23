"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  FileText,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingPanel } from "@/components/ui/States";
import { initials, humanize } from "@/lib/format";
import { hasPermission, permissions } from "@/lib/permissions";

export default function AccountPage() {
  const { locale, t } = useI18n();
  const { me, status, logout } = useSession();
  const router = useRouter();

  if (status === "loading" || !me) {
    return (
      <div className="page page-narrow">
        <LoadingPanel label={t("app.loading")} />
      </div>
    );
  }

  const isInternal = me.user.user_type === "internal";
  const canManageResume = hasPermission(
    me.permissions,
    permissions.resumeManage,
  );

  async function signOut() {
    await logout();
    router.replace(`/${locale}`);
    router.refresh();
  }

  return (
    <div className="page page-narrow">
      <PageHeader title={t("account.title")} description={t("account.subtitle")} />

      <div className="stack">
        <section className="card">
          <div className="card-header">
            <div className="row">
              <span className="avatar">{initials(me.user.full_name)}</span>
              <div>
                <h2>{me.user.full_name}</h2>
                <p>{me.user.email}</p>
              </div>
            </div>
            <StatusBadge status={me.user.status} />
          </div>
          <div className="card-body">
            <dl className="detail-list">
              <div>
                <dt>{t("account.type")}</dt>
                <dd>
                  <span className="badge badge-neutral">
                    {isInternal ? (
                      <BriefcaseBusiness size={11} aria-hidden="true" />
                    ) : (
                      <UserRound size={11} aria-hidden="true" />
                    )}
                    {isInternal ? t("account.type_internal") : t("account.type_public")}
                  </span>
                </dd>
              </div>
              {me.active_tenant && (
                <div>
                  <dt>{t("account.organisation")}</dt>
                  <dd>{me.active_tenant.name}</dd>
                </div>
              )}
              {me.roles.length > 0 && (
                <div>
                  <dt>{t("account.roles")}</dt>
                  <dd>{me.roles.map((role) => humanize(role)).join(" · ")}</dd>
                </div>
              )}
              <div>
                <dt>{t("account.timezone")}</dt>
                <dd>{me.user.timezone}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("account.language")}</h2>
              <p>{t("account.language_body")}</p>
            </div>
          </div>
          <div className="card-body">
            <LanguageSwitcher showLabel />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("account.privacy_title")}</h2>
              <p>{t("account.privacy_body")}</p>
            </div>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="card-body stack-sm">
            <div className="row wrap">
              <Link className="btn btn-secondary btn-sm" href={`/${locale}/privacy`}>
                {t("public.privacy")}
              </Link>
              <Link className="btn btn-secondary btn-sm" href={`/${locale}/terms`}>
                {t("public.terms")}
              </Link>
              <Link
                className="btn btn-secondary btn-sm"
                href={`/${locale}/accessibility`}
              >
                {t("public.accessibility")}
              </Link>
              <Link
                className="btn btn-secondary btn-sm"
                href={`/${locale}/content-feedback`}
              >
                {t("public.feedback_link")}
              </Link>
            </div>
            <p className="tiny muted">{t("account.privacy_notice_version")}</p>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("account.actions_title")}</h2>
              <p>{t("account.actions_body")}</p>
            </div>
          </div>
          <div className="card-body row wrap">
            {isInternal ? (
              <Link className="btn btn-primary" href={`/${locale}/dashboard`}>
                <BriefcaseBusiness size={15} aria-hidden="true" />
                {t("nav.workspace")}
              </Link>
            ) : null}
            {canManageResume && (
              <Link className="btn btn-secondary" href={`/${locale}/resume`}>
                <FileText size={15} aria-hidden="true" />
                {t("nav.resume")}
              </Link>
            )}
            <span className="spacer" />
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              <LogOut size={15} aria-hidden="true" />
              {t("nav.sign_out")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
