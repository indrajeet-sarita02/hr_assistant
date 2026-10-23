"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Home,
  LogOut,
  Menu,
  X,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useI18n } from "@/components/layout/LocaleProvider";
import { Logo } from "@/components/layout/Logo";
import { useSession } from "@/components/layout/SessionProvider";
import { SkipLink } from "@/components/layout/SkipLink";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { LoadingPanel } from "@/components/ui/States";
import { apiGet } from "@/lib/api-client";
import { humanize, initials } from "@/lib/format";
import { pageForPath, visibleGroups, visibleItems } from "@/lib/nav";
import { hasPermission, permissions } from "@/lib/permissions";
import type { Notification, Page } from "@/lib/types";

function navIsActive(localPath: string, href: string): boolean {
  return localPath === href || localPath.startsWith(`${href}/`);
}

export function InternalShell({ children }: { children: React.ReactNode }) {
  const { locale, t } = useI18n();
  const { me, status, error, logout, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [unread, setUnread] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);
  const morePreviousFocus = useRef<HTMLElement | null>(null);

  const localPath = pathname.replace(/^\/(en|hi)/, "") || "/";
  const groups = useMemo(() => visibleGroups(me?.permissions), [me?.permissions]);
  const items = useMemo(() => visibleItems(me?.permissions), [me?.permissions]);
  const current = pageForPath(localPath, me?.permissions);
  const primary = items
    .filter((item) =>
      ["/dashboard", "/assistant", "/requests", "/leave"].includes(item.href),
    )
    .slice(0, 4);

  const blocked =
    status === "authenticated" &&
    (me?.user.user_type !== "internal" || !me?.active_tenant);

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = encodeURIComponent(pathname);
      router.replace(`/${locale}/sign-in?next=${next}`);
    }
  }, [status, locale, pathname, router]);

  useEffect(() => {
    if (blocked) router.replace(`/${locale}/access-denied`);
  }, [blocked, locale, router]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    morePreviousFocus.current = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      const first = moreRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      first?.focus();
    }, 20);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreOpen(false);
        return;
      }
      if (event.key !== "Tab" || !moreRef.current) return;
      const focusables = Array.from(
        moreRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        ),
      ).filter((item) => item.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = original;
      morePreviousFocus.current?.focus();
    };
  }, [moreOpen]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !hasPermission(me?.permissions, permissions.notificationRead)
    ) {
      setUnread(0);
      return;
    }
    let active = true;
    apiGet<Page<Notification>>("/me/notifications?unread_only=true&limit=1")
      .then((page) => {
        if (active) setUnread(page.total);
      })
      .catch(() => {
        if (active) setUnread(0);
      });
    return () => {
      active = false;
    };
  }, [status, me?.user.id, me?.permissions]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      router.replace(`/${locale}`);
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  if (status === "loading" || blocked) {
    return (
      <div className="standalone-state">
        <LoadingPanel label={t("app.loading")} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <main className="standalone-state">
        <ErrorPanel error={error} onRetry={() => void refresh()} />
      </main>
    );
  }

  if (!me) {
    return (
      <div className="standalone-state">
        <LoadingPanel label={t("app.loading")} />
      </div>
    );
  }

  const title = current ? t(current.key) : t("nav.workspace");
  const roleLabel = me.roles.length
    ? me.roles.map((role) => humanize(role)).join(" · ")
    : t("nav.workspace");

  return (
    <div className="app-shell">
      <SkipLink />
      <aside className="sidebar" aria-label={t("nav.main_menu")}>
        <Logo locale={locale} subtitle={t("nav.workspace")} />
        <nav className="sidebar-nav" aria-label={t("nav.main_menu")}>
          {groups.map((group) => (
            <div className="nav-group" key={group.key}>
              <div className="nav-group-label">{t(group.key)}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = navIsActive(localPath, item.href);
                return (
                  <Link
                    key={item.href}
                    href={`/${locale}${item.href}`}
                    className={`nav-link${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon aria-hidden="true" />
                    <span>{t(item.key)}</span>
                    {item.href === "/notifications" && unread > 0 && (
                      <span className="nav-badge">{unread > 9 ? "9+" : unread}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="nav-group">
            <div className="nav-group-label">{t("nav.career")}</div>
            <Link className="nav-link" href={`/${locale}`}>
              <Home aria-hidden="true" />
              <span>{t("public.career_home")}</span>
            </Link>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-note">
            <strong>{t("app.advisory")}</strong>
            {t("assistant.disclaimer")}
          </div>
          <div className="sidebar-user">
            <span className="avatar">{initials(me.user.full_name)}</span>
            <div className="sidebar-user-copy">
              <div className="sidebar-user-name">{me.user.full_name}</div>
              <div className="sidebar-user-meta">{roleLabel}</div>
            </div>
            <button
              type="button"
              className="sidebar-signout"
              aria-label={t("nav.sign_out")}
              title={t("nav.sign_out")}
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-context">
              <div className="topbar-kicker">{me.active_tenant?.name}</div>
              <div className="topbar-title">{title}</div>
            </div>
            <div className="topbar-actions">
              <LanguageSwitcher />
              {hasPermission(me.permissions, permissions.notificationRead) && (
                <Link
                  className="notification-button"
                  href={`/${locale}/notifications`}
                  aria-label={
                    unread > 0
                      ? t("nav.notifications_unread", { count: unread })
                      : t("nav.notifications")
                  }
                >
                  <Bell size={17} aria-hidden="true" />
                  {unread > 0 && (
                    <span className="notification-dot" aria-hidden="true">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-icon only-mobile"
                aria-label={t("nav.open_menu")}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(true)}
              >
                <Menu size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label={t("nav.main_menu")}>
        {primary.map((item) => {
          const Icon = item.icon;
          const active = navIsActive(localPath, item.href);
          return (
            <Link
              key={item.href}
              href={`/${locale}${item.href}`}
              className={`mobile-nav-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`mobile-nav-link${moreOpen ? " is-active" : ""}`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          onClick={() => setMoreOpen(true)}
        >
          <Menu aria-hidden="true" />
          <span>{t("nav.more")}</span>
        </button>
      </nav>

      {moreOpen && (
        <div
          className="mobile-more-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMoreOpen(false);
          }}
        >
          <div
            className="mobile-more-sheet"
            id="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.more")}
            ref={moreRef}
            tabIndex={-1}
          >
            <div className="mobile-more-handle" aria-hidden="true" />
            <div className="mobile-more-head">
              <div>
                <div className="section-title">{t("nav.more")}</div>
                <div className="tiny muted">{me.active_tenant?.name}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setMoreOpen(false)}
                aria-label={t("nav.close_menu")}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mobile-more-links">
              {items.map((item) => {
                const Icon = item.icon;
                const active = navIsActive(localPath, item.href);
                return (
                  <Link
                    key={item.href}
                    href={`/${locale}${item.href}`}
                    className={`mobile-more-link${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{t(item.key)}</span>
                  </Link>
                );
              })}
              <Link className="mobile-more-link" href={`/${locale}`}>
                <Home size={16} aria-hidden="true" />
                <span>{t("public.career_home")}</span>
              </Link>
            </div>
            <div className="mobile-more-footer">
              <LanguageSwitcher showLabel />
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
              >
                <LogOut size={15} aria-hidden="true" />
                {t("nav.sign_out")}
              </button>
            </div>
            <div className="row mt-3">
              <span className="avatar">{initials(me.user.full_name)}</span>
              <div className="spacer">
                <div className="small" style={{ fontWeight: 650 }}>
                  {me.user.full_name}
                </div>
                <div className="tiny muted">{me.user.email}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
