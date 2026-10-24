"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  Check,
  FileText,
  Flag,
  Plus,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { DataTable } from "@/components/ui/DataTable";
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
import type {
  ContentAdmin,
  ContentReport,
  Page,
} from "@/lib/types";

export default function EditorialPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const perms = me?.permissions;
  const canAccess = hasAnyPermission(perms, [
    permissions.contentEdit,
    permissions.contentReview,
    permissions.contentPublish,
    permissions.contentReportTriage,
  ]);
  const canEdit = hasPermission(perms, permissions.contentEdit);
  const canReview = hasPermission(perms, permissions.contentReview);
  const canPublish = hasPermission(perms, permissions.contentPublish);
  const canTriage = hasPermission(perms, permissions.contentReportTriage);
  const canContent = canEdit || canReview || canPublish;

  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<"content" | "reports">(
    requestedTab === "reports" ? "reports" : "content",
  );
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewing, setReviewing] = useState<ContentAdmin | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reportDraft, setReportDraft] = useState<Record<string, string>>({});
  const [reportResolution, setReportResolution] = useState<
    Record<string, string>
  >({});
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [contentType, setContentType] = useState("article");
  const [contentLocale, setContentLocale] = useState("en");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [sourceChecked, setSourceChecked] = useState("");

  const { data, loading, error, reload } = useAsync(async () => {
    const [content, reports] = await Promise.all([
      canContent
        ? apiGet<Page<ContentAdmin>>("/admin/content?limit=100")
        : Promise.resolve(null),
      canTriage
        ? apiGet<Page<ContentReport>>("/admin/content-reports?limit=100").catch(
            () => ({ items: [], total: 0, limit: 100, offset: 0 }),
          )
        : Promise.resolve(null),
    ]);
    return { content, reports };
  }, [canContent, canTriage]);

  const items = useMemo(() => {
    const list = data?.content?.items ?? [];
    return status ? list.filter((item) => item.status === status) : list;
  }, [data?.content?.items, status]);

  const reports = data?.reports?.items ?? [];
  const activeTab = canContent ? tab : "reports";

  async function contentAction(
    item: ContentAdmin,
    action: "submit" | "publish" | "archive",
  ) {
    setWorking(`${action}-${item.id}`);
    setActionError(null);
    try {
      await apiFetch(`/admin/content/${item.id}/${action === "submit" ? "submit-review" : action}`, {
        method: "POST",
        json: {},
      });
      notify(
        action === "submit"
          ? t("admin.content_submitted")
          : action === "publish"
            ? t("admin.content_published")
            : t("admin.content_archived"),
      );
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function review(decision: "approved" | "changes_requested" | "rejected") {
    if (!reviewing) return;
    setWorking(`review-${reviewing.id}`);
    setActionError(null);
    try {
      await apiFetch(`/admin/content/${reviewing.id}/review`, {
        method: "POST",
        json: { decision, comments: reviewComment.trim() || null },
      });
      notify(t("admin.content_submitted"));
      setReviewing(null);
      setReviewComment("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function triage(report: ContentReport) {
    const next = reportDraft[report.id];
    if (!next) return;
    setWorking(`report-${report.id}`);
    setActionError(null);
    try {
      await apiFetch(`/admin/content-reports/${report.id}`, {
        method: "PATCH",
        json: {
          status: next,
          resolution: reportResolution[report.id]?.trim() || null,
        },
      });
      notify(t("admin.report_resolved"));
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  async function createContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("create");
    setActionError(null);
    try {
      await apiFetch<ContentAdmin>("/admin/content", {
        method: "POST",
        json: {
          content_type: contentType,
          title: title.trim(),
          slug: slug.trim(),
          locale: contentLocale,
          summary: summary.trim() || null,
          body: body.trim(),
          source: source.trim() || null,
          source_checked_at: sourceChecked || null,
        },
      });
      notify(t("admin.content_created"));
      setCreateOpen(false);
      setTitle("");
      setSlug("");
      setSummary("");
      setBody("");
      setSource("");
      setSourceChecked("");
      reload();
    } catch (caught) {
      setActionError(caught);
    } finally {
      setWorking(null);
    }
  }

  if (!canAccess) {
    return (
      <div className="page">
        <PageHeader
          title={t("state.forbidden_title")}
          description={t("state.forbidden_body")}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t("admin.content_title")}
        description={t("admin.content_body")}
        actions={
          canEdit ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("admin.new_content")}
            </button>
          ) : undefined
        }
      />

      <div className="segmented" role="group" aria-label={t("admin.content_title")}>
        {canContent && (
          <button
            type="button"
            className={`segment${activeTab === "content" ? " is-active" : ""}`}
            aria-pressed={activeTab === "content"}
            onClick={() => setTab("content")}
          >
            <FileText size={14} aria-hidden="true" />
            {t("admin.content_title")}
          </button>
        )}
        {canTriage && (
          <button
            type="button"
            className={`segment${activeTab === "reports" ? " is-active" : ""}`}
            aria-pressed={activeTab === "reports"}
            onClick={() => setTab("reports")}
          >
            <Flag size={14} aria-hidden="true" />
            {t("admin.content_reports_title")}
          </button>
        )}
      </div>

      {Boolean(actionError) && (
        <div className="mt-3">
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(actionError, t)}
          </Alert>
        </div>
      )}

      {loading ? (
        <LoadingPanel label={t("app.loading")} />
      ) : error ? (
        <ErrorPanel error={error} onRetry={reload} />
      ) : activeTab === "content" ? (
        <section className="card mt-3">
          <div className="card-header">
            <div>
              <h2>{t("admin.content_title")}</h2>
              <p>{t("admin.content_body")}</p>
            </div>
            <div className="toolbar toolbar-inline">
              <label className="sr-only" htmlFor="content-status">
                {t("requests.status")}
              </label>
              <select
                id="content-status"
                className="select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">{t("app.all")}</option>
                {["draft", "in_review", "approved", "published", "archived"].map(
                  (item) => (
                    <option value={item} key={item}>
                      {t(`status.${item}`)}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="card-body">
              <EmptyState
                icon={FileText}
                title={t("admin.no_content")}
                body={t("admin.no_content_body")}
              />
            </div>
          ) : (
            <DataTable
              caption={t("admin.content_title")}
              rows={items}
              getKey={(row) => row.id}
              columns={[
                {
                  key: "title",
                  label: t("admin.content_title_field"),
                  render: (row) => (
                    <div>
                      <div className="small" style={{ fontWeight: 650 }}>
                        {row.title}
                      </div>
                      <div className="tiny muted">
                        {row.content_type} · {row.locale.toUpperCase()} ·{" "}
                        {formatDate(row.updated_at ?? row.created_at, locale)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: t("requests.status"),
                  render: (row) => <StatusBadge status={row.status} />,
                },
                {
                  key: "source",
                  label: t("app.source_checked"),
                  render: (row) =>
                    row.source_checked_at ? (
                      <span className="badge badge-success">
                        {formatDate(row.source_checked_at, locale)}
                      </span>
                    ) : (
                      <span className="badge badge-warning">
                        {t("app.not_available")}
                      </span>
                    ),
                },
                {
                  key: "actions",
                  label: t("requests.status"),
                  render: (row) => (
                    <div className="row wrap">
                      {row.status === "draft" && canEdit && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={working === `submit-${row.id}`}
                          onClick={() => void contentAction(row, "submit")}
                        >
                          {working === `submit-${row.id}` ? (
                            <Spinner />
                          ) : (
                            <Send size={13} aria-hidden="true" />
                          )}
                          {t("admin.content_submit")}
                        </button>
                      )}
                      {row.status === "in_review" && canReview && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setReviewing(row)}
                        >
                          <ShieldCheck size={13} aria-hidden="true" />
                          {t("actions.decide")}
                        </button>
                      )}
                      {row.status === "approved" && canPublish && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={working === `publish-${row.id}`}
                          onClick={() => void contentAction(row, "publish")}
                        >
                          {working === `publish-${row.id}` ? (
                            <Spinner />
                          ) : (
                            <Check size={13} aria-hidden="true" />
                          )}
                          {t("admin.content_publish")}
                        </button>
                      )}
                      {row.status === "published" && canPublish && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={working === `archive-${row.id}`}
                          onClick={() => void contentAction(row, "archive")}
                        >
                          {working === `archive-${row.id}` ? (
                            <Spinner />
                          ) : (
                            <Archive size={13} aria-hidden="true" />
                          )}
                          {t("admin.content_archive")}
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </section>
      ) : (
        <section className="card mt-3">
          <div className="card-header">
            <div>
              <h2>{t("admin.content_reports_title")}</h2>
              <p>{t("admin.content_reports_body")}</p>
            </div>
            <span className="badge badge-neutral">{reports.length}</span>
          </div>
          <div className="card-body">
            {reports.length === 0 ? (
              <EmptyState
                icon={Flag}
                title={t("admin.no_reports")}
                body={t("admin.no_reports_body")}
              />
            ) : (
              <div className="stack-sm">
                {reports.map((report) => (
                  <article className="report-row" key={report.id}>
                    <div className="row-between">
                      <div>
                        <div className="small" style={{ fontWeight: 650 }}>
                          {report.reason_category}
                        </div>
                        <div className="tiny muted">
                          {report.content_type} · {shortReference(report.content_id)} ·{" "}
                          {formatDateTime(report.created_at, locale)}
                        </div>
                      </div>
                      <StatusBadge status={report.status} />
                    </div>
                    {report.comment && (
                      <p className="small muted mt-1">{report.comment}</p>
                    )}
                    {canTriage && report.status !== "resolved" && (
                      <div className="task-actions">
                        <select
                          className="select"
                          aria-label={t("requests.status")}
                          value={reportDraft[report.id] ?? ""}
                          onChange={(event) =>
                            setReportDraft((current) => ({
                              ...current,
                              [report.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">{t("requests.status")}</option>
                          {["triaged", "resolved", "rejected"].map((item) => (
                            <option value={item} key={item}>
                              {t(`status.${item}`)}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          value={reportResolution[report.id] ?? ""}
                          onChange={(event) =>
                            setReportResolution((current) => ({
                              ...current,
                              [report.id]: event.target.value,
                            }))
                          }
                          placeholder={t("admin.resolution")}
                          aria-label={t("admin.resolution")}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={
                            !reportDraft[report.id] ||
                            working === `report-${report.id}`
                          }
                          onClick={() => void triage(report)}
                        >
                          {working === `report-${report.id}` ? (
                            <Spinner />
                          ) : null}
                          {t("actions.save_changes")}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("admin.new_content")}
        description={t("admin.content_body")}
        closeLabel={t("app.close")}
        wide
      >
        <form onSubmit={createContent} className="stack">
          <div className="form-grid">
            <Field label={t("admin.content_type")} htmlFor="content-type" required>
              <select
                id="content-type"
                className="select"
                value={contentType}
                onChange={(event) => setContentType(event.target.value)}
              >
                <option value="article">{t("nav.content")}</option>
                <option value="job">Job</option>
                <option value="exam">Exam</option>
                <option value="salary">Salary</option>
              </select>
            </Field>
            <Field label={t("admin.content_locale")} htmlFor="content-locale">
              <select
                id="content-locale"
                className="select"
                value={contentLocale}
                onChange={(event) => setContentLocale(event.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </Field>
          </div>
          <Field
            label={t("admin.content_title_field")}
            htmlFor="content-title"
            required
          >
            <input
              id="content-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={2}
              maxLength={250}
              required
            />
          </Field>
          <Field label={t("admin.content_slug")} htmlFor="content-slug" required>
            <input
              id="content-slug"
              className="input"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              minLength={2}
              maxLength={250}
              pattern="[a-z0-9-]+"
              required
            />
          </Field>
          <Field label={t("admin.content_summary")} htmlFor="content-summary">
            <textarea
              id="content-summary"
              className="textarea"
              rows={2}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={2000}
            />
          </Field>
          <Field
            label={t("admin.content_body_field")}
            htmlFor="content-body"
            required
          >
            <textarea
              id="content-body"
              className="textarea"
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              minLength={20}
              required
            />
          </Field>
          <div className="form-grid">
            <Field label={t("admin.content_source")} htmlFor="content-source">
              <input
                id="content-source"
                className="input"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                maxLength={255}
              />
            </Field>
            <Field
              label={t("app.source_checked")}
              htmlFor="content-source-checked"
            >
              <input
                id="content-source-checked"
                type="date"
                className="input"
                value={sourceChecked}
                onChange={(event) => setSourceChecked(event.target.value)}
              />
            </Field>
          </div>
          <Alert tone="info" title={t("admin.content_body")}>
            {t("admin.content_published")}
          </Alert>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={working === "create"}
          >
            {working === "create" ? <Spinner light /> : <Plus size={15} aria-hidden="true" />}
            {t("actions.create")}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title={t("actions.decide")}
        description={reviewing?.title}
        closeLabel={t("app.close")}
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setReviewing(null)}
            >
              {t("app.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={Boolean(working)}
              onClick={() => void review("rejected")}
            >
              <X size={15} aria-hidden="true" />
              {t("actions.reject")}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={Boolean(working)}
              onClick={() => void review("changes_requested")}
            >
              {t("actions.request_clarification")}
            </button>
            <button
              type="button"
              className="btn btn-success"
              disabled={Boolean(working)}
              onClick={() => void review("approved")}
            >
              <Check size={15} aria-hidden="true" />
              {t("actions.approve")}
            </button>
          </>
        }
      >
        <Field label={t("admin.content_summary")} htmlFor="review-comments">
          <textarea
            id="review-comments"
            className="textarea"
            rows={4}
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            maxLength={2000}
          />
        </Field>
      </Modal>
    </div>
  );
}
