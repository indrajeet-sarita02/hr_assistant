"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Modal } from "@/components/ui/Modal";
import { LoadingPanel, Spinner } from "@/components/ui/States";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useAsync } from "@/lib/hooks";
import type {
  Attempt,
  AttemptSubmitResult,
  QuestionOption,
} from "@/lib/types";

function optionText(option: QuestionOption): string {
  return option.text || option.label || option.id;
}

function secondsLeft(expiresAt: string): number {
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function AttemptPage() {
  const { locale, t } = useI18n();
  const { me, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [result, setResult] = useState<AttemptSubmitResult | null>(null);
  const hydrated = useRef(false);
  const submitted = useRef(false);
  const idempotencyKey = useRef(newIdempotencyKey());
  const autoSubmitAttempted = useRef(false);

  const { data: attempt, loading, error, reload } = useAsync(
    () => apiGet<Attempt>(`/mock-test-attempts/${attemptId}`),
    [attemptId],
  );

  useEffect(() => {
    if (!attempt || hydrated.current) return;
    hydrated.current = true;
    setRemaining(secondsLeft(attempt.expires_at));
  }, [attempt]);

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    const timer = window.setInterval(() => {
      const next = secondsLeft(attempt.expires_at);
      setRemaining(next);
      if (next === 0 && !autoSubmitAttempted.current) {
        autoSubmitAttempted.current = true;
        void submitAttempt(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id, attempt?.expires_at, attempt?.status]);

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !hydrated.current) return;
    if (submitted.current) return;
    const payload = Object.entries(answers).map(([questionId, optionId]) => ({
      question_id: questionId,
      answer: { option_id: optionId },
    }));
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      if (submitted.current) return;
      apiFetch(`/mock-test-attempts/${attempt.id}`, {
        method: "PATCH",
        json: { answers: payload },
      })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [answers, attempt]);

  const questions = attempt?.questions ?? [];
  const question = questions[index];
  const answeredCount = Object.keys(answers).length;

  async function submitAttempt(force = false, event?: FormEvent) {
    event?.preventDefault();
    if (!attempt || submitted.current) return;
    if (!force && answeredCount < questions.length) {
      setConfirmOpen(true);
      return;
    }
    submitted.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      const submittedResult = await apiFetch<AttemptSubmitResult>(
        `/mock-test-attempts/${attempt.id}/submit`,
        {
          method: "POST",
          idempotencyKey: idempotencyKey.current,
          json: {},
        },
      );
      setResult(submittedResult);
      setConfirmOpen(false);
    } catch (caught) {
      submitted.current = false;
      setActionError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionStatus === "loading") {
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
            <p className="section-copy mt-2">{t("public.tests_body")}</p>
            <Link
              className="btn btn-primary mt-3"
              href={`/${locale}/sign-in?next=/${locale}/mock-tests/attempt/${attemptId}`}
            >
              {t("actions.sign_in")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="public-section">
        <div className="public-container">
          <LoadingPanel label={t("app.loading")} />
        </div>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="public-section">
        <div className="public-container">
          <ErrorPanel error={error} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (result || attempt.status !== "in_progress") {
    const score = result?.score ?? attempt.score;
    const maxScore = result?.max_score ?? attempt.max_score;
    const passed = result?.passed;
    const percent =
      score !== null && maxScore ? Math.round((score / maxScore) * 100) : null;
    return (
      <div className="public-section">
        <div className="public-container public-container-narrow">
          <div className="card card-pad result-card">
            <span className="eyebrow">
              <Check size={13} aria-hidden="true" />
              {t("public.mock_result_title")}
            </span>
            <h1 className="section-title">
              {passed === false
                ? t("public.mock_result_failed")
                : t("public.mock_result_passed")}
            </h1>
            <div className="result-score">
              <span className="result-score-value">{score ?? "—"}</span>
              <span className="result-score-max">/ {maxScore ?? "—"}</span>
            </div>
            {percent !== null && (
              <p className="section-copy">
                {t("public.mock_score")}: {percent}%
              </p>
            )}
            <div className="row mt-4">
              <Link
                className="btn btn-primary"
                href={`/${locale}/mock-tests/attempt/${attempt.id}/review`}
              >
                {t("public.mock_review_title")}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link className="btn btn-ghost" href={`/${locale}/mock-tests`}>
                {t("public.tests_title")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (remaining === null) {
    return (
      <div className="public-section">
        <div className="public-container">
          <LoadingPanel label={t("app.loading")} />
        </div>
      </div>
    );
  }

  if (remaining === 0) {
    return (
      <div className="public-section">
        <div className="public-container public-container-narrow">
          <Alert tone="warning" title={t("public.mock_expired")}>
            {t("public.mock_rule_timer")}
          </Alert>
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={submitting}
            onClick={() => {
              submitted.current = false;
              void submitAttempt(true);
            }}
          >
            {submitting ? <Spinner light /> : <Send size={15} />}
            {t("actions.submit")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-section">
      <div className="public-container attempt-shell">
        <div className="attempt-topbar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => router.push(`/${locale}/mock-tests`)}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {t("public.tests_title")}
          </button>
          <div className="attempt-timer" aria-live="polite">
            <Clock3 size={15} aria-hidden="true" />
            <span className="tiny muted">{t("public.mock_time_left")}</span>
            <strong>{formatClock(remaining)}</strong>
          </div>
          <div className="attempt-save" aria-live="polite">
            {saveState === "saving" && (
              <>
                <Spinner />
                <span className="tiny muted">{t("public.mock_autosaving")}</span>
              </>
            )}
            {saveState === "saved" && (
              <>
                <Save size={13} aria-hidden="true" />
                <span className="tiny muted">{t("public.mock_autosaved")}</span>
              </>
            )}
            {saveState === "error" && (
              <>
                <RotateCcw size={13} aria-hidden="true" />
                <span className="tiny danger">
                  {t("public.mock_autosave_failed")}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="attempt-layout">
          <section className="card attempt-card">
            <div className="card-header">
              <div>
                <span className="tiny muted">
                  {t("public.mock_answered", {
                    answered: answeredCount,
                    total: questions.length,
                  })}
                </span>
                <h1 className="section-title mt-1">
                  {question?.prompt || t("public.mock_no_questions")}
                </h1>
              </div>
              <span className="badge badge-neutral">
                {index + 1} / {questions.length}
              </span>
            </div>
            <div className="card-body">
              {!question ? (
                <Alert tone="warning" title={t("public.mock_no_questions")}>
                  {t("public.mock_intro")}
                </Alert>
              ) : (
                <fieldset className="option-list">
                  <legend className="sr-only">{question.prompt}</legend>
                  {question.options.map((option, optionIndex) => {
                    const checked = answers[question.id] === option.id;
                    return (
                      <label
                        className={`option-item${checked ? " is-selected" : ""}`}
                        key={option.id}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option.id}
                          checked={checked}
                          onChange={() =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: option.id,
                            }))
                          }
                        />
                        <span className="option-letter">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span className="small">{optionText(option)}</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}

              <div className="attempt-nav">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={index === 0}
                  onClick={() => setIndex((current) => Math.max(0, current - 1))}
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  {t("actions.previous")}
                </button>
                {index < questions.length - 1 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      setIndex((current) =>
                        Math.min(questions.length - 1, current + 1),
                      )
                    }
                  >
                    {t("actions.next")}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={submitting}
                    onClick={() => void submitAttempt()}
                  >
                    {submitting ? <Spinner light /> : <Send size={14} />}
                    {t("actions.submit")}
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside className="card attempt-map">
            <div className="card-header">
              <h2>{t("public.mock_answered", {
                answered: answeredCount,
                total: questions.length,
              })}</h2>
            </div>
            <div className="card-body">
              <div className="question-map">
                {questions.map((item, itemIndex) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`question-map-item${itemIndex === index ? " is-current" : ""}${answers[item.id] ? " is-answered" : ""}`}
                    aria-label={`${item.position}`}
                    aria-current={itemIndex === index}
                    onClick={() => setIndex(itemIndex)}
                  >
                    {itemIndex + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-block mt-4"
                disabled={submitting}
                onClick={() => void submitAttempt()}
              >
                {submitting ? <Spinner light /> : <Send size={14} />}
                {t("actions.submit")}
              </button>
            </div>
          </aside>
        </div>

        {Boolean(actionError) && (
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(actionError, t)}
          </Alert>
        )}

        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={t("actions.submit")}
          description={
            answeredCount < questions.length
              ? t("public.mock_unanswered")
              : t("public.mock_submit_confirm")
          }
          closeLabel={t("app.close")}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmOpen(false)}
              >
                {t("app.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => void submitAttempt(true)}
              >
                {submitting ? <Spinner light /> : <Send size={15} />}
                {t("actions.submit")}
              </button>
            </>
          }
        >
          <p className="small muted">{t("public.mock_submit_confirm")}</p>
        </Modal>
      </div>
    </div>
  );
}
