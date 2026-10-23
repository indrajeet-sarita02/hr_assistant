import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Flag } from "lucide-react";

import {
  ReportContentForm,
  type ContentFeedbackOption,
} from "@/components/public/ReportContentForm";
import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { serverGetPage, withQuery } from "@/lib/server-api";
import type { CareerContent, Course, MockTest } from "@/lib/types";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title: locale === "hi" ? "सामग्री प्रतिक्रिया" : "Content feedback",
    description:
      locale === "hi"
        ? "पुरानी, गलत या टूटी करियर सामग्री की रिपोर्ट करें।"
        : "Report outdated, inaccurate or broken career content.",
    alternates: { canonical: `/${locale}/content-feedback` },
  };
}

export default async function ContentFeedbackPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const [contentPage, coursePage, testPage] = await Promise.all([
    serverGetPage<CareerContent>(
      withQuery("/career/content", { locale, limit: 100 }),
      100,
    ),
    serverGetPage<Course>(withQuery("/courses", { locale, limit: 100 }), 100),
    serverGetPage<MockTest>(withQuery("/mock-tests", { locale, limit: 100 }), 100),
  ]);

  const options: ContentFeedbackOption[] = [
    ...contentPage.items.map((item) => ({
      type: item.content_type === "exam" ? "exam" : "career_content",
      id: item.id,
      label: item.title,
    })),
    ...coursePage.items.map((item) => ({
      type: "course",
      id: item.id,
      label: item.title,
    })),
    ...testPage.items.map((item) => ({
      type: "mock_test",
      id: item.id,
      label: item.title,
    })),
  ];

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="public-page-head">
          <span className="eyebrow">
            <Flag size={13} aria-hidden="true" />
            {t("public.feedback_title")}
          </span>
          <h1>{locale === "hi" ? "सामग्री प्रतिक्रिया" : "Content feedback"}</h1>
          <p className="section-copy">
            {locale === "hi"
              ? "पुरानी, गलत, टूटी या अनुपयुक्त करियर सामग्री की रिपोर्ट करें। संपादकीय टीम प्रत्येक रिपोर्ट की समीक्षा करती है।"
              : "Report career content that is outdated, inaccurate, broken or inappropriate. The editorial team reviews every report."}
          </p>
        </div>

        <div className="stack">
          <ReportContentForm options={options} />
          <div className="row wrap">
            <Link className="btn btn-ghost btn-sm" href={`/${locale}`}>
              <ArrowLeft size={13} aria-hidden="true" />
              {t("public.career_home")}
            </Link>
            <Link
              className="btn btn-ghost btn-sm"
              href={`/${locale}/accessibility`}
            >
              {t("public.accessibility")}
            </Link>
          </div>
          <p className="tiny muted">
            {locale === "hi"
              ? "आपकी रिपोर्ट में केवल चुनी गई सामग्री, कारण और आपकी टिप्पणी शामिल होती है। रिज़्यूमे या HR रिकॉर्ड साझा नहीं होते।"
              : "Your report includes only the selected content, the reason and your comment. Resume or HR records are not shared."}
          </p>
        </div>
      </div>
    </div>
  );
}
