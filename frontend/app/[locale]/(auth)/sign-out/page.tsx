import { SignOutView } from "@/components/auth/SignOutView";
import { normalizeLocale } from "@/lib/i18n";
import { safeNextPath } from "@/lib/navigation";

export const metadata = {
  title: "Signed out",
  robots: { index: false, follow: false },
};

export default function SignOutPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string | string[] };
}) {
  const locale = normalizeLocale(params.locale);
  return (
    <SignOutView next={safeNextPath(searchParams.next, locale)} />
  );
}
