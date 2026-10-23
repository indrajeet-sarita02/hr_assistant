"use client";

import Link from "next/link";
import { ArrowLeft, Home, LogIn, ShieldAlert } from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useI18n } from "@/components/layout/LocaleProvider";
import { Logo } from "@/components/layout/Logo";

export function AuthStatusCard({
  kind,
  next,
}: {
  kind: "access-denied" | "session-expired";
  next?: string;
}) {
  const { locale, t } = useI18n();
  const isDenied = kind === "access-denied";
  const title = isDenied ? t("auth.access_denied_title") : t("auth.session_expired_title");
  const body = isDenied ? t("auth.access_denied_body") : t("auth.session_expired_body");
  const signInHref = `/${locale}/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="auth-shell">
      <section className="auth-brand-panel" aria-label={t("app.name")}>
        <Logo locale={locale} subtitle={t("app.tagline")} />
        <div className="auth-brand-content">
          <span className="auth-brand-eyebrow">
            <ShieldAlert size={13} aria-hidden="true" />
            {t("app.powered")}
          </span>
          <h1 className="auth-brand-title">{title}</h1>
          <p className="auth-brand-body">{t("auth.public_promise")}</p>
        </div>
        <div className="auth-brand-footer">
          <span>HR Assist · {t("app.demo")}</span>
          <span>{t("app.advisory")}</span>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-top">
          <LanguageSwitcher showLabel />
        </div>
        <div className="auth-form-body">
          <div className="auth-message-state">
            <span className="auth-message-icon">
              <ShieldAlert size={25} aria-hidden="true" />
            </span>
            <h1 className="auth-form-title">{title}</h1>
            <p className="auth-form-subtitle">{body}</p>
            <div className="cluster justify-center">
              <Link className="btn btn-primary" href={signInHref}>
                <LogIn size={16} aria-hidden="true" />
                {t("actions.sign_in")}
              </Link>
              <Link className="btn btn-secondary" href={`/${locale}`}>
                <Home size={16} aria-hidden="true" />
                {t("auth.back_home")}
              </Link>
            </div>
            <Link className="auth-back" href={`/${locale}`}>
              <ArrowLeft size={13} aria-hidden="true" />
              {t("public.career_home")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
