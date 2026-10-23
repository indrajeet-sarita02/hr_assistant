import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, ListChecks, Target } from "lucide-react";

import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { serverGetPage, withQuery } from "@/lib/server-api";
import type { MockTest } from "@/lib/types";

export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  const locale = normalizeLocale(params.locale);
  return {
    title: locale === "hi" ? "मॉक टेस्ट" : "Mock tests",
    description:
      locale === "hi"
        ? "समयबद्ध अभ्यास परीक्षण, ऑटोसेव और उत्तर समीक्षा।"
        : "Timed practice tests with autosave and answer review.",
    alternates: { canonical: `/${locale}/mock-tests` },
  };
}

export default async function MockTestsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const local = await serverGetPage<MockTest>(
    withQuery("/mock-tests", { locale, limit: 100 }),
    100,
  );
  const tests =
    locale === "hi" && local.total === 0
      ? await serverGetPage<MockTest>(
          withQuery("/mock-tests", { locale: "en", limit: 100 }),
          100,
        )
      : local;

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="public-page-head">
          <span className="eyebrow">
            <ListChecks size={13} aria-hidden="true" />
            {t("public.tests_title")}
          </span>
          <h1>{t("public.tests_title")}</h1>
          <p className="section-copy">{t("public.tests_body")}</p>
        </div>

        {tests.items.length === 0 ? (
          <div className="public-empty">
            <h2>{t("public.no_content")}</h2>
            <p>{t("public.no_content_body")}</p>
          </div>
        ) : (
          <div className="public-card-grid">
            {tests.items.map((test) => (
              <article className="public-content-card" key={test.id}>
                <div className="row wrap">
                  <span className="badge badge-neutral">
                    <Clock3 size={11} aria-hidden="true" />
                    {t("public.mock_duration", {
                      minutes: test.duration_minutes,
                    })}
                  </span>
                  <span className="badge badge-neutral">
                    <Target size={11} aria-hidden="true" />
                    {t("public.mock_pass", { score: test.pass_score })}
                  </span>
                </div>
                <h2 className="section-title mt-3">{test.title}</h2>
                <p className="section-copy">
                  {test.description || t("public.mock_intro")}
                </p>
                <div className="row-between mt-3">
                  <span className="tiny muted">
                    {test.locale.toUpperCase()}
                  </span>
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={`/${locale}/mock-tests/${test.id}`}
                  >
                    {t("public.browse_tests")}
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
