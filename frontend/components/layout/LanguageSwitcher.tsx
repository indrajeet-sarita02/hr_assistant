"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import { localeNames, locales, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({
  inverted = false,
  showLabel = false,
}: {
  inverted?: boolean;
  showLabel?: boolean;
}) {
  const { locale, t } = useI18n();
  const { status } = useSession();
  const { notify } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<Locale | null>(null);

  async function switchTo(next: Locale) {
    if (next === locale || pending) return;
    setPending(next);
    document.cookie = `hr_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if (status === "authenticated") {
      try {
        await apiFetch("/preferences/locale", {
          method: "PUT",
          json: { locale: next },
          timeoutMs: 8000,
        });
      } catch {
        // Navigation still works; the explicit language choice is kept in a cookie.
        notify(t("locale.failed"), "error");
      }
    }
    const nextPath = pathname.replace(
      /^\/(en|hi)(?=\/|$)/,
      `/${next}`,
    );
    const search = window.location.search;
    router.push(`${nextPath}${search}`);
    router.refresh();
  }

  return (
    <div
      className={`language-switcher${inverted ? " is-inverted" : ""}`}
      role="group"
      aria-label={t("locale.switch")}
    >
      {showLabel && (
        <span className="language-switcher-label">
          <Languages size={16} aria-hidden="true" />
          {t("locale.switch")}
        </span>
      )}
      {locales.map((item) => (
        <button
          key={item}
          type="button"
          className={`language-option${item === locale ? " is-active" : ""}`}
          aria-pressed={item === locale}
          aria-label={
            item === "en" ? t("locale.switch_to_en") : t("locale.switch_to_hi")
          }
          disabled={pending !== null}
          onClick={() => void switchTo(item)}
        >
          {item === "en" ? "EN" : "हिं"}
          <span className="sr-only">{localeNames[item]}</span>
        </button>
      ))}
    </div>
  );
}
