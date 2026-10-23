import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck2,
  ExternalLink,
  GraduationCap,
  Monitor,
  ShieldCheck,
} from "lucide-react";

import { ReportContentForm } from "@/components/public/ReportContentForm";
import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import type { Course } from "@/lib/types";

async function loadCourse(id: string) {
  return serverGet<Course>(`/courses/${id}`);
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const locale = normalizeLocale(params.locale);
  const course = await loadCourse(params.id);
  const t = createTranslator(locale);
  return {
    title: course?.title || t("public.courses_title"),
    description: course
      ? `${course.provider} · ${course.level} · ${course.format}`
      : t("public.courses_body"),
    alternates: { canonical: `/${locale}/courses/${params.id}` },
  };
}

export default async function CourseDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const course = await loadCourse(params.id);
  if (!course) notFound();

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="article-shell">
          <article className="article-card">
            <Link className="btn btn-ghost btn-sm" href={`/${locale}/courses`}>
              <ArrowLeft size={14} aria-hidden="true" />
              {t("public.courses_title")}
            </Link>

            <div className="row wrap mt-3">
              <span className="badge badge-neutral">
                <GraduationCap size={11} aria-hidden="true" />
                {course.level}
              </span>
              <span className="badge badge-neutral">
                <Monitor size={11} aria-hidden="true" />
                {course.format}
              </span>
              {course.topic && (
                <span className="badge badge-neutral">{course.topic}</span>
              )}
            </div>

            <h1 className="article-title">{course.title}</h1>
            <p className="article-lede">{course.provider}</p>

            <div className="exam-facts">
              <div>
                <span className="tiny muted">{t("public.course_provider")}</span>
                <span>{course.provider}</span>
              </div>
              <div>
                <span className="tiny muted">{t("public.course_level")}</span>
                <span>{course.level}</span>
              </div>
              <div>
                <span className="tiny muted">{t("public.course_format")}</span>
                <span>{course.format}</span>
              </div>
              <div>
                <span className="tiny muted">{t("public.course_topic")}</span>
                <span>{course.topic || t("app.not_available")}</span>
              </div>
            </div>

            <div className="notice notice-warning">
              {t("public.courses_body")}
            </div>

            <a
              className="btn btn-primary btn-lg mt-3"
              href={course.provider_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpen size={16} aria-hidden="true" />
              {t("public.course_open")}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
            <p className="tiny muted mt-2">{t("public.course_external_note")}</p>

            <div className="article-meta">
              <div>
                <CalendarCheck2 size={15} aria-hidden="true" />
                <span>
                  {t("public.source_checked", {
                    date: formatDate(course.source_checked_at, locale),
                  })}
                </span>
              </div>
              {course.expires_at && (
                <div>
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>
                    {t("public.review_due")}:{" "}
                    {formatDate(course.expires_at, locale)}
                  </span>
                </div>
              )}
            </div>
          </article>

          <aside className="article-aside">
            <div className="aside-card">
              <h3>{t("public.course_external_note")}</h3>
              <p>{t("public.courses_body")}</p>
            </div>
            <ReportContentForm contentType="course" contentId={course.id} />
          </aside>
        </div>
      </div>
    </div>
  );
}
