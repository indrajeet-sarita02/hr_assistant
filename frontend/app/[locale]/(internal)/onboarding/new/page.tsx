"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Info, UserPlus } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/States";
import { apiFetch, errorMessage, fieldError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import type { OnboardingCase, OnboardingTemplate } from "@/lib/types";

function today(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export default function NewOnboardingCasePage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const router = useRouter();
  const canCreate = hasPermission(me?.permissions, permissions.onboardingCreate);
  const { data, loading, error, reload } = useAsync(
    () => apiFetch<OnboardingTemplate[]>("/onboarding/templates"),
    [],
  );
  const [employeeId, setEmployeeId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedTemplate = useMemo(() => {
    if (!data?.length) return null;
    return data.find((item) => item.id === templateId) ?? data[0];
  }, [data, templateId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!employeeId.trim()) errors.employee_id = t("requests.field_required", { field: t("onboarding.owner_employee") });
    if (!selectedTemplate) errors.template = t("requests.field_required", { field: t("onboarding.template") });
    if (!startDate) errors.start_date = t("requests.field_required", { field: t("onboarding.start_date") });
    setFieldErrors(errors);
    if (Object.keys(errors).length || !selectedTemplate) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await apiFetch<OnboardingCase>("/onboarding/cases", {
        method: "POST",
        json: {
          employee_id: employeeId.trim(),
          template_id: selectedTemplate.id,
          start_date: startDate,
        },
      });
      router.push(`/${locale}/onboarding/${created.id}`);
    } catch (caught) {
      setSubmitError(caught);
      setFieldErrors({
        employee_id: fieldError(caught, "employee_id") || "",
        template: fieldError(caught, "template_id") || "",
        start_date: fieldError(caught, "start_date") || "",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t("state.forbidden_title")} description={t("state.forbidden_body")} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t("onboarding.case_title")} />
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
        eyebrow={t("onboarding.title")}
        title={locale === "hi" ? "ऑनबोर्डिंग केस बनाएँ" : "Create onboarding case"}
        description={t("onboarding.subtitle")}
        actions={
          <Link className="btn btn-ghost" href={`/${locale}/onboarding`}>
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
            <h2>{t("onboarding.case_title")}</h2>
            <p>{t("onboarding.subtitle")}</p>
          </div>
          <span className="badge badge-info">
            <UserPlus size={11} aria-hidden="true" />
            {t("onboarding.case_title")}
          </span>
        </div>
        <div className="card-body stack">
          <Field
            label={t("onboarding.owner_employee")}
            htmlFor="employee-id"
            required
            hint={locale === "hi" ? "कर्मचारी प्रोफ़ाइल UUID दर्ज करें।" : "Enter the employee profile UUID from the HR directory."}
            error={fieldErrors.employee_id}
          >
            <input
              id="employee-id"
              className="input"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>

          <Field
            label={t("onboarding.template")}
            htmlFor="template-id"
            required
            error={fieldErrors.template}
          >
            <select
              id="template-id"
              className="select"
              value={selectedTemplate?.id ?? ""}
              onChange={(event) => setTemplateId(event.target.value)}
              required
            >
              {data?.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name} · v{template.version}
                </option>
              ))}
            </select>
          </Field>

          {selectedTemplate && (
            <div className="aside-card">
              <h3>{t("onboarding.tasks")}</h3>
              <p>
                {formatNumber(selectedTemplate.tasks.length, locale)}{" "}
                {t("onboarding.tasks").toLowerCase()}
              </p>
              <ol className="task-preview-list mt-2">
                {selectedTemplate.tasks.map((task) => (
                  <li key={task.id}>
                    {task.title}
                    {task.required_evidence && (
                      <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                        {t("onboarding.evidence_required")}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <Field
            label={t("onboarding.start_date")}
            htmlFor="start-date"
            required
            error={fieldErrors.start_date}
          >
            <input
              id="start-date"
              type="date"
              className="input"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </Field>

          <Alert tone="info" title={t("onboarding.only_assigned")}>
            <span className="row" style={{ alignItems: "flex-start" }}>
              <Info size={15} aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 2 }} />
              {locale === "hi"
                ? "टेम्पलेट से कार्य बनेंगे और प्रत्येक कार्य अपने स्वामी को सौंपा जाएगा।"
                : "Tasks will be created from the template and assigned to their owners."}
            </span>
          </Alert>
        </div>
        <div className="card-footer row">
          <Link className="btn btn-ghost" href={`/${locale}/onboarding`}>
            {t("app.cancel")}
          </Link>
          <span className="spacer" />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !selectedTemplate}
          >
            {submitting ? <Spinner light /> : <CalendarDays size={15} aria-hidden="true" />}
            {t("actions.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
