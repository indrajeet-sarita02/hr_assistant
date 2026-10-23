"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  GraduationCap,
  LayoutDashboard,
  Menu,
  PenLine,
  UserRound,
  X,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useI18n } from "@/components/layout/LocaleProvider";
import { Logo } from "@/components/layout/Logo";
import { useSession } from "@/components/layout/SessionProvider";

const publicLinks = [
  { href: "", label: "nav.home", icon: PenLine },
  { href: "/jobs", label: "nav.jobs", icon: BriefcaseBusiness },
  { href: "/exams", label: "nav.exams", icon: GraduationCap },
  { href: "/courses", label: "nav.courses", icon: GraduationCap },
  { href: "/mock-tests", label: "nav.mock_tests", icon: LayoutDashboard },
] as const;

export function PublicHeader() {
  const { locale, t } = useI18n();
  const { me, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const localeRoot = `/${locale}`;
  const localPath = pathname.replace(/^\/(en|hi)/, "") || "/";

  function isActive(href: string) {
    if (href === "") return localPath === "/";
    return localPath === href || localPath.startsWith(`${href}/`);
  }

  const signInHref = `/${locale}/sign-in?next=${encodeURIComponent(pathname)}`;
  const isInternal = me?.user.user_type === "internal";

  return (
    <header className="public-header">
      <div className="public-header-inner">
        <Logo locale={locale} subtitle={t("nav.career")} />
        <nav className="public-nav" aria-label={t("nav.main_menu")}>
          {publicLinks.map((item) => (
            <Link
              key={item.href}
              href={`${localeRoot}${item.href}`}
              className={`public-nav-link${isActive(item.href) ? " is-active" : ""}`}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>
        <div className="public-header-actions">
          <LanguageSwitcher />
          {status === "authenticated" && isInternal ? (
            <Link className="btn btn-secondary btn-sm" href={`/${locale}/dashboard`}>
              <LayoutDashboard size={15} aria-hidden="true" />
              {t("nav.workspace")}
            </Link>
          ) : status === "authenticated" ? (
            <Link className="btn btn-secondary btn-sm" href={`/${locale}/account`}>
              <UserRound size={15} aria-hidden="true" />
              {t("nav.account")}
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" href={`/${locale}/sign-up`}>
                {t("auth.create_account")}
              </Link>
              <Link className="btn btn-primary btn-sm" href={signInHref}>
                {t("nav.sign_in")}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon mobile-menu-button"
            aria-expanded={open}
            aria-controls="public-mobile-menu"
            aria-label={open ? t("nav.close_menu") : t("nav.open_menu")}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mobile-public-menu" id="public-mobile-menu">
          <nav aria-label={t("nav.main_menu")}>
            {publicLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={`${localeRoot}${item.href}`}
                  className={isActive(item.href) ? "is-active" : undefined}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="row">
                    <Icon size={16} aria-hidden="true" />
                    {t(item.label)}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="row wrap mt-3">
            <LanguageSwitcher />
            <span className="spacer" />
            {status === "authenticated" ? (
              <>
                <Link
                  className="btn btn-secondary btn-sm"
                  href={`/${locale}/account`}
                  onClick={() => setOpen(false)}
                >
                  {t("nav.account")}
                </Link>
                <Link
                  className="btn btn-secondary btn-sm"
                  href={`/${locale}/${isInternal ? "dashboard" : "resume"}`}
                  onClick={() => setOpen(false)}
                >
                  {isInternal ? t("nav.workspace") : t("nav.resume")}
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    await fetch("/api/session/logout", {
                      method: "POST",
                      credentials: "same-origin",
                    });
                    setOpen(false);
                    router.push(`/${locale}`);
                    router.refresh();
                  }}
                >
                  {t("nav.sign_out")}
                </button>
              </>
            ) : (
              <>
                <Link
                  className="btn btn-secondary btn-sm"
                  href={`/${locale}/sign-up`}
                  onClick={() => setOpen(false)}
                >
                  {t("auth.create_account")}
                </Link>
                <Link
                  className="btn btn-primary btn-sm"
                  href={signInHref}
                  onClick={() => setOpen(false)}
                >
                  {t("nav.sign_in")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
