import { AuthStatusCard } from "@/components/auth/AuthStatusCard";
import { normalizeLocale } from "@/lib/i18n";
import { safeNextPath } from "@/lib/navigation";

export const metadata = {
  title: "Session expired",
  robots: { index: false, follow: false },
};

export default function SessionExpiredPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string | string[] };
}) {
  const locale = normalizeLocale(params.locale);
  return (
    <AuthStatusCard
      kind="session-expired"
      next={safeNextPath(searchParams.next, locale)}
    />
  );
}
