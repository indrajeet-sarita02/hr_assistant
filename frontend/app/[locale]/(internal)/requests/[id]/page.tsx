"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  MessageSquare,
  Paperclip,
  Send,
  UserRound,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PriorityBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingPanel, Spinner } from "@/components/ui/States";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { formatDateTime, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import type {
  DocumentRecord,
  ServiceRequest,
  ServiceRequestComment,
} from "@/lib/types";

const transitions: Record<string, string[]> = {
  open: ["in_progress", "waiting_on_requester", "resolved", "cancelled"],
  in_progress: ["waiting_on_requester", "resolved", "cancelled"],
  waiting_on_requester: ["in_progress", "resolved", "cancelled"],
  resolved: ["closed", "in_progress"],
  closed: [],
  cancelled: [],
};

export default function ServiceRequestDetailPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const canUpdate = hasPermission(me?.permissions, permissions.serviceUpdate);
  const canSeeQueue = hasPermission(me?.permissions, permissions.serviceReadQueue);
  const [comment, setComment] = useState("");
  const [visibility, setVisibility] = useState<"requester" | "internal">("requester");
  const [posting, setPosting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [nextPriority, setNextPriority] = useState("");

  const { data, loading, error, reload } = useAsync(async () => {
    const request = await apiGet<ServiceRequest>(`/service-requests/${id}`);
    const [comments, documents] = await Promise.all([
      apiGet<ServiceRequestComment[]>(`/service-requests/${id}/comments`).catch(() => []),
      canUpdate ? apiGet<DocumentRecord[]>("/documents?limit=50").catch(() => []) : Promise.resolve([]),
    ]);
    return { request, comments, documents };
  }, [id, canUpdate]);

  const transitionStatuses = useMemo(
    () => transitions[data?.request.status ?? ""] ?? [],
    [data?.request.status],
  );

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    setActionError(null);
    try {
      await apiFetch(`/service-requests/${id}/comments`, {
        method: "POST",
        json: {
          body: comment.trim(),
          visibility: canUpdate ? visibility : "requester",
        },
      });
      setComment("");
      notify(t("requests.comment_added"));
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setPosting(false);
    }
  }

  async function updateRequest(payload: Record<string, unknown>) {
    setUpdating(true);
    setActionError(null);
    try {
      await apiFetch(`/service-requests/${id}`, {
        method: "PATCH",
        json: payload,
      });
      notify(t("requests.status_updated"));
      setNextStatus("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingPanel label={t("app.loading")} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="page">
        <ErrorPanel error={error} onRetry={reload} />
      </div>
    );
  }

  const request = data.request;
  return (
    <div className="page">
      <PageHeader
        eyebrow={t("requests.ref", { id: shortReference(request.id) })}
        title={request.subject}
        description={t("requests.subtitle")}
        actions={
          <Link className="btn btn-ghost" href={`/${locale}/requests`}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t("actions.back_to_list")}
          </Link>
        }
      />

      {Boolean(actionError) && (
        <div className="mb-3">
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(actionError, t)}
          </Alert>
        </div>
      )}

      <div className="split">
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div className="row wrap">
                <StatusBadge status={request.status} />
                <PriorityBadge priority={request.priority} />
              </div>
              {canSeeQueue && (
                <span className="badge badge-info">{t("requests.queue")}</span>
              )}
            </div>
            <div className="card-body">
              <p className="section-title">{t("requests.description")}</p>
              <p className="section-copy mt-2" style={{ whiteSpace: "pre-wrap" }}>
                {request.description}
              </p>

              {Object.keys(request.form_data ?? {}).length > 0 && (
                <>
                  <hr className="divider" />
                  <dl className="detail-list">
                    {Object.entries(request.form_data).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key.replaceAll("_", " ")}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              <hr className="divider" />
              <dl className="detail-list">
                <div>
                  <dt>{t("requests.requester")}</dt>
                  <dd>
                    {request.requester_user_id === me?.user.id
                      ? t("requests.you")
                      : shortReference(request.requester_user_id)}
                  </dd>
                </div>
                <div>
                  <dt>{t("requests.assign")}</dt>
                  <dd>
                    {request.assignee_user_id
                      ? shortReference(request.assignee_user_id)
                      : t("requests.unassigned")}
                  </dd>
                </div>
                <div>
                  <dt>{t("requests.sla")}</dt>
                  <dd>{formatDateTime(request.sla_due_at, locale)}</dd>
                </div>
                <div>
                  <dt>{t("app.last_updated")}</dt>
                  <dd>{formatDateTime(request.updated_at, locale)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card" aria-labelledby="comments-title">
            <div className="card-header">
              <div>
                <h2 id="comments-title">{t("requests.comments")}</h2>
                <p>{t("requests.attachments_note")}</p>
              </div>
              <span className="badge badge-neutral">{data.comments.length}</span>
            </div>
            <div className="card-body">
              {data.comments.length === 0 ? (
                <p className="muted small">{t("requests.comments_empty")}</p>
              ) : (
                <div className="stack-sm">
                  {data.comments.map((item) => (
                    <article className="comment-card" key={item.id}>
                      <div className="row-between">
                        <span className="small" style={{ fontWeight: 650 }}>
                          {item.author_user_id === me?.user.id
                            ? t("requests.you")
                            : shortReference(item.author_user_id)}
                          {item.visibility === "internal" && (
                            <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                              {t("requests.visibility_internal")}
                            </span>
                          )}
                        </span>
                        <span className="tiny muted">
                          {formatDateTime(item.created_at, locale)}
                        </span>
                      </div>
                      <p className="section-copy mt-2" style={{ whiteSpace: "pre-wrap" }}>
                        {item.body}
                      </p>
                    </article>
                  ))}
                </div>
              )}

              <form className="mt-3" onSubmit={addComment}>
                <Field label={t("requests.add_comment")} htmlFor="comment">
                  <textarea
                    id="comment"
                    className="textarea"
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder={t("requests.comment_placeholder")}
                    maxLength={5000}
                    required
                  />
                </Field>
                <div className="row wrap mt-2">
                  {canUpdate && (
                    <select
                      className="select"
                      aria-label={t("requests.visibility_requester")}
                      value={visibility}
                      onChange={(event) =>
                        setVisibility(event.target.value as "requester" | "internal")
                      }
                    >
                      <option value="requester">{t("requests.visibility_requester")}</option>
                      <option value="internal">{t("requests.visibility_internal")}</option>
                    </select>
                  )}
                  <span className="spacer" />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={posting || !comment.trim()}
                  >
                    {posting ? <Spinner light /> : <Send size={15} aria-hidden="true" />}
                    {t("requests.add_comment")}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>

        <div className="stack">
          {canUpdate && (
            <section className="card">
              <div className="card-header">
                <h2>{t("requests.update_status")}</h2>
              </div>
              <div className="card-body stack-sm">
                <Field label={t("requests.status")} htmlFor="next-status">
                  <select
                    id="next-status"
                    className="select"
                    value={nextStatus}
                    onChange={(event) => setNextStatus(event.target.value)}
                  >
                    <option value="">{t("app.none")}</option>
                    {transitionStatuses.map((item) => (
                      <option key={item} value={item}>
                        {t(`status.${item}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("requests.priority")} htmlFor="next-priority">
                  <select
                    id="next-priority"
                    className="select"
                    value={nextPriority}
                    onChange={(event) => setNextPriority(event.target.value)}
                  >
                    <option value="">{t("app.none")}</option>
                    <option value="low">{t("priority.low")}</option>
                    <option value="normal">{t("priority.normal")}</option>
                    <option value="high">{t("priority.high")}</option>
                    <option value="urgent">{t("priority.urgent")}</option>
                  </select>
                </Field>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={updating || (!nextStatus && !nextPriority)}
                  onClick={() =>
                    void updateRequest({
                      ...(nextStatus ? { status: nextStatus } : {}),
                      ...(nextPriority ? { priority: nextPriority } : {}),
                    })
                  }
                >
                  {updating ? <Spinner light /> : null}
                  {t("actions.save_changes")}
                </button>
                {!request.assignee_user_id && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    disabled={updating}
                    onClick={() => void updateRequest({ assignee_user_id: me?.user.id })}
                  >
                    <UserRound size={15} aria-hidden="true" />
                    {t("actions.assign_to_me")}
                  </button>
                )}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-header">
              <h2>{t("requests.attachments")}</h2>
            </div>
            <div className="card-body">
              <p className="muted small">{t("requests.attachments_empty")}</p>
              <p className="tiny muted mt-2">{t("requests.attachments_note")}</p>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>{t("requests.sla")}</h2>
            </div>
            <div className="card-body stack-sm">
              <div className="row">
                <CalendarClock size={16} aria-hidden="true" />
                <span className="small">{formatDateTime(request.sla_due_at, locale)}</span>
              </div>
              <div className="row">
                <MessageSquare size={16} aria-hidden="true" />
                <span className="small">{data.comments.length} {t("requests.comments").toLowerCase()}</span>
              </div>
              <div className="row">
                <Paperclip size={16} aria-hidden="true" />
                <span className="small">{t("requests.attachments_empty")}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
