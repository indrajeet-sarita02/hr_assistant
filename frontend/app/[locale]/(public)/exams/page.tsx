import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck2, GraduationCap } from "lucide-react";

import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { serverGetPage, withQuery } from "@/lib/server-api";
import type { CareerContent } from "@/lib/types";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title: locale === "hi" ? "परीक्षा योजना" : "Exam planning",
    description:
      locale === "hi"
        ? "तिथियाँ, पात्रता और पाठ्यक्रम आधिकारिक अधिसूचना से जाँचें।"
        : "Verify dates, eligibility and syllabus against the official authority notification.",
    alternates: { canonical: `/${locale}/exams` },
  };
}

export default async function ExamsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const local = await serverGetPage<CareerContent>(
    withQuery("/career/content", { locale, limit: 100 }),
  );
  const content =
    locale === "hi" && local.total === 0
      ? await serverGetPage<CareerContent>(
          withQuery("/career/content", { locale: "en", limit: 100 }),
        )
      : local;
  const items = content.items.filter((item) => item.content_type === "exam");
  const usingFallback = locale !== "en" && local.total === 0 && content.total > 0;

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="public-page-head">
          <span className="eyebrow">
            <GraduationCap size={13} aria-hidden="true" />
            {t("public.exams_title")}
          </span>
          <h1>{t("public.exams_title")}</h1>
          <p className="section-copy">{t("public.exams_body")}</p>
        </div>

        {usingFallback && (
          <div className="notice notice-warning">
            {locale === "hi"
              ? "हिन्दी सामग्री अभी उपलब्ध नहीं है। अंग्रेज़ी सामग्री दिखाई जा रही है।"
              : "Localized content is not available yet, so English content is shown."}
          </div>
        )}

        {items.length === 0 ? (
          <div className="public-empty">
            <h2>{t("public.no_content")}</h2>
            <p>{t("public.no_content_body")}</p>
          </div>
        ) : (
          <div className="public-card-grid">
            {items.map((item) => (
              <article className="public-content-card" key={item.id}>
                <div className="row-between">
                  <span className="badge badge-neutral">
                    {t("public.type.exam")}
                  </span>
                  {item.source_checked_at && (
                    <span className="tiny muted">
                      <CalendarCheck2
                        size={11}
                        aria-hidden="true"
                        style={{ display: "inline", marginRight: 3 }}
                      />
                      {formatDate(item.source_checked_at, locale)}
                    </span>
                  )}
                </div>
                <h2 className="section-title mt-3">{item.title}</h2>
                {item.summary && <p className="section-copy">{item.summary}</p>}
                <div className="exam-meta mt-3">
                  {item.exam_authority && (
                    <div>
                      <span className="tiny muted">{t("public.exam_authority")}</span>
                      <span className="small">{item.exam_authority}</span>
                    </div>
                  )}
                  {item.syllabus_version && (
                    <div>
                      <span className="tiny muted">
                        {t("public.syllabus_version")}
                      </span>
                      <span className="small">{item.syllabus_version}</span>
                    </div>
                  )}
                </div>
                <div className="row-between mt-3">
                  <span className="tiny muted">{item.geography || ""}</span>
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={`/${locale}/exams/${item.id}`}
                  >
                    {t("public.view_guide")}
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
