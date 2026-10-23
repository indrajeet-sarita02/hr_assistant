"use client";

import Link from "next/link";

import { useI18n } from "@/components/layout/LocaleProvider";
import { Logo } from "@/components/layout/Logo";

export function PublicFooter() {
  const { locale, t } = useI18n();
  const root = `/${locale}`;
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div>
          <Logo locale={locale} subtitle={t("app.tagline")} />
          <p className="footer-note">{t("public.footer_note")}</p>
        </div>
        <div>
          <h2 className="footer-heading">{t("nav.career")}</h2>
          <ul className="footer-links">
            <li>
              <Link href={root}>{t("nav.career")}</Link>
            </li>
            <li>
              <Link href={`${root}/jobs`}>{t("nav.jobs")}</Link>
            </li>
            <li>
              <Link href={`${root}/exams`}>{t("nav.exams")}</Link>
            </li>
            <li>
              <Link href={`${root}/courses`}>{t("nav.courses")}</Link>
            </li>
            <li>
              <Link href={`${root}/mock-tests`}>{t("nav.mock_tests")}</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="footer-heading">{t("nav.account")}</h2>
          <ul className="footer-links">
            <li>
              <Link href={`${root}/sign-up`}>{t("auth.create_account")}</Link>
            </li>
            <li>
              <Link href={`${root}/sign-in`}>{t("nav.sign_in")}</Link>
            </li>
            <li>
              <Link href={`${root}/account`}>{t("nav.account")}</Link>
            </li>
            <li>
              <Link href={`${root}/resume`}>{t("nav.resume")}</Link>
            </li>
            <li>
              <Link href={`${root}/sign-in?next=${encodeURIComponent(`${root}/dashboard`)}`}>
                {t("nav.workspace")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="footer-heading">{t("footer.legal")}</h2>
          <ul className="footer-links">
            <li>
              <Link href={`${root}/privacy`}>{t("public.privacy")}</Link>
            </li>
            <li>
              <Link href={`${root}/terms`}>{t("public.terms")}</Link>
            </li>
            <li>
              <Link href={`${root}/accessibility`}>{t("public.accessibility")}</Link>
            </li>
            <li>
              <Link href={`${root}/content-feedback`}>{t("public.feedback_link")}</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} HR Assist · {t("app.demo")}
        </span>
        <span>{t("app.advisory")}</span>
      </div>
    </footer>
  );
}
