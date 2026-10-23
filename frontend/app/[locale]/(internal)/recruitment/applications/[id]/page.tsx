"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  Mail,
  Phone,
  UserRound,
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
import { applicationStages } from "@/lib/status";
import type { Application, Candidate, Interview, Requisition } from "@/lib/types";

const transitions: Record<string, string[]> = {
  received: ["screening", "rejected", "withdrawn"],
  screening: ["interview", "rejected", "withdrawn"],
  interview: ["offer", "rejected", "withdrawn"],
  offer: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

function defaultInterviewTime(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function ApplicationDetailPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const canUpdateStage = hasPermission(
    me?.permissions,
    permissions.recruitmentStage,
  );
  const canSchedule = hasPermission(
    me?.permissions,
    permissions.recruitmentInterview,
  );
  const [stage, setStage] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewAt, setInterviewAt] = useState(defaultInterviewTime());
  const [interviewDuration, setInterviewDuration] = useState("45");
  const [interviewMode, setInterviewMode] = useState("video");
  const [interviewLocation, setInterviewLocation] = useState("");

  const { data, loading, error, reload } = useAsync(async () => {
    const application = await apiGet<Application>(
      `/recruitment/applications/${id}`,
    );
    const [candidate, requisition] = await Promise.all([
      apiGet<Candidate>(
        `/recruitment/candidates/${application.candidate_id}`,
      ).catch(() => null),
      apiGet<Requisition>(
        `/recruitment/requisitions/${application.requisition_id}`,
      ).catch(() => null),
    ]);
    return { application, candidate, requisition };
  }, [id]);

  useEffect(() => {
    if (data?.application) setStage(data.application.stage);
  }, [data?.application]);

  const nextStages = useMemo(
    () => transitions[data?.application.stage ?? ""] ?? [],
    [data?.application.stage],
  );

  async function updateStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !stage || stage === data.application.stage) return;
    setWorking("stage");
    setActionError(null);
    try {
      await apiFetch(`/recruitment/applications/${id}`, {
        method: "PATCH",
        json: { stage, reason: reason.trim() || null },
      });
      notify(t("recruitment.stage_updated"));
      setReason("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function scheduleInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("interview");
    setActionError(null);
    try {
      await apiFetch<Interview>("/recruitment/interviews", {
        method: "POST",
        json: {
          application_id: id,
          scheduled_at: new Date(interviewAt).toISOString(),
          duration_minutes: Number(interviewDuration),
          timezone: "Asia/Kolkata",
          mode: interviewMode,
          location: interviewLocation.trim() || null,
        },
      });
      notify(t("recruitment.interview_scheduled"));
      setInterviewOpen(false);
      setInterviewLocation("");
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

  const application = data.application;
  const activeIndex = applicationStages.indexOf(application.stage as never);

  return (
    <div className="page page-narrow">
      <PageHeader
        eyebrow={t("recruitment.applications")}
        title={data.candidate?.full_name || t("recruitment.no_candidate")}
        description={data.requisition?.title || t("recruitment.title")}
        actions={
          <Link
            className="btn btn-ghost"
            href={`/${locale}/recruitment/${application.requisition_id}`}
          >
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
                <StatusBadge status={application.stage} />
                <span className="badge badge-neutral">
                  {t("recruitment.applied")}:{" "}
                  {formatDate(application.applied_at, locale)}
                </span>
              </div>
              <span className="tiny muted">
                {t("requests.ref", { id: shortReference(application.id) })}
              </span>
            </div>
            <div className="card-body">
              <div className="candidate-head">
                <span className="avatar avatar-lg">
                  {(data.candidate?.full_name || "CA").slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="section-title">
                    {data.candidate?.full_name || t("recruitment.no_candidate")}
                  </div>
                  <div className="tiny muted">
                    {t("recruitment.candidate")}
                  </div>
                </div>
              </div>

              <dl className="detail-list mt-3">
                <div>
                  <dt>{t("recruitment.contact")}</dt>
                  <dd>
                    <span className="row">
                      <Mail size={13} aria-hidden="true" />
                      {data.candidate?.email || "—"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t("recruitment.phone")}</dt>
                  <dd>
                    <span className="row">
                      <Phone size={13} aria-hidden="true" />
                      {data.candidate?.phone || "—"}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t("recruitment.requisitions")}</dt>
                  <dd>
                    {data.requisition ? (
                      <Link href={`/${locale}/recruitment/${data.requisition.id}`}>
                        {data.requisition.title}
                      </Link>
                    ) : (
                      shortReference(application.requisition_id)
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("app.last_updated")}</dt>
                  <dd>{formatDate(application.applied_at, locale)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t("recruitment.pipeline")}</h2>
                <p>{t("recruitment.human_decision")}</p>
              </div>
              {canSchedule && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setInterviewOpen(true)}
                >
                  <CalendarClock size={14} aria-hidden="true" />
                  {t("recruitment.schedule_interview")}
                </button>
              )}
            </div>
            <div className="card-body">
              <ol className="stage-track">
                {applicationStages.map((item, index) => {
                  const done =
                    activeIndex >= 0 &&
                    index <= activeIndex &&
                    !["rejected", "withdrawn"].includes(application.stage);
                  return (
                    <li
                      className={`stage-track-item${done ? " is-done" : ""}`}
                      key={item}
                    >
                      <span className="stage-track-dot">{index + 1}</span>
                      <span className="small">{t(`status.${item}`)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {canUpdateStage && nextStages.length > 0 && (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>{t("recruitment.update_stage")}</h2>
                  <p>{t("recruitment.human_decision")}</p>
                </div>
              </div>
              <form className="card-body stack" onSubmit={updateStage}>
                <Field label={t("recruitment.next_stage")} htmlFor="stage">
                  <select
                    id="stage"
                    className="select"
                    value={stage}
                    onChange={(event) => setStage(event.target.value)}
                  >
                    <option value={application.stage}>
                      {t(`status.${application.stage}`)}
                    </option>
                    {nextStages.map((item) => (
                      <option value={item} key={item}>
                        {t(`status.${item}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t("recruitment.stage_reason")}
                  htmlFor="stage-reason"
                >
                  <textarea
                    id="stage-reason"
                    className="textarea"
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={1000}
                  />
                </Field>
                <div className="row">
                  <span className="spacer" />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      working === "stage" || stage === application.stage
                    }
                  >
                    {working === "stage" ? <Spinner light /> : null}
                    {t("actions.save_changes")}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>{t("recruitment.applications")}</h2>
            </div>
            <div className="card-body">
              <div className="row-between pipeline-row">
                <span className="small">{t("requests.status")}</span>
                <StatusBadge status={application.status} />
              </div>
              <div className="row-between pipeline-row">
                <span className="small">{t("recruitment.next_stage")}</span>
                <span className="small">
                  {nextStages.length
                    ? nextStages.map((item) => t(`status.${item}`)).join(" · ")
                    : "—"}
                </span>
              </div>
              <div className="row-between pipeline-row">
                <span className="small">{t("recruitment.interview_date")}</span>
                <span className="small">
                  {t("app.not_available")}
                </span>
              </div>
            </div>
          </section>

          <div className="aside-card">
            <h3>
              <BriefcaseBusiness
                size={13}
                aria-hidden="true"
                style={{ display: "inline", marginRight: 5 }}
              />
              {t("recruitment.human_decision")}
            </h3>
            <p>{t("recruitment.apply_note")}</p>
          </div>

          {data.candidate && (
            <section className="card">
              <div className="card-header">
                <h2>{t("recruitment.candidate")}</h2>
              </div>
              <div className="card-body">
                <div className="row">
                  <UserRound size={15} aria-hidden="true" />
                  <div className="spacer">
                    <div className="small" style={{ fontWeight: 650 }}>
                      {data.candidate.full_name}
                    </div>
                    <div className="tiny muted">{data.candidate.email}</div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <Modal
        open={interviewOpen}
        onClose={() => setInterviewOpen(false)}
        title={t("recruitment.schedule_interview")}
        description={t("recruitment.human_decision")}
        closeLabel={t("app.close")}
      >
        <form onSubmit={scheduleInterview} className="stack">
          <Field
            label={t("recruitment.interview_date")}
            htmlFor="application-interview-date"
            required
          >
            <input
              id="application-interview-date"
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
              htmlFor="application-interview-duration"
              required
            >
              <input
                id="application-interview-duration"
                type="number"
                className="input"
                min={15}
                max={480}
                value={interviewDuration}
                onChange={(event) => setInterviewDuration(event.target.value)}
                required
              />
            </Field>
            <Field
              label={t("recruitment.interview_mode")}
              htmlFor="application-interview-mode"
            >
              <select
                id="application-interview-mode"
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
            htmlFor="application-interview-location"
          >
            <input
              id="application-interview-location"
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
    </div>
  );
}
