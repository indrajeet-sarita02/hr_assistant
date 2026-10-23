"use client";

import Link from "next/link";
import { Compass, Home } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";

export default function LocaleNotFound() {
  const { locale, t } = useI18n();
  return (
    <main className="standalone-state" role="main">
      <div className="state-card">
        <span className="empty-icon">
          <Compass size={24} aria-hidden="true" />
        </span>
        <h1>{t("state.not_found_title")}</h1>
        <p>{t("state.not_found_body")}</p>
        <div className="cluster justify-center">
          <Link className="btn btn-primary" href={`/${locale}`}>
            <Home size={16} aria-hidden="true" />
            {t("public.career_home")}
          </Link>
          <Link className="btn btn-secondary" href={`/${locale}/sign-in`}>
            {t("nav.sign_in")}
          </Link>
        </div>
      </div>
    </main>
  );
}
