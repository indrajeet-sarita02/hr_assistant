import { AuthStatusCard } from "@/components/auth/AuthStatusCard";
import { normalizeLocale } from "@/lib/i18n";
import { safeNextPath } from "@/lib/navigation";

export const metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

export default function AccessDeniedPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string | string[] };
}) {
  const locale = normalizeLocale(params.locale);
  return (
    <AuthStatusCard
      kind="access-denied"
      next={safeNextPath(searchParams.next, locale)}
    />
  );
}
