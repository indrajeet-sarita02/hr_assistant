"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  LifeBuoy,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/States";
import { apiFetch, ApiError, errorMessage, fieldError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { AssistantAnswer } from "@/lib/types";

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer: AssistantAnswer }
  | { id: number; role: "assistant_error"; text: string };

type AnswerStatusCopy = {
  label: string;
  body: string;
  tone: "success" | "warning" | "danger";
};

const answerStatusCopy: Record<string, AnswerStatusCopy> = {
  grounded: {
    label: "assistant.grounded",
    body: "",
    tone: "success",
  },
  insufficient_evidence: {
    label: "assistant.insufficient",
    body: "assistant.fallback_body",
    tone: "warning",
  },
  conflicting_sources: {
    label: "assistant.status_conflicting",
    body: "assistant.fallback_conflicting",
    tone: "warning",
  },
  stale_source: {
    label: "assistant.status_stale",
    body: "assistant.fallback_stale",
    tone: "warning",
  },
  unauthorized_source: {
    label: "assistant.status_unauthorized",
    body: "assistant.fallback_unauthorized",
    tone: "warning",
  },
  provider_unavailable: {
    label: "assistant.status_provider_unavailable",
    body: "assistant.fallback_provider_unavailable",
    tone: "danger",
  },
};

