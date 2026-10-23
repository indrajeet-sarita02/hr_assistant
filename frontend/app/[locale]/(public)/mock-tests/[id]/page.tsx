import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ListChecks,
  ShieldCheck,
  Target,
} from "lucide-react";

import { ReportContentForm } from "@/components/public/ReportContentForm";
import { StartAttemptButton } from "@/components/public/StartAttemptButton";
import { createTranslator, normalizeLocale } from "@/lib/i18n";
import { serverGet } from "@/lib/server-api";
import type { MockTest } from "@/lib/types";

async function loadTest(id: string) {
  const page = await serverGet<{ items: MockTest[] }>("/mock-tests?limit=100");
  return page?.items.find((item) => item.id === id) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const locale = normalizeLocale(params.locale);
  const test = await loadTest(params.id);
  const t = createTranslator(locale);
  return {
    title: test?.title || t("public.tests_title"),
    description: test?.description || t("public.tests_body"),
    alternates: { canonical: `/${locale}/mock-tests/${params.id}` },
  };
}

export default async function MockTestDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = normalizeLocale(params.locale);
  const t = createTranslator(locale);
  const test = await loadTest(params.id);
  if (!test) notFound();

  return (
    <div className="public-section">
      <div className="public-container">
        <div className="article-shell">
          <article className="article-card">
            <Link
              className="btn btn-ghost btn-sm"
              href={`/${locale}/mock-tests`}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t("public.tests_title")}
            </Link>

            <div className="row wrap mt-3">
              <span className="badge badge-neutral">
                <Clock3 size={11} aria-hidden="true" />
                {t("public.mock_duration", { minutes: test.duration_minutes })}
              </span>
              <span className="badge badge-neutral">
                <Target size={11} aria-hidden="true" />
                {t("public.mock_pass", { score: test.pass_score })}
              </span>
              <span className="badge badge-neutral">
                <ListChecks size={11} aria-hidden="true" />
                {test.locale.toUpperCase()}
              </span>
            </div>

            <h1 className="article-title">{test.title}</h1>
            <p className="article-lede">
              {test.description || t("public.tests_body")}
            </p>

            <div className="notice notice-warning">{t("public.mock_intro")}</div>

            <div className="instruction-list">
              <div>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>{t("public.mock_rule_timer")}</span>
              </div>
              <div>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>{t("public.mock_rule_autosave")}</span>
              </div>
              <div>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>{t("public.mock_rule_answers")}</span>
              </div>
              <div>
                <ShieldCheck size={16} aria-hidden="true" />
                <span>{t("public.mock_rule_private")}</span>
              </div>
            </div>

            <div className="mt-4">
              <StartAttemptButton testId={test.id} />
            </div>
          </article>

          <aside className="article-aside">
            <div className="aside-card">
              <h3>{t("public.mock_result_title")}</h3>
              <p>{t("public.mock_rule_answers")}</p>
            </div>
            <div className="aside-card">
              <h3>{t("public.privacy")}</h3>
              <p>{t("public.mock_rule_private")}</p>
            </div>
            <ReportContentForm contentType="mock_test" contentId={test.id} />
          </aside>
        </div>
      </div>
    </div>
  );
}
