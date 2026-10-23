"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Send } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/States";
import { apiFetch, errorMessage, fieldError } from "@/lib/api-client";
import { hasPermission, permissions } from "@/lib/permissions";
import type { Requisition } from "@/lib/types";

export default function NewRequisitionPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const router = useRouter();
  const canManage = hasPermission(me?.permissions, permissions.recruitmentManage);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (title.trim().length < 2) errors.title = t("requests.field_required", { field: t("recruitment.requisition_title") });
    if (description.trim().length < 10) {
      errors.description = locale === "hi" ? "कम से कम 10 अक्षर लिखें।" : "Enter at least 10 characters.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await apiFetch<Requisition>("/recruitment/requisitions", {
        method: "POST",
        json: {
          title: title.trim(),
          location: location.trim() || null,
          employment_type: employmentType,
          description: description.trim(),
        },
      });
      router.push(`/${locale}/recruitment/${created.id}?created=1`);
    } catch (caught) {
      setSubmitError(caught);
      setFieldErrors({
        title: fieldError(caught, "title") || "",
        description: fieldError(caught, "description") || "",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManage) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t("state.forbidden_title")} description={t("state.forbidden_body")} />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        eyebrow={t("recruitment.title")}
        title={t("recruitment.new_requisition")}
        description={t("recruitment.subtitle")}
        actions={
          <Link className="btn btn-ghost" href={`/${locale}/recruitment`}>
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
            <h2>{t("recruitment.new_requisition")}</h2>
            <p>{t("recruitment.human_decision")}</p>
          </div>
          <span className="badge badge-info">
            <BriefcaseBusiness size={11} aria-hidden="true" />
            {t("status.draft")}
          </span>
        </div>
        <div className="card-body stack">
          <Field
            label={t("recruitment.requisition_title")}
            htmlFor="requisition-title"
            required
            error={fieldErrors.title}
          >
            <input
              id="requisition-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
          </Field>

          <div className="form-grid">
            <Field label={t("recruitment.location")} htmlFor="requisition-location">
              <input
                id="requisition-location"
                className="input"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={160}
              />
            </Field>
            <Field
              label={t("recruitment.employment_type")}
              htmlFor="requisition-type"
            >
              <select
                id="requisition-type"
                className="select"
                value={employmentType}
                onChange={(event) => setEmploymentType(event.target.value)}
              >
                <option value="full_time">{t("recruitment.full_time")}</option>
                <option value="part_time">{t("recruitment.part_time")}</option>
                <option value="contract">{t("recruitment.contract")}</option>
                <option value="internship">{t("recruitment.internship")}</option>
              </select>
            </Field>
          </div>

          <Field
            label={t("recruitment.description")}
            htmlFor="requisition-description"
            required
            error={fieldErrors.description}
          >
            <textarea
              id="requisition-description"
              className="textarea"
              rows={7}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={
                locale === "hi"
                  ? "भूमिका, जिम्मेदारियाँ और आवश्यक योग्यता लिखें…"
                  : "Describe the role, responsibilities and required experience…"
              }
              required
            />
          </Field>

          <Alert tone="info" title={t("recruitment.human_decision")}>
            {t("recruitment.apply_note")}
          </Alert>
        </div>
        <div className="card-footer row">
          <Link className="btn btn-ghost" href={`/${locale}/recruitment`}>
            {t("app.cancel")}
          </Link>
          <span className="spacer" />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <Spinner light /> : <Send size={15} aria-hidden="true" />}
            {t("actions.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
