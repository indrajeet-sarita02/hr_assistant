import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarCheck2 } from "lucide-react";

import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { serverGetPage, withQuery } from "@/lib/server-api";
import type { Course } from "@/lib/types";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title: locale === "hi" ? "कौशल कोर्स" : "Skills courses",
    description:
      locale === "hi"
        ? "समीक्षित शिक्षण संसाधन। प्रदाता की वर्तमान शर्तें जाँचें।"
        : "Reviewed learning resources. Always confirm the provider's current terms.",
    alternates: { canonical: `/${locale}/courses` },
  };
}

export default async function CoursesPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const local = await serverGetPage<Course>(
    withQuery("/courses", { locale, limit: 100 }),
    100,
  );
  const courses =
    locale === "hi" && local.total === 0
      ? await serverGetPage<Course>(
          withQuery("/courses", { locale: "en", limit: 100 }),
          100,
        )
      : local;

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="public-page-head">
          <span className="eyebrow">
            <BookOpen size={13} aria-hidden="true" />
            {t("public.courses_title")}
          </span>
          <h1>{t("public.courses_title")}</h1>
          <p className="section-copy">{t("public.courses_body")}</p>
        </div>

        {courses.items.length === 0 ? (
          <div className="public-empty">
            <h2>{t("public.no_content")}</h2>
            <p>{t("public.no_content_body")}</p>
          </div>
        ) : (
          <div className="public-card-grid">
            {courses.items.map((course) => (
              <article className="public-content-card" key={course.id}>
                <div className="row-between">
                  <span className="badge badge-neutral">
                    {course.level || t("public.course_level")}
                  </span>
                  <span className="tiny muted">
                    <CalendarCheck2
                      size={11}
                      aria-hidden="true"
                      style={{ display: "inline", marginRight: 3 }}
                    />
                    {formatDate(course.source_checked_at, locale)}
                  </span>
                </div>
                <h2 className="section-title mt-3">{course.title}</h2>
                <div className="tiny muted mt-1">{course.provider}</div>
                <p className="section-copy mt-2">
                  {course.topic || t("public.courses_body")}
                </p>
                <div className="row-between mt-3">
                  <span className="badge badge-neutral">{course.format}</span>
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={`/${locale}/courses/${course.id}`}
                  >
                    {t("public.course_open")}
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
