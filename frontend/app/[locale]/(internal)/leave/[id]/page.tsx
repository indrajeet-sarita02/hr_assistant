"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  RotateCcw,
  X,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingPanel, Spinner } from "@/components/ui/States";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import type { Decision, LeaveRequest, LeaveType } from "@/lib/types";

export default function LeaveDetailPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const justCreated = searchParams.get("created") === "1";
  const canDecide = hasPermission(me?.permissions, permissions.leaveDecide);
  const canCancel = hasPermission(me?.permissions, permissions.leaveCancelOwn);
  const [comment, setComment] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { data, loading, error, reload } = useAsync(async () => {
    const request = await apiGet<LeaveRequest>(`/leave/requests/${id}`);
    const types = await apiGet<LeaveType[]>("/leave/types").catch(() => []);
    return { request, type: types.find((item) => item.id === request.leave_type_id) };
  }, [id]);

  const duration = useMemo(() => {
    const request = data?.request;
    if (!request) return 0;
    if (request.partial_day) return 0.5;
    return Math.max(
      1,
      Math.ceil(
        (new Date(request.end_at).getTime() - new Date(request.start_at).getTime()) /
          86400000,
      ),
    );
  }, [data?.request]);

  async function decide(decision: string) {
    if (!data) return;
    setWorking(decision);
    setActionError(null);
    try {
      await apiFetch<Decision>(`/leave/requests/${id}/decision`, {
        method: "POST",
        json: { decision, comment: comment.trim() || null },
      });
      notify(t("leave.decision_saved"));
      setComment("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("cancel");
    setActionError(null);
    try {
      await apiFetch<LeaveRequest>(`/leave/requests/${id}/cancel`, {
        method: "POST",
        json: { reason: cancelReason.trim() || null },
      });
      notify(t("leave.cancelled"));
      setCancelOpen(false);
      setCancelReason("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
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
  const canActAsApprover =
    canDecide &&
    ["pending", "needs_clarification"].includes(request.status) &&
    (!request.current_approver_user_id ||
      request.current_approver_user_id === me?.user.id);

  return (
    <div className="page page-narrow">
      <PageHeader
        eyebrow={t("requests.ref", { id: shortReference(request.id) })}
        title={
          data.type
            ? locale === "hi" && data.type.name_hi
              ? data.type.name_hi
              : data.type.name_en
            : t("leave.details_title")
        }
        description={t("leave.subtitle")}
        actions={
          <Link className="btn btn-ghost" href={`/${locale}/leave`}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t("actions.back_to_list")}
          </Link>
        }
      />

      {justCreated && (
        <div className="mb-3">
          <Alert tone="success" title={t("leave.request_created")}>
            {t("leave.request_created_body")}
          </Alert>
        </div>
      )}

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
              <StatusBadge status={request.status} />
              <span className="badge badge-neutral">
                <CalendarDays size={11} aria-hidden="true" />
                {request.partial_day
                  ? t("leave.half_day")
                  : t("leave.day_count", { count: duration })}
              </span>
            </div>
            <div className="card-body">
              <div className="date-band">
                <div>
                  <div className="tiny muted">{t("leave.start_date")}</div>
                  <div className="date-band-value">
                    {formatDate(request.start_at, locale)}
                  </div>
                </div>
                <span className="date-band-line" aria-hidden="true" />
                <div>
                  <div className="tiny muted">{t("leave.end_date")}</div>
                  <div className="date-band-value">
                    {formatDate(request.end_at, locale)}
                  </div>
                </div>
              </div>

              {request.reason && (
                <>
                  <hr className="divider" />
                  <div className="tiny muted">{t("leave.reason")}</div>
                  <p className="section-copy mt-2" style={{ whiteSpace: "pre-wrap" }}>
                    {request.reason}
                  </p>
                </>
              )}

              <hr className="divider" />
              <dl className="detail-list">
                <div>
                  <dt>{t("leave.approver")}</dt>
                  <dd>
                    {request.current_approver_user_id === me?.user.id
                      ? t("requests.you")
                      : request.current_approver_user_id
                        ? shortReference(request.current_approver_user_id)
                        : t("requests.unassigned")}
                  </dd>
                </div>
                <div>
                  <dt>{t("leave.submitted")}</dt>
                  <dd>
                    {request.submitted_at
                      ? formatDateTime(request.submitted_at, locale)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{t("leave.decided")}</dt>
                  <dd>
                    {request.decided_at
                      ? formatDateTime(request.decided_at, locale)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{t("app.last_updated")}</dt>
                  <dd>{formatDateTime(request.updated_at, locale)}</dd>
                </div>
              </dl>
            </div>
          </section>

          {canActAsApprover && (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>{t("leave.decision")}</h2>
                  <p>{t("leave.self_approval")}</p>
                </div>
                <span className="badge badge-warning">
                  <Clock3 size={11} aria-hidden="true" />
                  {t("leave.pending_decision")}
                </span>
              </div>
              <div className="card-body stack">
                <Field
                  label={t("leave.decision_comment")}
                  htmlFor="decision-comment"
                >
                  <textarea
                    id="decision-comment"
                    className="textarea"
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder={t("leave.decision_comment_placeholder")}
                    maxLength={2000}
                  />
                </Field>
                <div className="row wrap">
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => void decide("approved")}
                    disabled={Boolean(working)}
                  >
                    {working === "approved" ? <Spinner light /> : <Check size={16} aria-hidden="true" />}
                    {t("actions.approve")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void decide("rejected")}
                    disabled={Boolean(working)}
                  >
                    {working === "rejected" ? <Spinner light /> : <X size={16} aria-hidden="true" />}
                    {t("actions.reject")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void decide("needs_clarification")}
                    disabled={Boolean(working)}
                  >
                    {working === "needs_clarification" ? (
                      <Spinner />
                    ) : (
                      <RotateCcw size={15} aria-hidden="true" />
                    )}
                    {t("actions.request_changes")}
                  </button>
                </div>
              </div>
            </section>
          )}

          {canCancel && ["pending", "approved", "needs_clarification"].includes(request.status) && (
            <div>
              <button
                type="button"
                className="btn btn-ghost btn-danger-text"
                onClick={() => setCancelOpen(true)}
              >
                {t("leave.cancel")}
              </button>
            </div>
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>{t("leave.status_timeline")}</h2>
            </div>
            <div className="card-body">
              <div className="timeline">
                <div className="timeline-item">
                  <span className="timeline-dot is-done">
                    <CheckCircle2 size={11} aria-hidden="true" />
                  </span>
                  <div>
                    <div className="small" style={{ fontWeight: 650 }}>
                      {t("leave.timeline_created")}
                    </div>
                    <div className="tiny muted">
                      {formatDateTime(request.created_at, locale)}
                    </div>
                  </div>
                </div>
                <div className="timeline-item">
                  <span className={`timeline-dot${request.submitted_at ? " is-done" : ""}`} />
                  <div>
                    <div className="small" style={{ fontWeight: 650 }}>
                      {t("leave.timeline_submitted")}
                    </div>
                    <div className="tiny muted">
                      {request.submitted_at
                        ? formatDateTime(request.submitted_at, locale)
                        : t("app.not_available")}
                    </div>
                  </div>
                </div>
                <div className="timeline-item">
                  <span className={`timeline-dot${request.decided_at ? " is-done" : ""}`} />
                  <div>
                    <div className="small" style={{ fontWeight: 650 }}>
                      {t("leave.timeline_decided")}
                    </div>
                    <div className="tiny muted">
                      {request.decided_at
                        ? formatDateTime(request.decided_at, locale)
                        : t("leave.pending_decision")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="aside-card">
            <h3>{t("leave.approver_note")}</h3>
            <p>{t("leave.team_scope")}</p>
          </div>
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("leave.cancel_confirm")}
        description={t("leave.approver_note")}
        closeLabel={t("app.close")}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCancelOpen(false)}
            >
              {t("app.cancel")}
            </button>
            <button
              type="submit"
              form="cancel-leave-form"
              className="btn btn-danger"
              disabled={working === "cancel"}
            >
              {working === "cancel" ? <Spinner light /> : null}
              {t("leave.cancel")}
            </button>
          </>
        }
      >
        <form id="cancel-leave-form" onSubmit={cancel}>
          <Field label={t("leave.reason")} htmlFor="cancel-reason">
            <textarea
              id="cancel-reason"
              className="textarea"
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              maxLength={1000}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
