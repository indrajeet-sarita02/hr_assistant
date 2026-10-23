import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck2,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";

import { ReportContentForm } from "@/components/public/ReportContentForm";
import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import type { CareerContent } from "@/lib/types";

async function loadExam(id: string) {
  return (
    (await serverGet<CareerContent>(`/career/exams/${id}`)) ??
    serverGet<CareerContent>(`/career/content/${id}`)
  );
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const locale = normalizeLocale(params.locale);
  const exam = await loadExam(params.id);
  const t = createTranslator(locale);
  return {
    title: exam?.title || t("public.exams_title"),
    description: exam?.summary || t("public.exams_body"),
    alternates: { canonical: `/${locale}/exams/${params.id}` },
  };
}

export default async function ExamDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const exam = await loadExam(params.id);
  if (!exam) notFound();

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="article-shell">
          <article className="article-card">
            <Link className="btn btn-ghost btn-sm" href={`/${locale}/exams`}>
              <ArrowLeft size={14} aria-hidden="true" />
              {t("public.exams_title")}
            </Link>

            <div className="row wrap mt-3">
              <span className="badge badge-neutral">
                <GraduationCap size={11} aria-hidden="true" />
                {t("public.type.exam")}
              </span>
              {exam.source_checked_at && (
                <span className="badge badge-success">
                  <CalendarCheck2 size={11} aria-hidden="true" />
                  {t("public.source_checked", {
                    date: formatDate(exam.source_checked_at, locale),
                  })}
                </span>
              )}
              {exam.expires_at && (
                <span className="badge badge-warning">
                  {t("public.review_due")}: {formatDate(exam.expires_at, locale)}
                </span>
              )}
            </div>

            <h1 className="article-title">{exam.title}</h1>
            {exam.summary && <p className="article-lede">{exam.summary}</p>}

            <div className="exam-facts">
              <div>
                <span className="tiny muted">{t("public.exam_authority")}</span>
                <span>{exam.exam_authority || t("app.not_available")}</span>
              </div>
              <div>
                <span className="tiny muted">{t("public.syllabus_version")}</span>
                <span>{exam.syllabus_version || t("app.not_available")}</span>
              </div>
              <div>
                <span className="tiny muted">{t("public.geography")}</span>
                <span>{exam.geography || t("app.not_available")}</span>
              </div>
            </div>

            <div className="notice notice-warning">
              {t("public.exams_body")}
            </div>

            <div className="article-body">
              {exam.body.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <div className="article-meta">
              <div>
                <ShieldCheck size={15} aria-hidden="true" />
                <span>
                  {t("public.source")}:{" "}
                  {exam.source ? (
                    <a href={exam.source} target="_blank" rel="noreferrer">
                      {exam.source}
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  ) : (
                    t("app.not_available")
                  )}
                </span>
              </div>
            </div>
          </article>

          <aside className="article-aside">
            <div className="aside-card">
              <h3>{t("public.exams_title")}</h3>
              <p>{t("app.advisory")}</p>
            </div>
            <ReportContentForm
              contentType="exam"
              contentId={exam.id}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
