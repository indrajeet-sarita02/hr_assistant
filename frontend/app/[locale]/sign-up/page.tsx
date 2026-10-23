import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/SignUpForm";
import { normalizeLocale } from "@/lib/i18n";
import { safeNextPath } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false, follow: false },
};

export default function SignUpPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string | string[] };
}) {
  const locale = normalizeLocale(params.locale);
  const next = safeNextPath(searchParams.next, locale);

  return <SignUpForm locale={locale} next={next} />;
}