export default function AssistantPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, number>>({});
  const counter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2 || busy) {
      if (trimmed.length < 2) setError(t("assistant.question_too_short"));
      return;
    }
    setError(null);
    setBusy(true);
    setQuestion("");
    counter.current += 1;
    const userId = counter.current;
    setMessages((current) => [...current, { id: userId, role: "user", text: trimmed }]);
    try {
      const answer = await apiFetch<AssistantAnswer>("/hr-assistant/queries", {
        method: "POST",
        json: { question: trimmed, locale },
        timeoutMs: 45000,
      });
      counter.current += 1;
      setMessages((current) => [
        ...current,
        { id: counter.current, role: "assistant", answer },
      ]);
    } catch (caught) {
      const detail = fieldError(caught, "question");
      const message = detail || errorMessage(caught, t);
      counter.current += 1;
      setMessages((current) => [
        ...current,
        { id: counter.current, role: "assistant_error", text: message },
      ]);
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(question);
  }

  async function submitFeedback(answer: AssistantAnswer, rating: number) {
    if (feedbackGiven[answer.query_log_id]) return;
    try {
      await apiFetch("/hr-assistant/feedback", {
        method: "POST",
        json: { query_log_id: answer.query_log_id, rating },
      });
      setFeedbackGiven((current) => ({ ...current, [answer.query_log_id]: rating }));
      notify(t("assistant.feedback_thanks"));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        notify(t("assistant.feedback_duplicate"), "info");
      } else {
        notify(t("assistant.feedback_failed"), "error");
      }
    }
  }

  function resetConversation() {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("app.powered")}
        title={t("assistant.title")}
        description={t("assistant.subtitle")}
        actions={
          messages.length > 0 ? (
            <button type="button" className="btn btn-secondary" onClick={resetConversation}>
              <Sparkles size={15} aria-hidden="true" />
              {locale === "hi" ? "नई बातचीत" : "New conversation"}
            </button>
          ) : undefined
        }
      />

      <div className="chat-layout">
        <section className="chat-card" aria-label={t("assistant.title")}>
          <div className="chat-head">
            <span className="chat-head-icon">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div className="spacer">
              <h2>{t("assistant.assistant")}</h2>
              <p>{t("assistant.history_note")}</p>
            </div>
            <span className="badge badge-success">
              <ShieldCheck size={11} aria-hidden="true" />
              {t("app.source_checked")}
            </span>
          </div>

          <div className="chat-scroll" ref={scrollRef} aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <span className="chat-orb">
                  <Sparkles size={26} aria-hidden="true" />
                </span>
                <h3>{t("assistant.title")}</h3>
                <p>{t("assistant.subtitle")}</p>
                <div className="example-list">
                  <button
                    type="button"
                    className="example-chip"
                    onClick={() => void send(t("assistant.example_leave"))}
                  >
                    {t("assistant.example_leave")}
                  </button>
                  <button
                    type="button"
                    className="example-chip"
                    onClick={() => void send(t("assistant.example_probation"))}
                  >
                    {t("assistant.example_probation")}
                  </button>
                  <button
                    type="button"
                    className="example-chip"
                    onClick={() => void send(t("assistant.example_home_office"))}
                  >
                    {t("assistant.example_home_office")}
                  </button>
                </div>
              </div>
            )}

            {messages.map((message) => {
              if (message.role === "user") {
                return (
                  <div className="chat-message chat-message-user" key={message.id}>
                    <span className="chat-avatar">
                      <UserRound size={14} aria-hidden="true" />
                    </span>
                    <div className="chat-bubble">{message.text}</div>
                  </div>
                );
              }

              if (message.role === "assistant_error") {
                return (
                  <div className="chat-message" key={message.id}>
                    <span className="chat-avatar">AI</span>
                    <div className="chat-bubble">
                      <div className="alert alert-error" role="alert">
                        <LifeBuoy size={16} aria-hidden="true" />
                        <div>
                          <strong>{t("assistant.answer_failed")}</strong>
                          {message.text}
                        </div>
                      </div>
                      <Link className="btn btn-secondary btn-sm mt-2" href={`/${locale}/requests/new`}>
                        {t("assistant.raise_request")}
                      </Link>
                    </div>
                  </div>
                );
              }

              const answer = message.answer;
              const grounded = answer.answer_status === "grounded";
              const copy =
                answerStatusCopy[answer.answer_status] ??
                answerStatusCopy.insufficient_evidence;
              return (
                <div className="chat-message" key={message.id}>
                  <span className="chat-avatar">AI</span>
                  <div className="chat-bubble">
                    <div className="chat-answer-status">
                      <span className={`badge badge-${copy.tone}`}>
                        {t(copy.label)}
                      </span>
                    </div>
                    <div className="chat-answer-text">{answer.answer}</div>

                    {!grounded && (
                      <div
                        className={`alert ${
                          copy.tone === "danger" ? "alert-error" : "alert-warning"
                        } mt-3`}
                      >
                        <LifeBuoy size={16} aria-hidden="true" />
                        <div>
                          <strong>{t(copy.label)}</strong>
                          {t(copy.body)}
                          <div className="mt-2">
                            <Link className="btn btn-secondary btn-sm" href={`/${locale}/requests/new`}>
                              {t("assistant.raise_request")}
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}

                    {answer.citations.length > 0 && (
                      <div className="chat-citations">
                        <div className="chat-citations-title">{t("assistant.citations")}</div>
                        {answer.citations.map((citation) => (
                          <div className="citation-card" key={citation.document_id}>
                            <strong>{citation.title}</strong>
                            <div>
                              {citation.section
                                ? t("assistant.citation_section", { section: citation.section })
                                : `v${citation.version} · ${citation.locale.toUpperCase()}`}
                            </div>
                            <div className="tiny muted">
                              {citation.effective_from
                                ? t("assistant.effective", {
                                    date: formatDate(citation.effective_from, locale),
                                  })
                                : `v${citation.version}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="chat-feedback">
                      <span className="chat-feedback-label">{t("assistant.helpful")}?</span>
                      <button
                        type="button"
                        className={`feedback-button${feedbackGiven[answer.query_log_id] === 5 ? " is-selected" : ""}`}
                        onClick={() => void submitFeedback(answer, 5)}
                        aria-pressed={feedbackGiven[answer.query_log_id] === 5}
                      >
                        <ThumbsUp size={12} aria-hidden="true" />
                        {t("assistant.helpful")}
                      </button>
                      <button
                        type="button"
                        className={`feedback-button${feedbackGiven[answer.query_log_id] === 1 ? " is-selected" : ""}`}
                        onClick={() => void submitFeedback(answer, 1)}
                        aria-pressed={feedbackGiven[answer.query_log_id] === 1}
                      >
                        <ThumbsDown size={12} aria-hidden="true" />
                        {t("assistant.not_helpful")}
                      </button>
                    </div>
                    <div className="tiny muted mt-2">
                      {t("assistant.model", {
                        name: answer.model.name,
                        version: answer.model.version,
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {busy && (
              <div className="chat-message" role="status">
                <span className="chat-avatar">AI</span>
                <div className="chat-bubble row">
                  <Spinner />
                  {t("assistant.thinking")}
                </div>
              </div>
            )}
          </div>

          <div className="chat-composer">
            <form onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="assistant-question">
                {t("assistant.placeholder")}
              </label>
              <textarea
                id="assistant-question"
                ref={inputRef}
                className="input chat-input"
                placeholder={t("assistant.placeholder")}
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(question);
                  }
                }}
                maxLength={2000}
                rows={1}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "assistant-error" : undefined}
                disabled={busy}
              />
              <button
                type="submit"
                className="chat-send"
                aria-label={t("assistant.send")}
                disabled={busy || question.trim().length < 2}
              >
                {busy ? <Spinner light /> : <Send size={18} aria-hidden="true" />}
              </button>
            </form>
            {error && (
              <div className="error-text" id="assistant-error" role="alert">
                {error}
              </div>
            )}
            <p className="chat-composer-note">
              {t("assistant.disclaimer")} {t("assistant.privacy")}
            </p>
          </div>
        </section>

        <aside className="stack" aria-label={t("assistant.citations")}>
          <div className="aside-card">
            <h3>{t("assistant.disclaimer")}</h3>
            <p>{t("app.advisory")}</p>
          </div>
          <div className="aside-card">
            <h3>{t("assistant.privacy")}</h3>
            <p>{t("app.advisory")}</p>
          </div>
          <div className="aside-card">
            <h3>{t("assistant.raise_request")}</h3>
            <p>{t("assistant.fallback_body")}</p>
            <Link className="btn btn-secondary btn-sm mt-3" href={`/${locale}/requests/new`}>
              <LifeBuoy size={14} aria-hidden="true" />
              {t("requests.new_title")}
            </Link>
          </div>
          <div className="aside-card">
            <h3>{t("assistant.citations")}</h3>
            <p>
              <BookOpen size={13} aria-hidden="true" style={{ display: "inline", marginRight: 4 }} />
              {t("assistant.subtitle")}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
