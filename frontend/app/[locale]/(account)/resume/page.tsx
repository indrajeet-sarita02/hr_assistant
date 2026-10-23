"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  GraduationCap,
  Languages,
  Lock,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingPanel, Spinner } from "@/components/ui/States";
import { ApiError, apiFetch, apiGet, errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { hasPermission, permissions } from "@/lib/permissions";
import type {
  ResumeEducation,
  ResumeExperience,
  ResumeProfile,
} from "@/lib/types";

export default function ResumePage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const { notify } = useToast();
  const canUse = hasPermission(me?.permissions, permissions.resumeManage);
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [languages, setLanguages] = useState("");
  const [experience, setExperience] = useState<ResumeExperience[]>([]);
  const [education, setEducation] = useState<ResumeEducation[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    try {
      return await apiGet<ResumeProfile>("/resume-profiles");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) return null;
      throw caught;
    }
  }, []);

  useEffect(() => {
    if (data === undefined) return;
    setProfile(data);
    if (!data) return;
    setHeadline(data.headline ?? "");
    setSummary(data.summary ?? "");
    setSkills((data.data.skills ?? []).join(", "));
    setLanguages((data.data.languages ?? []).join(", "));
    setExperience(data.data.experience ?? []);
    setEducation(data.data.education ?? []);
  }, [data]);

  function updateExperience(
    index: number,
    key: keyof ResumeExperience,
    value: string,
  ) {
    setExperience((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function updateEducation(
    index: number,
    key: keyof ResumeEducation,
    value: string,
  ) {
    setEducation((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    const payload = {
      headline: headline.trim() || null,
      summary: summary.trim() || null,
      data: {
        skills: skills
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        languages: languages
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        experience: experience.filter(
          (item) => item.title?.trim() || item.company?.trim(),
        ),
        education: education.filter(
          (item) => item.institution?.trim() || item.qualification?.trim(),
        ),
      },
    };
    try {
      const saved = profile
        ? await apiFetch<ResumeProfile>(`/resume-profiles/${profile.id}`, {
            method: "PATCH",
            json: { ...payload, version: profile.version },
          })
        : await apiFetch<ResumeProfile>("/resume-profiles", {
            method: "POST",
            json: payload,
          });
      setProfile(saved);
      notify(t("resume.saved"));
    } catch (caught) {
      setSaveError(caught);
    } finally {
      setSaving(false);
    }
  }

  if (!canUse) {
    return (
      <div className="page">
        <PageHeader
          title={t("state.forbidden_title")}
          description={t("state.forbidden_body")}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingPanel label={t("app.loading")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorPanel error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        title={profile ? t("resume.title") : t("resume.create_title")}
        description={t("resume.subtitle")}
        actions={
          <span className="badge badge-neutral">
            <Lock size={11} aria-hidden="true" />
            {t("resume.private")}
          </span>
        }
      />

      {Boolean(saveError) && (
        <div className="mb-3">
          <Alert tone="error" title={t("state.error_title")}>
            {errorMessage(saveError, t)}
          </Alert>
        </div>
      )}

      <form className="stack" onSubmit={save}>
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t("resume.headline")}</h2>
              <p>{t("resume.private")}</p>
            </div>
            {profile && (
              <span className="badge badge-neutral">v{profile.version}</span>
            )}
          </div>
          <div className="card-body stack">
            <Field
              label={t("resume.headline")}
              htmlFor="resume-headline"
              hint={t("app.optional")}
            >
              <input
                id="resume-headline"
                className="input"
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                placeholder={t("resume.headline_placeholder")}
                maxLength={200}
              />
            </Field>
            <Field
              label={t("resume.summary")}
              htmlFor="resume-summary"
              hint={t("app.optional")}
            >
              <textarea
                id="resume-summary"
                className="textarea"
                rows={4}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder={t("resume.summary_placeholder")}
                maxLength={5000}
              />
            </Field>
            <div className="form-grid">
              <Field
                label={t("resume.skills")}
                htmlFor="resume-skills"
                hint={t("resume.skills_hint")}
              >
                <input
                  id="resume-skills"
                  className="input"
                  value={skills}
                  onChange={(event) => setSkills(event.target.value)}
                  placeholder="Python, SQL, communication"
                />
              </Field>
              <Field
                label={t("resume.languages")}
                htmlFor="resume-languages"
                hint={t("resume.skills_hint")}
              >
                <input
                  id="resume-languages"
                  className="input"
                  value={languages}
                  onChange={(event) => setLanguages(event.target.value)}
                  placeholder="English, Hindi"
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>
                <BriefcaseBusiness
                  size={16}
                  aria-hidden="true"
                  style={{ display: "inline", marginRight: 6 }}
                />
                {t("resume.experience")}
              </h2>
              <p>{t("resume.private")}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setExperience((current) => [...current, {}])}
            >
              <Plus size={14} aria-hidden="true" />
              {t("resume.add_experience")}
            </button>
          </div>
          <div className="card-body stack">
            {experience.length === 0 ? (
              <p className="small muted">{t("resume.add_experience")}</p>
            ) : (
              experience.map((item, index) => (
                <div className="repeat-card" key={index}>
                  <div className="row-between">
                    <span className="tiny muted">
                      {t("resume.experience")} {index + 1}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("actions.remove")}
                      onClick={() =>
                        setExperience((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field
                      label={t("resume.role_title")}
                      htmlFor={`experience-title-${index}`}
                    >
                      <input
                        id={`experience-title-${index}`}
                        className="input"
                        value={item.title ?? ""}
                        onChange={(event) =>
                          updateExperience(index, "title", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label={t("resume.company")}
                      htmlFor={`experience-company-${index}`}
                    >
                      <input
                        id={`experience-company-${index}`}
                        className="input"
                        value={item.company ?? ""}
                        onChange={(event) =>
                          updateExperience(index, "company", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label={t("resume.from")}
                      htmlFor={`experience-from-${index}`}
                    >
                      <input
                        id={`experience-from-${index}`}
                        className="input"
                        value={item.from ?? ""}
                        onChange={(event) =>
                          updateExperience(index, "from", event.target.value)
                        }
                        placeholder="2022-04"
                      />
                    </Field>
                    <Field
                      label={t("resume.to")}
                      htmlFor={`experience-to-${index}`}
                    >
                      <input
                        id={`experience-to-${index}`}
                        className="input"
                        value={item.to ?? ""}
                        onChange={(event) =>
                          updateExperience(index, "to", event.target.value)
                        }
                        placeholder="Present"
                      />
                    </Field>
                  </div>
                  <Field
                    label={t("resume.summary")}
                    htmlFor={`experience-summary-${index}`}
                  >
                    <textarea
                      id={`experience-summary-${index}`}
                      className="textarea"
                      rows={2}
                      value={item.summary ?? ""}
                      onChange={(event) =>
                        updateExperience(index, "summary", event.target.value)
                      }
                    />
                  </Field>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2>
                <GraduationCap
                  size={16}
                  aria-hidden="true"
                  style={{ display: "inline", marginRight: 6 }}
                />
                {t("resume.education")}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEducation((current) => [...current, {}])}
            >
              <Plus size={14} aria-hidden="true" />
              {t("resume.add_education")}
            </button>
          </div>
          <div className="card-body stack">
            {education.length === 0 ? (
              <p className="small muted">{t("resume.add_education")}</p>
            ) : (
              education.map((item, index) => (
                <div className="repeat-card" key={index}>
                  <div className="row-between">
                    <span className="tiny muted">
                      {t("resume.education")} {index + 1}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("actions.remove")}
                      onClick={() =>
                        setEducation((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="form-grid">
                    <Field
                      label={t("resume.institution")}
                      htmlFor={`education-institution-${index}`}
                    >
                      <input
                        id={`education-institution-${index}`}
                        className="input"
                        value={item.institution ?? ""}
                        onChange={(event) =>
                          updateEducation(
                            index,
                            "institution",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field
                      label={t("resume.qualification")}
                      htmlFor={`education-qualification-${index}`}
                    >
                      <input
                        id={`education-qualification-${index}`}
                        className="input"
                        value={item.qualification ?? ""}
                        onChange={(event) =>
                          updateEducation(
                            index,
                            "qualification",
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                    <Field
                      label={t("resume.year")}
                      htmlFor={`education-year-${index}`}
                    >
                      <input
                        id={`education-year-${index}`}
                        className="input"
                        value={item.year ?? ""}
                        onChange={(event) =>
                          updateEducation(index, "year", event.target.value)
                        }
                        placeholder="2022"
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="row">
          <div className="aside-card">
            <h3>
              <Lock
                size={13}
                aria-hidden="true"
                style={{ display: "inline", marginRight: 5 }}
              />
              {t("resume.export_locked")}
            </h3>
            <p>{t("resume.export_locked_body")}</p>
          </div>
          <span className="spacer" />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner light /> : <Save size={15} aria-hidden="true" />}
            {saving ? t("resume.saving") : t("resume.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
