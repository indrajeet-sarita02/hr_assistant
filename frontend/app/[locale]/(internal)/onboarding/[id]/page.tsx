"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  Paperclip,
  UserRound,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Progress } from "@/components/ui/Progress";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingPanel, Spinner } from "@/components/ui/States";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import { taskStatuses } from "@/lib/status";
import type {
  DocumentRecord,
  OnboardingCase,
  OnboardingTask,
  Page,
} from "@/lib/types";

const transitions: Record<string, string[]> = {
  not_started: ["in_progress", "blocked", "waived"],
  in_progress: ["completed", "blocked", "waived"],
  blocked: ["in_progress", "waived"],
  completed: [],
  waived: [],
};

export default function OnboardingDetailPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const canCreate = hasPermission(me?.permissions, permissions.onboardingCreate);
  const canUpdateTasks = hasPermission(
    me?.permissions,
    permissions.onboardingTask,
  );
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [selectedStatus, setSelectedStatus] = useState<Record<string, string>>({});

  const { data, loading, error, reload } = useAsync(async () => {
    const item = await apiGet<OnboardingCase>(`/onboarding/cases/${id}`);
    const documents = await apiGet<Page<DocumentRecord>>("/documents?limit=100")
      .then((page) => page.items ?? [])
      .catch(() => []);
    return { item, documents };
  }, [id]);

  const tasks = useMemo(() => data?.item.tasks ?? [], [data?.item.tasks]);
  const remaining = tasks.filter(
    (task) => !["completed", "waived"].includes(task.status),
  ).length;
  const closed = data?.item.status === "completed" || data?.item.status === "cancelled";

  async function updateTask(task: OnboardingTask, status: string) {
    setWorking(task.id);
    setActionError(null);
    try {
      await apiFetch(`/onboarding/tasks/${task.id}`, {
        method: "PATCH",
        json: {
          status,
          ...(evidence[task.id] ? { evidence_document_id: evidence[task.id] } : {}),
        },
      });
      notify(t("onboarding.status_updated"));
      setSelectedStatus((current) => ({ ...current, [task.id]: "" }));
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function attachEvidence(task: OnboardingTask) {
    if (!evidence[task.id]) return;
    setWorking(`evidence-${task.id}`);
    setActionError(null);
    try {
      await apiFetch(`/onboarding/tasks/${task.id}/evidence`, {
        method: "POST",
        json: { document_id: evidence[task.id] },
      });
      notify(t("onboarding.evidence_attached"));
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function closeCase() {
    setWorking("case");
    setActionError(null);
    try {
      await apiFetch(`/onboarding/cases/${id}`, {
        method: "PATCH",
        json: { status: "completed" },
      });
      notify(t("onboarding.case_completed"));
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

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("onboarding.case_ref", { id: shortReference(data.item.id) })}
        title={t("onboarding.case_title")}
        description={t("onboarding.subtitle")}
        actions={
          <>
            <Link className="btn btn-ghost" href={`/${locale}/onboarding`}>
              <ArrowLeft size={15} aria-hidden="true" />
              {t("actions.back_to_list")}
            </Link>
            {canCreate && !closed && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={working === "case" || remaining > 0}
                onClick={() => void closeCase()}
                title={remaining > 0 ? t("onboarding.tasks_remaining", { count: remaining }) : undefined}
              >
                {working === "case" ? <Spinner light /> : <CheckCircle2 size={15} aria-hidden="true" />}
                {t("onboarding.close_case")}
              </button>
            )}
          </>
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
              <div>
                <h2>{t("onboarding.progress")}</h2>
                <p>
                  {data.item.progress
                    ? `${data.item.progress.completed}/${data.item.progress.total} ${t("onboarding.tasks").toLowerCase()}`
                    : t("onboarding.progress_empty")}
                </p>
              </div>
              <StatusBadge status={data.item.status} />
            </div>
            <div className="card-body">
              <Progress
                value={data.item.progress?.percent ?? 0}
                label={t("onboarding.progress")}
              />
              <dl className="detail-list mt-3">
                <div>
                  <dt>{t("onboarding.start_date")}</dt>
                  <dd>{formatDate(data.item.start_date, locale)}</dd>
                </div>
                <div>
                  <dt>{t("onboarding.owner_employee")}</dt>
                  <dd>{shortReference(data.item.employee_id)}</dd>
                </div>
                <div>
                  <dt>{t("onboarding.template")}</dt>
                  <dd>{shortReference(data.item.template_id)}</dd>
                </div>
                <div>
                  <dt>{t("onboarding.tasks_remaining", { count: remaining })}</dt>
                  <dd>{remaining}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card" aria-labelledby="tasks-title">
            <div className="card-header">
              <div>
                <h2 id="tasks-title">{t("onboarding.tasks")}</h2>
                <p>{t("onboarding.only_assigned")}</p>
              </div>
              <span className="badge badge-neutral">{tasks.length}</span>
            </div>
            <div className="card-body">
              {tasks.length === 0 ? (
                <EmptyState
                  icon={FileCheck2}
                  title={t("onboarding.task_empty")}
                  body={t("onboarding.progress_empty")}
                />
              ) : (
                <div className="stack-sm">
                  {tasks.map((task, index) => {
                    const isMine = task.owner_user_id === me?.user.id;
                    const canUpdate =
                      !closed && canUpdateTasks && (isMine || canCreate);
                    const next = transitions[task.status] ?? [];
                    return (
                      <article className="task-row" key={task.id}>
                        <div className="task-index">
                          {task.status === "completed" ? (
                            <CheckCircle2 size={14} aria-hidden="true" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="spacer">
                          <div className="row-between">
                            <div>
                              <div className="section-title">{task.title}</div>
                              <div className="tiny muted">
                                {t("onboarding.task_of", {
                                  current: index + 1,
                                  total: tasks.length,
                                })}
                                {task.due_at
                                  ? ` · ${t("onboarding.due")}: ${formatDate(task.due_at, locale)}`
                                  : ""}
                              </div>
                            </div>
                            <StatusBadge status={task.status} />
                          </div>

                          <div className="row wrap mt-2">
                            <span className="badge badge-neutral">
                              <UserRound size={10} aria-hidden="true" />
                              {isMine ? t("requests.you") : shortReference(task.owner_user_id)}
                            </span>
                            {task.evidence_document_id && (
                              <span className="badge badge-success">
                                <Paperclip size={10} aria-hidden="true" />
                                {t("onboarding.evidence")}
                              </span>
                            )}
                            {task.completed_at && (
                              <span className="badge badge-neutral">
                                <CalendarDays size={10} aria-hidden="true" />
                                {formatDateTime(task.completed_at, locale)}
                              </span>
                            )}
                          </div>

                          {canUpdate && next.length > 0 && (
                            <div className="task-actions">
                              <label className="sr-only" htmlFor={`task-status-${task.id}`}>
                                {t("onboarding.task")}
                              </label>
                              <select
                                id={`task-status-${task.id}`}
                                className="select"
                                value={selectedStatus[task.id] ?? ""}
                                onChange={(event) =>
                                  setSelectedStatus((current) => ({
                                    ...current,
                                    [task.id]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">{t("app.none")}</option>
                                {next.map((status) => (
                                  <option value={status} key={status}>
                                    {t(`status.${status}`)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={
                                  !selectedStatus[task.id] || working === task.id
                                }
                                onClick={() =>
                                  void updateTask(task, selectedStatus[task.id])
                                }
                              >
                                {working === task.id ? <Spinner /> : null}
                                {t("actions.save_changes")}
                              </button>

                              {!task.evidence_document_id &&
                                data.documents.length > 0 && (
                                  <>
                                    <select
                                      className="select"
                                      aria-label={t("onboarding.evidence")}
                                      value={evidence[task.id] ?? ""}
                                      onChange={(event) =>
                                        setEvidence((current) => ({
                                          ...current,
                                          [task.id]: event.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">{t("onboarding.evidence_attach")}</option>
                                      {data.documents.map((document) => (
                                        <option value={document.id} key={document.id}>
                                          {document.filename}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      disabled={
                                        !evidence[task.id] ||
                                        working === `evidence-${task.id}`
                                      }
                                      onClick={() => void attachEvidence(task)}
                                    >
                                      {working === `evidence-${task.id}` ? (
                                        <Spinner />
                                      ) : (
                                        <Paperclip size={13} aria-hidden="true" />
                                      )}
                                      {t("onboarding.evidence_attach")}
                                    </button>
                                  </>
                                )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>{t("onboarding.evidence")}</h2>
            </div>
            <div className="card-body">
              {data.documents.length === 0 ? (
                <p className="muted small">{t("onboarding.no_documents")}</p>
              ) : (
                <div className="stack-sm">
                  {data.documents.slice(0, 8).map((document) => (
                    <div className="row" key={document.id}>
                      <Paperclip size={14} aria-hidden="true" />
                      <div className="spacer">
                        <div className="small" style={{ fontWeight: 600 }}>
                          {document.filename}
                        </div>
                        <div className="tiny muted">{document.mime_type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {closed && (
            <div className="aside-card">
              <h3>{t("onboarding.case_closed")}</h3>
              <p>{t("onboarding.case_empty_body")}</p>
            </div>
          )}

          <div className="aside-card">
            <h3>{t("onboarding.tasks")}</h3>
            <p>
              {taskStatuses
                .map((status) => t(`status.${status}`))
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
