"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useI18n } from "@/components/layout/LocaleProvider";
import { Logo } from "@/components/layout/Logo";
import { useSession } from "@/components/layout/SessionProvider";
import { ApiError } from "@/lib/api-client";
import { postAuthPath } from "@/lib/navigation";

interface DemoAccount {
  email: string;
  roleKey: string;
  initials: string;
}

const demoAccounts: DemoAccount[] = [
  { email: "admin@example.com", roleKey: "auth.role_admin", initials: "AD" },
  { email: "hr@example.com", roleKey: "auth.role_hr", initials: "HR" },
  { email: "employee@example.com", roleKey: "auth.role_employee", initials: "EM" },
  { email: "recruiter@example.com", roleKey: "auth.role_recruiter", initials: "RC" },
  { email: "reviewer@example.com", roleKey: "auth.role_reviewer", initials: "RV" },
  { email: "compliance@example.com", roleKey: "auth.role_compliance", initials: "CO" },
  { email: "newhire@example.com", roleKey: "auth.role_newhire", initials: "NH" },
];

export function SignInForm({
  locale,
  next,
  demoPassword,
}: {
  locale: string;
  next: string;
  demoPassword: string;
}) {
  const { t } = useI18n();
  const { login, status, me } = useSession();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>(
    {},
  );

  useEffect(() => {
    if (status === "authenticated" && me && !submitting) {
      router.replace(postAuthPath(me, next, locale));
    }
  }, [status, me, submitting, next, locale, router]);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function chooseDemo(account: DemoAccount) {
    setEmail(account.email);
    setPassword(demoPassword);
    setError(null);
    setFieldErrors({});
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = t("auth.email_required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = t("auth.email_invalid");
    }
    if (!password) nextErrors.password = t("auth.password_required");
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const current = await login(email.trim(), password);
      router.replace(postAuthPath(current, next, locale));
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError(t("auth.invalid"));
      } else {
        setError(t("auth.generic_error"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-brand-panel" aria-label={t("app.name")}>
        <Logo locale={locale} subtitle={t("app.tagline")} />
        <div className="auth-brand-content">
          <span className="auth-brand-eyebrow">
            <Sparkles size={13} aria-hidden="true" />
            {t("app.powered")}
          </span>
          <h1 className="auth-brand-title">
            {t("public.hero_title")}
          </h1>
          <p className="auth-brand-body">{t("auth.subtitle")}</p>
          <ul className="auth-points">
            <li className="auth-point">
              <Check size={15} aria-hidden="true" />
              {t("assistant.disclaimer")}
            </li>
            <li className="auth-point">
              <ShieldCheck size={15} aria-hidden="true" />
              {t("auth.public_promise")}
            </li>
            <li className="auth-point">
              <LockKeyhole size={15} aria-hidden="true" />
              {t("auth.secure")}
            </li>
          </ul>
        </div>
        <div className="auth-brand-footer">
          <span>HR Assist · {t("app.demo")}</span>
          <span>{t("app.advisory")}</span>
        </div>
      </section>

      <section className="auth-form-panel" aria-labelledby="signin-title">
        <div className="auth-form-top">
          <LanguageSwitcher showLabel />
        </div>
        <div className="auth-form-body">
          <h2 className="auth-form-title" id="signin-title">
            {t("auth.title")}
          </h2>
          <p className="auth-form-subtitle">{t("auth.subtitle")}</p>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {error && (
              <div className="alert alert-error" role="alert">
                <UserRoundCheck size={17} aria-hidden="true" />
                <div>{error}</div>
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="email">
                {t("auth.email")}
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                className="input"
                placeholder={t("auth.email_placeholder")}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                required
              />
              {fieldErrors.email && (
                <div className="error-text" id="email-error" role="alert">
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="password">
                {t("auth.password")}
              </label>
              <div className="input-group">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="input"
                  placeholder={t("auth.password_placeholder")}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  required
                />
                <button
                  type="button"
                  className="input-group-action"
                  aria-label={
                    showPassword ? t("auth.hide_password") : t("auth.show_password")
                  }
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? (
                    <EyeOff size={17} aria-hidden="true" />
                  ) : (
                    <Eye size={17} aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <div className="error-text" id="password-error" role="alert">
                  {fieldErrors.password}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block auth-submit"
              disabled={submitting}
            >
              {submitting ? t("auth.signing_in") : t("actions.sign_in")}
            </button>
          </form>

          <div className="demo-box">
            <div className="demo-box-head">
              <span className="demo-box-title">
                <Sparkles size={12} aria-hidden="true" />
                {t("auth.demo_title")}
              </span>
              <code className="demo-password">{demoPassword}</code>
            </div>
            <p className="tiny muted">{t("auth.demo_hint")}</p>
            <p className="tiny muted mt-1">
              {t("auth.demo_password", { password: demoPassword })}
            </p>
            <div className="demo-list mt-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="demo-account"
                  onClick={() => chooseDemo(account)}
                  title={`${t("auth.demo_fill")} · ${t(account.roleKey)}`}
                >
                  {t(account.roleKey)} · {account.email}
                </button>
              ))}
            </div>
            <p className="tiny muted mt-2">{t("auth.demo_only")}</p>
          </div>

          <p className="auth-legal">
            {t("auth.return")} {t("auth.local_only")}.
          </p>
          <p className="auth-return">
            {t("auth.no_account")}{" "}
            <Link href={`/${locale}/sign-up?next=${encodeURIComponent(next)}`}>
              {t("auth.create_account")}
            </Link>
          </p>
          <Link className="auth-back" href={`/${locale}`}>
            <ArrowLeft size={13} aria-hidden="true" />
            {t("auth.back_home")}
          </Link>
        </div>
      </section>
    </div>
  );
}
