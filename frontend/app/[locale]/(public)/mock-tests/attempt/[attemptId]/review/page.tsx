"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { LoadingPanel } from "@/components/ui/States";
import { apiGet } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import type { AttemptReview, QuestionOption } from "@/lib/types";

function optionText(option: QuestionOption): string {
  return option.text || option.label || option.id;
}

export default function AttemptReviewPage() {
  const { locale, t } = useI18n();
  const { me, status: sessionStatus } = useSession();
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;

  const { data, loading, error, reload } = useAsync(
    () => apiGet<AttemptReview>(`/mock-test-attempts/${attemptId}/review`),
    [attemptId],
  );

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="public-section">
        <div className="public-container">
          <LoadingPanel label={t("app.loading")} />
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="public-section">
        <div className="public-container">
          <div className="card card-pad">
            <h1 className="section-title">{t("public.mock_signin_required")}</h1>
            <Link
              className="btn btn-primary mt-3"
              href={`/${locale}/sign-in?next=/${locale}/mock-tests/attempt/${attemptId}/review`}
            >
              {t("actions.sign_in")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="public-section">
        <div className="public-container">
          <ErrorPanel error={error} onRetry={reload} />
        </div>
      </div>
    );
  }

  return (
    <div className="public-section">
      <div className="public-container public-container-narrow">
        <Link
          className="btn btn-ghost btn-sm"
          href={`/${locale}/mock-tests/attempt/${attemptId}`}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {t("public.mock_result_title")}
        </Link>
        <div className="public-page-head mt-3">
          <span className="eyebrow">{t("public.mock_review_title")}</span>
          <h1>{t("public.mock_result_title")}</h1>
          <p className="section-copy">
            {t("public.mock_score")}: {data.score ?? "—"} / {data.max_score ?? "—"}
          </p>
        </div>

        <div className="stack">
          {data.questions.map((question, index) => {
            const selected = question.answer?.option_id;
            const correct = question.correct_answer?.option_id;
            return (
              <article className="card review-card" key={question.question_id}>
                <div className="card-header">
                  <div>
                    <span className="tiny muted">
                      {index + 1} / {data.questions.length}
                    </span>
                    <h2 className="section-title mt-1">{question.prompt}</h2>
                  </div>
                  {question.is_correct ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      {t("app.yes")}
                    </span>
                  ) : (
                    <span className="badge badge-danger">
                      <XCircle size={12} aria-hidden="true" />
                      {t("app.no")}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <div className="review-options">
                    {question.options.map((option, optionIndex) => {
                      const isCorrect = option.id === correct;
                      const isSelected = option.id === selected;
                      return (
                        <div
                          className={`review-option${isCorrect ? " is-correct" : ""}${isSelected && !isCorrect ? " is-wrong" : ""}`}
                          key={option.id}
                        >
                          <span className="option-letter">
                            {String.fromCharCode(65 + optionIndex)}
                          </span>
                          <span className="small spacer">{optionText(option)}</span>
                          {isCorrect && (
                            <span className="tiny">
                              {t("public.mock_correct_answer")}
                            </span>
                          )}
                          {isSelected && !isCorrect && (
                            <span className="tiny">
                              {t("public.mock_your_answer")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="tiny muted mt-3">
                    {selected
                      ? t("public.mock_your_answer")
                      : t("public.mock_no_answer")}
                  </p>
                  {question.explanation && (
                    <div className="notice notice-info mt-3">
                      <strong>{t("public.mock_explanation")}</strong>
                      <p>{question.explanation}</p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
