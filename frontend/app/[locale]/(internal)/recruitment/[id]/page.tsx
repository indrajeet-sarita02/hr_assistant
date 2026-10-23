"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  MapPin,
  Plus,
  Send,
  UserRound,
  X,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingPanel, Spinner } from "@/components/ui/States";
import { apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, shortReference } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasAnyPermission, hasPermission, permissions } from "@/lib/permissions";
import { applicationStages } from "@/lib/status";
import type {
  Application,
  Candidate,
  Interview,
  Page,
  Requisition,
} from "@/lib/types";

const stageTransitions: Record<string, string[]> = {
  received: ["screening", "rejected", "withdrawn"],
  screening: ["interview", "rejected", "withdrawn"],
  interview: ["offer", "rejected", "withdrawn"],
  offer: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function RequisitionDetailPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const justCreated = searchParams.get("created") === "1";
  const perms = me?.permissions;
  const canManage = hasPermission(perms, permissions.recruitmentManage);
  const canApprove = hasPermission(perms, permissions.recruitmentApprove);
  const canReadApps = hasPermission(perms, permissions.recruitmentApplications);
  const canCreateApp = hasPermission(perms, permissions.recruitmentApplicationCreate);
  const canUpdateStage = hasPermission(perms, permissions.recruitmentStage);
  const canSchedule = hasPermission(perms, permissions.recruitmentInterview);

  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [interviewFor, setInterviewFor] = useState<Application | null>(null);
  const [interviewAt, setInterviewAt] = useState(tomorrow());
  const [interviewDuration, setInterviewDuration] = useState("45");
  const [interviewMode, setInterviewMode] = useState("video");
  const [interviewLocation, setInterviewLocation] = useState("");
  const [stageValues, setStageValues] = useState<Record<string, string>>({});
  const [reasonValues, setReasonValues] = useState<Record<string, string>>({});

  const { data, loading, error, reload } = useAsync(async () => {
    const requisition = await apiGet<Requisition>(`/recruitment/requisitions/${id}`);
    let applications: Page<Application> | null = null;
    let candidates: Record<string, Candidate> = {};
    if (canReadApps) {
      applications = await apiGet<Page<Application>>(
        `/recruitment/applications?requisition_id=${id}&limit=100`,
      );
      const unique = Array.from(
        new Set(applications.items.map((item) => item.candidate_id)),
      );
      const loaded = await Promise.all(
        unique.map((candidateId) =>
          apiGet<Candidate>(`/recruitment/candidates/${candidateId}`).catch(
            () => null,
          ),
        ),
      );
      candidates = Object.fromEntries(
        loaded
          .filter((item): item is Candidate => Boolean(item))
          .map((item) => [item.id, item]),
      );
    }
    return { requisition, applications, candidates };
  }, [id, canReadApps]);

  const apps = data?.applications?.items ?? [];
  const pipelineCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const app of apps) map.set(app.stage, (map.get(app.stage) ?? 0) + 1);
    return map;
  }, [apps]);

  async function runAction(
    key: string,
    path: string,
    body: Record<string, unknown>,
    success: string,
  ) {
    setWorking(key);
    setActionError(null);
    try {
      await apiFetch(path, { method: "POST", json: body });
      notify(success);
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function approve(decision: "approved" | "rejected") {
    await runAction(
      decision,
      `/recruitment/requisitions/${id}/approval`,
      { decision, comment: approvalComment.trim() || null },
      decision === "approved"
        ? t("recruitment.approved")
        : t("recruitment.rejected"),
    );
    setApprovalOpen(false);
    setApprovalComment("");
  }

  async function addApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("application");
    setActionError(null);
    try {
      await apiFetch<Application>("/recruitment/applications", {
        method: "POST",
        json: {
          requisition_id: id,
          full_name: candidateName.trim(),
          email: candidateEmail.trim(),
          phone: candidatePhone.trim() || null,
        },
      });
      notify(locale === "hi" ? "आवेदन जोड़ा गया।" : "Application added.");
      setApplicationOpen(false);
      setCandidateName("");
      setCandidateEmail("");
      setCandidatePhone("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function updateStage(app: Application) {
    const next = stageValues[app.id];
    if (!next) return;
    setWorking(`stage-${app.id}`);
    setActionError(null);
    try {
      await apiFetch(`/recruitment/applications/${app.id}`, {
        method: "PATCH",
        json: { stage: next, reason: reasonValues[app.id]?.trim() || null },
      });
      notify(t("recruitment.stage_updated"));
      setStageValues((current) => ({ ...current, [app.id]: "" }));
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function scheduleInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interviewFor) return;
    setWorking("interview");
    setActionError(null);
    try {
      await apiFetch<Interview>("/recruitment/interviews", {
        method: "POST",
        json: {
          application_id: interviewFor.id,
          scheduled_at: new Date(interviewAt).toISOString(),
          duration_minutes: Number(interviewDuration),
          timezone: "Asia/Kolkata",
          mode: interviewMode,
          location: interviewLocation.trim() || null,
        },
      });
      notify(t("recruitment.interview_scheduled"));
      setInterviewFor(null);
      setInterviewLocation("");
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

  const requisition = data.requisition;

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("recruitment.requisitions")}
        title={requisition.title}
        description={requisition.description}
        actions={
          <Link className="btn btn-ghost" href={`/${locale}/recruitment`}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t("actions.back_to_list")}
          </Link>
        }
      />

      {justCreated && (
        <div className="mb-3">
          <Alert tone="success" title={t("recruitment.created")}>
            {t("recruitment.submit_for_approval")}
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
              <div className="row wrap">
                <StatusBadge status={requisition.status} />
                <span className="badge badge-neutral">
                  <BriefcaseBusiness size={11} aria-hidden="true" />
                  {requisition.employment_type.replaceAll("_", " ")}
                </span>
              </div>
              <span className="tiny muted">
                {formatDateTime(requisition.created_at, locale)}
              </span>
            </div>
            <div className="card-body">
              <p className="section-copy" style={{ whiteSpace: "pre-wrap" }}>
                {requisition.description}
              </p>
              <hr className="divider" />
              <dl className="detail-list">
                <div>
                  <dt>{t("recruitment.location")}</dt>
                  <dd>
                    <span className="row">
                      <MapPin size={13} aria-hidden="true" />
                      {requisition.location || "—"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t("recruitment.approved")}</dt>
                  <dd>
                    {requisition.approved_at
                      ? formatDateTime(requisition.approved_at, locale)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{t("app.last_updated")}</dt>
                  <dd>{formatDateTime(requisition.created_at, locale)}</dd>
                </div>
                <div>
                  <dt>{t("recruitment.total_applications", { count: apps.length })}</dt>
                  <dd>{apps.length}</dd>
                </div>
              </dl>
            </div>

            {(canManage || canApprove) && (
              <div className="card-footer row wrap">
                {canManage && requisition.status === "draft" && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={working === "submit"}
                    onClick={() =>
                      void runAction(
                        "submit",
                        `/recruitment/requisitions/${id}/submit`,
                        {},
                        t("recruitment.submitted"),
                      )
                    }
                  >
                    {working === "submit" ? <Spinner light /> : <Send size={15} aria-hidden="true" />}
                    {t("recruitment.submit_for_approval")}
                  </button>
                )}
                {canApprove && requisition.status === "pending_approval" && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setApprovalOpen(true)}
                  >
                    <Check size={15} aria-hidden="true" />
                    {t("actions.decide")}
                  </button>
                )}
                {canManage && requisition.status === "approved" && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={working === "open"}
                    onClick={() =>
                      void runAction(
                        "open",
                        `/recruitment/requisitions/${id}/open`,
                        {},
                        t("recruitment.opened"),
                      )
                    }
                  >
                    {working === "open" ? <Spinner light /> : <BriefcaseBusiness size={15} aria-hidden="true" />}
                    {t("recruitment.open_requisition")}
                  </button>
                )}
                {canCreateApp &&
                  ["approved", "open"].includes(requisition.status) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setApplicationOpen(true)}
                    >
                      <Plus size={15} aria-hidden="true" />
                      {t("recruitment.candidate")}
                    </button>
                  )}
              </div>
            )}
          </section>

          {canReadApps && (
            <section className="card" aria-labelledby="pipeline-title">
              <div className="card-header">
                <div>
                  <h2 id="pipeline-title">{t("recruitment.pipeline")}</h2>
                  <p>{t("recruitment.human_decision")}</p>
                </div>
                <span className="badge badge-neutral">{apps.length}</span>
              </div>
              <div className="card-body">
                {apps.length === 0 ? (
                  <EmptyState
                    icon={UserRound}
                    title={t("recruitment.empty_applications")}
                    body={t("recruitment.empty_applications_body")}
                  />
                ) : (
                  <div className="stack-sm">
                    {apps.map((application) => {
                      const candidate = data.candidates[application.candidate_id];
                      const next = stageTransitions[application.stage] ?? [];
                      return (
                        <article className="application-row" key={application.id}>
                          <span className="avatar">
                            {candidate ? candidate.full_name.slice(0, 2).toUpperCase() : "CA"}
                          </span>
                          <div className="spacer">
                            <div className="row-between">
                              <div>
                                <Link
                                  className="section-title"
                                  href={`/${locale}/recruitment/applications/${application.id}`}
                                >
                                  {candidate?.full_name || t("recruitment.no_candidate")}
                                </Link>
                                <div className="tiny muted">
                                  {candidate?.email || shortReference(application.candidate_id)}
                                </div>
                              </div>
                              <StatusBadge status={application.stage} />
                            </div>

                            <div className="row wrap mt-2">
                              <span className="tiny muted">
                                {t("recruitment.applied")}: {formatDate(application.applied_at, locale)}
                              </span>
                              {canSchedule && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => {
                                    setInterviewFor(application);
                                    setInterviewAt(tomorrow());
                                  }}
                                >
                                  {t("recruitment.schedule_interview")}
                                </button>
                              )}
                            </div>

                            {canUpdateStage && next.length > 0 && (
                              <div className="task-actions">
                                <select
                                  className="select"
                                  aria-label={t("recruitment.next_stage")}
                                  value={stageValues[application.id] ?? ""}
                                  onChange={(event) =>
                                    setStageValues((current) => ({
                                      ...current,
                                      [application.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">{t("recruitment.next_stage")}</option>
                                  {next.map((stage) => (
                                    <option value={stage} key={stage}>
                                      {t(`status.${stage}`)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="input"
                                  value={reasonValues[application.id] ?? ""}
                                  onChange={(event) =>
                                    setReasonValues((current) => ({
                                      ...current,
                                      [application.id]: event.target.value,
                                    }))
                                  }
                                  placeholder={t("recruitment.stage_reason")}
                                  aria-label={t("recruitment.stage_reason")}
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={
                                    !stageValues[application.id] ||
                                    working === `stage-${application.id}`
                                  }
                                  onClick={() => void updateStage(application)}
                                >
                                  {working === `stage-${application.id}` ? <Spinner /> : null}
                                  {t("recruitment.update_stage")}
                                </button>
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
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>{t("recruitment.pipeline")}</h2>
            </div>
            <div className="card-body">
              {applicationStages.map((stage) => (
                <div className="row-between pipeline-row" key={stage}>
                  <span className="small">{t(`status.${stage}`)}</span>
                  <span className="badge badge-neutral">
                    {pipelineCounts.get(stage) ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="aside-card">
            <h3>{t("recruitment.human_decision")}</h3>
            <p>{t("recruitment.apply_note")}</p>
          </div>

          <section className="card">
            <div className="card-header">
              <h2>{t("recruitment.applications")}</h2>
            </div>
            <div className="card-body">
              <p className="small muted">
                {t("recruitment.total_applications", { count: apps.length })}
              </p>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        title={t("actions.decide")}
        description={t("recruitment.human_decision")}
        closeLabel={t("app.close")}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setApprovalOpen(false)}
            >
              {t("app.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={Boolean(working)}
              onClick={() => void approve("rejected")}
            >
              {working === "rejected" ? <Spinner light /> : <X size={15} aria-hidden="true" />}
              {t("actions.reject")}
            </button>
            <button
              type="button"
              className="btn btn-success"
              disabled={Boolean(working)}
              onClick={() => void approve("approved")}
            >
              {working === "approved" ? <Spinner light /> : <Check size={15} aria-hidden="true" />}
              {t("actions.approve")}
            </button>
          </>
        }
      >
        <Field label={t("recruitment.approval_comment")} htmlFor="approval-comment">
          <textarea
            id="approval-comment"
            className="textarea"
            rows={4}
            value={approvalComment}
            onChange={(event) => setApprovalComment(event.target.value)}
            maxLength={2000}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(interviewFor)}
        onClose={() => setInterviewFor(null)}
        title={t("recruitment.schedule_interview")}
        description={t("recruitment.apply_note")}
        closeLabel={t("app.close")}
      >
        <form id="schedule-interview-form" onSubmit={scheduleInterview} className="stack">
          <Field label={t("recruitment.interview_date")} htmlFor="interview-at" required>
            <input
              id="interview-at"
              type="datetime-local"
              className="input"
              value={interviewAt}
              onChange={(event) => setInterviewAt(event.target.value)}
              required
            />
          </Field>
          <div className="form-grid">
            <Field
              label={t("recruitment.interview_duration")}
              htmlFor="interview-duration"
              required
            >
              <input
                id="interview-duration"
                type="number"
                className="input"
                min={15}
                max={480}
                value={interviewDuration}
                onChange={(event) => setInterviewDuration(event.target.value)}
                required
              />
            </Field>
            <Field label={t("recruitment.interview_mode")} htmlFor="interview-mode">
              <select
                id="interview-mode"
                className="select"
                value={interviewMode}
                onChange={(event) => setInterviewMode(event.target.value)}
              >
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in_person">
                  {locale === "hi" ? "व्यक्तिगत" : "In person"}
                </option>
              </select>
            </Field>
          </div>
          <Field
            label={t("recruitment.interview_location")}
            htmlFor="interview-location"
          >
            <input
              id="interview-location"
              className="input"
              value={interviewLocation}
              onChange={(event) => setInterviewLocation(event.target.value)}
              maxLength={300}
            />
          </Field>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={working === "interview"}
          >
            {working === "interview" ? <Spinner light /> : null}
            {t("recruitment.schedule_interview")}
          </button>
        </form>
      </Modal>

      <Modal
        open={applicationOpen}
        onClose={() => setApplicationOpen(false)}
        title={t("recruitment.candidate")}
        description={t("recruitment.apply_note")}
        closeLabel={t("app.close")}
      >
        <form id="add-application-form" onSubmit={addApplication} className="stack">
          <Field label={t("recruitment.candidate")} htmlFor="candidate-name" required>
            <input
              id="candidate-name"
              className="input"
              value={candidateName}
              onChange={(event) => setCandidateName(event.target.value)}
              minLength={2}
              maxLength={200}
              required
            />
          </Field>
          <Field label={t("recruitment.contact")} htmlFor="candidate-email" required>
            <input
              id="candidate-email"
              type="email"
              className="input"
              value={candidateEmail}
              onChange={(event) => setCandidateEmail(event.target.value)}
              required
            />
          </Field>
          <Field label={t("recruitment.contact")} htmlFor="candidate-phone">
            <input
              id="candidate-phone"
              type="tel"
              className="input"
              value={candidatePhone}
              onChange={(event) => setCandidatePhone(event.target.value)}
              maxLength={40}
            />
          </Field>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={working === "application"}
          >
            {working === "application" ? <Spinner light /> : <Plus size={15} aria-hidden="true" />}
            {t("actions.add")}
          </button>
        </form>
      </Modal>
    </div>
  );
}
