import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AppProviders } from "@/components/AppProviders";
import { DocumentLocale } from "@/components/layout/DocumentLocale";
import { isLocale, locales, normalizeLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale: Locale = normalizeLocale(params.locale);
  const title =
    locale === "hi"
      ? "HR Assist — लोगों के संचालन का कार्यक्षेत्र"
      : "HR Assist — People operations workspace";
  const description =
    locale === "hi"
      ? "पॉलिसी उत्तर, अवकाश, सेवा अनुरोध, ऑनबोर्डिंग और भर्ती के लिए द्विभाषी HR कार्यक्षेत्र।"
      : "A bilingual HR workspace for policy answers, leave, service requests, onboarding and hiring.";
  return {
    title: {
      default: title,
      template: `%s · HR Assist`,
    },
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        hi: "/hi",
      },
    },
    openGraph: {
      title,
      description,
      locale: locale === "hi" ? "hi_IN" : "en_IN",
      type: "website",
    },
  };
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();

  const accessCookie = cookies().get("hr_access")?.value;
  const refreshCookie = cookies().get("hr_refresh")?.value;
  const initialSession = Boolean(accessCookie || refreshCookie);

  return (
    <AppProviders locale={params.locale} initialSession={initialSession}>
      <DocumentLocale />
      {children}
    </AppProviders>
  );
}
