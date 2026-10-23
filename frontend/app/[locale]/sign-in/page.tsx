import type { Metadata } from "next";

import { SignInForm } from "@/components/auth/SignInForm";
import { normalizeLocale } from "@/lib/i18n";
import { safeNextPath } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string | string[] };
}) {
  const locale = normalizeLocale(params.locale);
  const next = safeNextPath(searchParams.next, locale);
  const demoPassword = process.env.DEMO_PASSWORD || "LocalDevOnly!123";

  return (
    <SignInForm locale={locale} next={next} demoPassword={demoPassword} />
  );
}
