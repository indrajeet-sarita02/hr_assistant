"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { InternalShell } from "@/components/layout/InternalShell";
import { useI18n } from "@/components/layout/LocaleProvider";
import { PublicShell } from "@/components/layout/PublicShell";
import { useSession } from "@/components/layout/SessionProvider";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { LoadingPanel } from "@/components/ui/States";

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { locale, t } = useI18n();
  const { me, status, error, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = encodeURIComponent(pathname);
      router.replace(`/${locale}/sign-in?next=${next}`);
    }
  }, [status, locale, pathname, router]);

  if (status === "loading" || status === "unauthenticated" || !me) {
    if (status === "error") {
      return (
        <main className="standalone-state">
          <ErrorPanel error={error} onRetry={() => void refresh()} />
        </main>
      );
    }
    return (
      <div className="standalone-state">
        <LoadingPanel label={t("app.loading")} />
      </div>
    );
  }

  if (me.user.user_type === "internal") {
    return <InternalShell>{children}</InternalShell>;
  }

  return <PublicShell>{children}</PublicShell>;
}
