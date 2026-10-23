import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarCheck2 } from "lucide-react";

import {
  createTranslator,
  normalizeLocale,
  type Locale,
} from "@/lib/i18n";
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
    title: locale === "hi" ? "नौकरियाँ और भूमिका गाइड" : "Jobs and role guides",
    description:
      locale === "hi"
        ? "आवेदन से पहले सामान्य जिम्मेदारियाँ और आवश्यकताएँ समझें।"
        : "Understand typical responsibilities and requirements before you apply.",
    alternates: { canonical: `/${locale}/jobs` },
  };
}

export default async function JobsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const local = await serverGetPage<CareerContent>(
    withQuery("/career/content", { locale, limit: 100 }),
    100,
  );
  const content =
    locale === "hi" && local.total === 0
      ? await serverGetPage<CareerContent>(
          withQuery("/career/content", { locale: "en", limit: 100 }),
          100,
        )
      : local;
  const items = content.items.filter((item) =>
    ["job", "article", "salary"].includes(item.content_type),
  );
  const usingFallback = locale !== "en" && local.total === 0 && content.total > 0;

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="public-page-head">
          <span className="eyebrow">
            <BriefcaseBusiness size={13} aria-hidden="true" />
            {t("public.guides_title")}
          </span>
          <h1>{t("public.jobs_title")}</h1>
          <p className="section-copy">{t("public.jobs_body")}</p>
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
                    {t(`public.type.${item.content_type}`)}
                  </span>
                  {item.source_checked_at && (
                    <span className="tiny muted">
                      <CalendarCheck2
                        size={11}
                        aria-hidden="true"
                        style={{ display: "inline", marginRight: 3 }}
                      />
                      {t("public.source_checked", {
                        date: formatDate(item.source_checked_at, locale),
                      })}
                    </span>
                  )}
                </div>
                <h2 className="section-title mt-3">{item.title}</h2>
                {item.summary && <p className="section-copy">{item.summary}</p>}
                <div className="row-between mt-3">
                  <span className="tiny muted">
                    {item.geography || item.source || ""}
                  </span>
                  <Link className="btn btn-secondary btn-sm" href={`/${locale}/jobs/${item.id}`}>
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
