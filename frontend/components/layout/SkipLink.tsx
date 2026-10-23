"use client";

import { useI18n } from "@/components/layout/LocaleProvider";

export function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main-content">
      {t("app.skip")}
    </a>
  );
}
