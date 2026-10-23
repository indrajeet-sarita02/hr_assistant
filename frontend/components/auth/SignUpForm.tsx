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
} from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useI18n } from "@/components/layout/LocaleProvider";
import { Logo } from "@/components/layout/Logo";
import { useSession } from "@/components/layout/SessionProvider";
import { ApiError } from "@/lib/api-client";
import { postAuthPath } from "@/lib/navigation";

export function SignUpForm({
  locale,
  next,
}: {
  locale: string;
  next: string;
}) {
  const { t } = useI18n();
  const { register, status, me } = useSession();
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    if (status === "authenticated" && me && !submitting) {
      router.replace(postAuthPath(me, next, locale));
    }
  }, [status, me, submitting, next, locale, router]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof fieldErrors = {};
    if (!fullName.trim()) nextErrors.fullName = t("auth.name_required");
    if (!email.trim()) nextErrors.email = t("auth.email_required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = t("auth.email_invalid");
    }
    if (password.length < 12) nextErrors.password = t("auth.password_min");
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = t("auth.password_mismatch");
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await register({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        locale,
      });
      router.replace(postAuthPath(created, next, locale));
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError(t("auth.account_exists"));
      } else if (caught instanceof ApiError && caught.status === 422) {
        setError(t("auth.registration_invalid"));
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
            {t("auth.signup_eyebrow")}
          </span>
          <h1 className="auth-brand-title">{t("auth.signup_title")}</h1>
          <p className="auth-brand-body">{t("auth.signup_subtitle")}</p>
          <ul className="auth-points">
            <li className="auth-point">
              <Check size={15} aria-hidden="true" />
              {t("auth.signup_point_resume")}
            </li>
            <li className="auth-point">
              <Check size={15} aria-hidden="true" />
              {t("auth.signup_point_tests")}
            </li>
            <li className="auth-point">
              <LockKeyhole size={15} aria-hidden="true" />
              {t("auth.signup_point_private")}
            </li>
          </ul>
        </div>
        <div className="auth-brand-footer">
          <span>HR Assist · {t("app.demo")}</span>
          <span>{t("app.advisory")}</span>
        </div>
      </section>

      <section className="auth-form-panel" aria-labelledby="signup-title">
        <div className="auth-form-top">
          <LanguageSwitcher showLabel />
        </div>
        <div className="auth-form-body">
          <h2 className="auth-form-title" id="signup-title">
            {t("auth.create_account")}
          </h2>
          <p className="auth-form-subtitle">{t("auth.signup_subtitle")}</p>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {error && (
              <div className="alert alert-error" role="alert">
                <ShieldCheck size={17} aria-hidden="true" />
                <div>{error}</div>
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="full-name">
                {t("auth.full_name")}
              </label>
              <input
                ref={nameRef}
                id="full-name"
                name="name"
                type="text"
                autoComplete="name"
                className="input"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  setFieldErrors((current) => ({ ...current, fullName: undefined }));
                }}
                aria-invalid={fieldErrors.fullName ? true : undefined}
                aria-describedby={fieldErrors.fullName ? "full-name-error" : undefined}
                maxLength={200}
                required
              />
              {fieldErrors.fullName && (
                <div className="error-text" id="full-name-error" role="alert">
                  {fieldErrors.fullName}
                </div>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="email">
                {t("auth.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className="input"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                maxLength={320}
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
                  autoComplete="new-password"
                  className="input"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: undefined }));
                  }}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password ? "password-error" : "password-hint"
                  }
                  minLength={12}
                  maxLength={128}
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
              <div className="hint" id="password-hint">
                {t("auth.password_hint")}
              </div>
              {fieldErrors.password && (
                <div className="error-text" id="password-error" role="alert">
                  {fieldErrors.password}
                </div>
              )}
            </div>

            <div className="field">
              <label className="label" htmlFor="confirm-password">
                {t("auth.confirm_password")}
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="input"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setFieldErrors((current) => ({
                    ...current,
                    confirmPassword: undefined,
                  }));
                }}
                aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                aria-describedby={
                  fieldErrors.confirmPassword
                    ? "confirm-password-error"
                    : undefined
                }
                required
              />
              {fieldErrors.confirmPassword && (
                <div className="error-text" id="confirm-password-error" role="alert">
                  {fieldErrors.confirmPassword}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block auth-submit"
              disabled={submitting}
            >
              {submitting ? t("auth.creating_account") : t("auth.create_account")}
            </button>
          </form>

          <p className="auth-legal">
            {t("auth.signup_terms")}{" "}
            <Link href={`/${locale}/privacy`}>{t("public.privacy")}</Link> ·{" "}
            <Link href={`/${locale}/terms`}>{t("public.terms")}</Link>
          </p>

          <p className="auth-return">
            {t("auth.have_account")}{" "}
            <Link
              href={`/${locale}/sign-in?next=${encodeURIComponent(next)}`}
            >
              {t("actions.sign_in")}
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
