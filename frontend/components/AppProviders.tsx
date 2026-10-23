"use client";

import { ToastProvider } from "@/components/feedback/ToastProvider";
import { LocaleProvider } from "@/components/layout/LocaleProvider";
import { SessionProvider } from "@/components/layout/SessionProvider";
import type { Locale } from "@/lib/i18n";

export function AppProviders({
  children,
  locale,
  initialSession,
}: {
  children: React.ReactNode;
  locale: Locale;
  initialSession: boolean;
}) {
  return (
    <LocaleProvider locale={locale}>
      <ToastProvider>
        <SessionProvider initialSession={initialSession}>
          {children}
        </SessionProvider>
      </ToastProvider>
    </LocaleProvider>
  );
}
