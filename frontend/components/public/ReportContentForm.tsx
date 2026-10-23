"use client";

import { FormEvent, useState } from "react";
import { Flag, Send } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Spinner } from "@/components/ui/States";

const reasons = [
  "outdated",
  "inaccurate",
  "broken",
  "inappropriate",
  "other",
] as const;

export interface ContentFeedbackOption {
  type: string;
  id: string;
  label: string;
}

export function ReportContentForm({
  contentType,
  contentId,
  options,
}: {
  contentType?: string;
  contentId?: string;
  options?: ContentFeedbackOption[];
}) {
  const { t } = useI18n();
  const fixedTarget = Boolean(contentType && contentId);
  const [selected, setSelected] = useState(() => {
    const first = options?.[0];
    return first ? `${first.type}:${first.id}` : "";
  });
  const [reason, setReason] = useState("outdated");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const groups: Array<{ label: string; types: string[] }> = [
    { label: t("public.feedback_group_guides"), types: ["career_content", "exam"] },
    { label: t("public.feedback_group_courses"), types: ["course"] },
    { label: t("public.feedback_group_tests"), types: ["mock_test"] },
  ];

  function resolveTarget(): { contentType: string; contentId: string } | null {
    if (fixedTarget) return { contentType: contentType!, contentId: contentId! };
    const [type, ...rest] = selected.split(":");
    const id = rest.join(":");
    if (!type || !id) return null;
    return { contentType: type, contentId: id };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = resolveTarget();
    if (!target) {
      setError(new Error(t("public.feedback_select_placeholder")));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await apiFetch("/content-reports", {
        method: "POST",
        json: {
          content_type: target.contentType,
          content_id: target.contentId,
          reason_category: reason,
          comment: comment.trim() || null,
        },
      });
      setSent(true);
      setComment("");
    } catch (caught) {
      setError(caught);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Alert tone="success" title={t("public.feedback_sent")}>
        {t("public.feedback_body")}
      </Alert>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-header">
        <div>
          <h2>
            <Flag
              size={16}
              aria-hidden="true"
              style={{ display: "inline", marginRight: 6 }}
            />
            {t("public.feedback_title")}
          </h2>
          <p>{t("public.feedback_body")}</p>
        </div>
      </div>
      <div className="card-body stack">
        {Boolean(error) && (
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(error, t)}
          </Alert>
        )}
        {!fixedTarget &&
          (options && options.length > 0 ? (
            <Field
              label={t("public.feedback_select")}
              htmlFor="report-target"
              required
            >
              <select
                id="report-target"
                className="select"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                required
              >
                <option value="">{t("public.feedback_select_placeholder")}</option>
                {groups.map((group) => {
                  const items = options.filter((item) =>
                    group.types.includes(item.type),
                  );
                  if (items.length === 0) return null;
                  return (
                    <optgroup label={group.label} key={group.label}>
                      {items.map((item) => (
                        <option
                          value={`${item.type}:${item.id}`}
                          key={`${item.type}:${item.id}`}
                        >
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </Field>
          ) : (
            <Alert tone="info">{t("public.feedback_no_content")}</Alert>
          ))}
        <Field
          label={t("public.feedback_reason")}
          htmlFor="report-reason"
          required
        >
          <select
            id="report-reason"
            className="select"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            {reasons.map((item) => (
              <option value={item} key={item}>
                {t(`public.feedback_reason_${item}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t("public.feedback_comment")}
          htmlFor="report-comment"
        >
          <textarea
            id="report-comment"
            className="textarea"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
          />
        </Field>
        <div className="row">
          <span className="spacer" />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={sending || (!fixedTarget && (!options || options.length === 0))}
          >
            {sending ? <Spinner /> : <Send size={14} aria-hidden="true" />}
            {t("actions.send_report")}
          </button>
        </div>
      </div>
    </form>
  );
}
