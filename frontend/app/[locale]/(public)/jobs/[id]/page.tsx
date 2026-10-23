import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck2,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { ReportContentForm } from "@/components/public/ReportContentForm";
import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import type { CareerContent } from "@/lib/types";

async function loadContent(id: string) {
  return serverGet<CareerContent>(`/career/content/${id}`);
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const locale = normalizeLocale(params.locale);
  const content = await loadContent(params.id);
  const t = createTranslator(locale);
  return {
    title: content?.title || t("public.jobs_title"),
    description: content?.summary || t("public.jobs_body"),
    alternates: { canonical: `/${locale}/jobs/${params.id}` },
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const content = await loadContent(params.id);
  if (!content) notFound();
  const hasSalary = content.salary_min || content.salary_max;

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="article-shell">
          <article className="article-card">
            <Link className="btn btn-ghost btn-sm" href={`/${locale}/jobs`}>
              <ArrowLeft size={14} aria-hidden="true" />
              {t("public.jobs_title")}
            </Link>

            <div className="row wrap mt-3">
              <span className="badge badge-neutral">
                {t(`public.type.${content.content_type}`)}
              </span>
              {content.geography && (
                <span className="badge badge-neutral">
                  <MapPin size={11} aria-hidden="true" />
                  {content.geography}
                </span>
              )}
              {content.source_checked_at && (
                <span className="badge badge-success">
                  <CalendarCheck2 size={11} aria-hidden="true" />
                  {t("public.source_checked", {
                    date: formatDate(content.source_checked_at, locale),
                  })}
                </span>
              )}
            </div>

            <h1 className="article-title">{content.title}</h1>
            {content.summary && (
              <p className="article-lede">{content.summary}</p>
            )}

            {hasSalary && (
              <div className="salary-band">
                <div>
                  <div className="tiny muted">{t("public.salary_range")}</div>
                  <div className="salary-band-value">
                    {formatCurrency(
                      content.salary_min,
                      locale,
                      content.currency || "INR",
                    )}
                    <span className="salary-band-dash">—</span>
                    {formatCurrency(
                      content.salary_max,
                      locale,
                      content.currency || "INR",
                    )}
                  </div>
                </div>
                <div className="salary-band-side">
                  <Wallet size={16} aria-hidden="true" />
                  <span>
                    {content.salary_is_estimate
                      ? t("public.estimate")
                      : t("public.salary_range")}
                  </span>
                </div>
              </div>
            )}

            {hasSalary && (
              <p className="tiny muted">{t("public.salary_disclaimer")}</p>
            )}

            <div className="article-body">
              {content.body.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <div className="article-meta">
              <div>
                <ShieldCheck size={15} aria-hidden="true" />
                <span>
                  {t("public.source")}:{" "}
                  {content.source ? (
                    <a href={content.source} target="_blank" rel="noreferrer">
                      {content.source}
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  ) : (
                    t("app.not_available")
                  )}
                </span>
              </div>
              {content.expires_at && (
                <div>
                  <CalendarCheck2 size={15} aria-hidden="true" />
                  <span>
                    {t("public.review_due")}: {formatDate(content.expires_at, locale)}
                  </span>
                </div>
              )}
            </div>
          </article>

          <aside className="article-aside">
            <div className="aside-card">
              <h3>{t("public.footer_note")}</h3>
              <p>
                {t("app.advisory")}
              </p>
            </div>
            <ReportContentForm
              contentType="career_content"
              contentId={content.id}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
