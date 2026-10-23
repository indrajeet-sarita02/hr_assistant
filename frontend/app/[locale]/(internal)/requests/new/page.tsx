"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LifeBuoy, Send, ShieldCheck } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/States";
import { apiFetch, errorMessage, fieldError } from "@/lib/api-client";
import { formatNumber, humanize } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { newIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, permissions } from "@/lib/permissions";
import type { CatalogItem, ServiceRequest } from "@/lib/types";

export default function NewServiceRequestPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const router = useRouter();
  const canCreate = hasPermission(me?.permissions, permissions.serviceCreate);
  const { data: catalog, loading, error, reload } = useAsync(
    () => apiFetch<CatalogItem[]>("/service-catalog"),
    [],
  );
  const [selectedId, setSelectedId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const idempotencyKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!selectedId && catalog?.length) setSelectedId(catalog[0].id);
  }, [catalog, selectedId]);

  const selected = catalog?.find((item) => item.id === selectedId) ?? null;
  const requiredFields = selected?.form_schema?.required ?? [];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const errors: Record<string, string> = {};
    if (!subject.trim()) errors.subject = t("requests.subject_required");
    if (!description.trim()) errors.description = t("requests.description_required");
    for (const key of requiredFields) {
      if (!String(formData[key] ?? "").trim()) {
        errors[key] = t("requests.field_required", { field: humanize(key) });
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await apiFetch<ServiceRequest>("/service-requests", {
        method: "POST",
        idempotencyKey: idempotencyKey.current,
        json: {
          catalog_item_id: selected.id,
          subject: subject.trim(),
          description: description.trim(),
          form_data: formData,
          priority,
        },
      });
      router.push(`/${locale}/requests/${created.id}`);
    } catch (caught) {
      setSubmitError(caught);
      const nextErrors: Record<string, string> = {};
      for (const key of requiredFields) {
        const message = fieldError(caught, `form_data.${key}`);
        if (message) nextErrors[key] = message;
      }
      setFieldErrors(nextErrors);
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t("state.forbidden_title")} description={t("state.forbidden_body")} />
        <Link className="btn btn-secondary" href={`/${locale}/requests`}>
          {t("actions.back_to_list")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t("requests.new_title")} />
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page-narrow">
        <ErrorPanel error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        eyebrow={t("requests.title")}
        title={t("requests.new_title")}
        description={t("requests.new_subtitle")}
        actions={
          <Link className="btn btn-ghost" href={`/${locale}/requests`}>
            <ArrowLeft size={15} aria-hidden="true" />
            {t("actions.back_to_list")}
          </Link>
        }
      />

      {Boolean(submitError) && (
        <div className="mb-3">
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(submitError, t)}
          </Alert>
        </div>
      )}

      <form className="card" onSubmit={onSubmit} noValidate>
        <div className="card-header">
          <div>
            <h2>{t("requests.form_details")}</h2>
            <p>{t("requests.catalog_hint")}</p>
          </div>
          <span className="badge badge-info">
            <ShieldCheck size={11} aria-hidden="true" />
            {t("app.secure")}
          </span>
        </div>
        <div className="card-body stack">
          <Field label={t("requests.catalog")} htmlFor="catalog" required error={fieldErrors.catalog}>
            <select
              id="catalog"
              className="select"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setFormData({});
                setFieldErrors({});
              }}
              required
            >
              {catalog?.map((item) => (
                <option key={item.id} value={item.id}>
                  {locale === "hi" && item.name_hi ? item.name_hi : item.name_en}
                </option>
              ))}
            </select>
          </Field>

          {selected && (
            <p className="section-copy">
              {selected.description} · {t("requests.sla")}:{" "}
              {formatNumber(selected.sla_hours, locale)} {t("app.hours")}
            </p>
          )}

          <Field label={t("requests.subject")} htmlFor="subject" required error={fieldErrors.subject}>
            <input
              id="subject"
              className="input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t("requests.subject_placeholder")}
              maxLength={200}
              required
              aria-invalid={fieldErrors.subject ? true : undefined}
            />
          </Field>

          <Field
            label={t("requests.description")}
            htmlFor="description"
            required
            hint={t("requests.description_placeholder")}
            error={fieldErrors.description}
          >
            <textarea
              id="description"
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("requests.description_placeholder")}
              rows={5}
              maxLength={10000}
              required
              aria-invalid={fieldErrors.description ? true : undefined}
            />
          </Field>

          {requiredFields.length > 0 && (
            <div className="form-grid">
              {requiredFields.map((key) => {
                const property = selected?.form_schema?.properties?.[key];
                return (
                  <Field
                    key={key}
                    label={property?.title || humanize(key)}
                    htmlFor={`form-${key}`}
                    required
                    hint={property?.description}
                    error={fieldErrors[key]}
                  >
                    <input
                      id={`form-${key}`}
                      className="input"
                      value={formData[key] ?? ""}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, [key]: event.target.value }))
                      }
                      aria-invalid={fieldErrors[key] ? true : undefined}
                      required
                    />
                  </Field>
                );
              })}
            </div>
          )}

          <Field label={t("requests.priority")} htmlFor="priority">
            <select
              id="priority"
              className="select"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="low">{t("priority.low")}</option>
              <option value="normal">{t("priority.normal")}</option>
              <option value="high">{t("priority.high")}</option>
              <option value="urgent">{t("priority.urgent")}</option>
            </select>
          </Field>

          <Alert tone="info" title={t("requests.attachments_note")}>
            {t("requests.attachments_note")}
          </Alert>
        </div>
        <div className="card-footer row">
          <Link className="btn btn-ghost" href={`/${locale}/requests`}>
            {t("app.cancel")}
          </Link>
          <span className="spacer" />
          <button type="submit" className="btn btn-primary" disabled={submitting || !selected}>
            {submitting ? (
              <>
                <Spinner light /> {t("actions.submitting")}
              </>
            ) : (
              <>
                <Send size={15} aria-hidden="true" />
                {t("actions.submit")}
              </>
            )}
          </button>
        </div>
      </form>

      <div className="aside-card mt-3">
        <h3>
          <LifeBuoy size={13} aria-hidden="true" style={{ display: "inline", marginRight: 5 }} />
          {t("requests.catalog_unavailable")}
        </h3>
        <p>{t("requests.catalog_hint")}</p>
      </div>
    </div>
  );
}
