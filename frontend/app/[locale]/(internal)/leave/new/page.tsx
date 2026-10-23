"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Info, Send, Sun } from "lucide-react";

import { useI18n } from "@/components/layout/LocaleProvider";
import { useSession } from "@/components/layout/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/States";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { newIdempotencyKey } from "@/lib/idempotency";
import { hasPermission, permissions } from "@/lib/permissions";
import type {
  CalendarOut,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
} from "@/lib/types";

interface FormData {
  types: LeaveType[];
  balances: LeaveBalance[];
  calendars: CalendarOut[];
}

function localDateString(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export default function NewLeaveRequestPage() {
  const { locale, t } = useI18n();
  const { me } = useSession();
  const router = useRouter();
  const canCreate = hasPermission(me?.permissions, permissions.leaveCreate);
  const { data, loading, error, reload } = useAsync<FormData>(async () => {
    const [types, balances, calendars] = await Promise.all([
      apiFetch<LeaveType[]>("/leave/types"),
      apiFetch<LeaveBalance[]>("/leave/balances").catch(() => []),
      apiFetch<CalendarOut[]>("/leave/calendar").catch(() => []),
    ]);
    return { types, balances, calendars };
  }, []);

  const [typeId, setTypeId] = useState("");
  const [startDate, setStartDate] = useState(localDateString(new Date()));
  const [endDate, setEndDate] = useState(localDateString(new Date()));
  const [partialDay, setPartialDay] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const idempotencyKey = useRef(newIdempotencyKey());

  const selectedType = useMemo(() => {
    const types = data?.types ?? [];
    if (!types.length) return null;
    return types.find((type) => type.id === typeId) ?? types[0];
  }, [data?.types, typeId]);

  const balance = useMemo(() => {
    if (!selectedType) return null;
    return (
      data?.balances.find((item) => item.leave_type_id === selectedType.id) ?? null
    );
  }, [data?.balances, selectedType]);

  const upcomingHolidays = useMemo<Holiday[]>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 60);
    return (data?.calendars.flatMap((calendar) => calendar.holidays) ?? [])
      .filter((holiday) => {
        const date = new Date(`${holiday.date}T00:00:00`);
        return date >= start && date <= end;
      })
      .sort(
        (a, b) =>
          new Date(`${a.date}T00:00:00`).getTime() -
          new Date(`${b.date}T00:00:00`).getTime(),
      )
      .slice(0, 5);
  }, [data?.calendars]);

  const dayCount = useMemo(() => {
    if (partialDay) return 0.5;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }, [startDate, endDate, partialDay]);

  const available = balance
    ? Math.max(
        0,
        Number(balance.entitled || 0) +
          Number(balance.carried_forward || 0) -
          Number(balance.consumed || 0) -
          Number(balance.pending || 0),
      )
    : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!selectedType) errors.type = t("leave.type_required");
    if (!startDate) errors.start = t("leave.invalid_dates");
    if (!partialDay && !endDate) errors.end = t("leave.invalid_dates");
    if (!partialDay && endDate < startDate) errors.end = t("leave.invalid_dates");
    if (available !== null && dayCount > available && selectedType?.requires_approval) {
      errors.balance = t("leave.insufficient");
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length || !selectedType) return;

    const start = new Date(`${startDate}T09:00:00`);
    const end = new Date(
      partialDay ? `${startDate}T13:00:00` : `${endDate}T18:00:00`,
    );
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await apiFetch<LeaveRequest>("/leave/requests", {
        method: "POST",
        idempotencyKey: idempotencyKey.current,
        json: {
          leave_type_id: selectedType.id,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          reason: reason.trim() || null,
          partial_day: partialDay,
        },
      });
      router.push(`/${locale}/leave/${created.id}?created=1`);
    } catch (caught) {
      setSubmitError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t("state.forbidden_title")} description={t("state.forbidden_body")} />
        <Link className="btn btn-secondary" href={`/${locale}/leave`}>
          {t("actions.back_to_list")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t("leave.new_title")} />
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
        eyebrow={t("leave.title")}
        title={t("leave.new_title")}
        description={t("leave.new_subtitle")}
        actions={
          <Link className="btn btn-ghost" href={`/${locale}/leave`}>
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
            <h2>{t("leave.dates")}</h2>
            <p>{t("leave.end_inclusive")}</p>
          </div>
          <span className="badge badge-info">
            <CalendarDays size={11} aria-hidden="true" />
            {t("leave.day_count", { count: formatNumber(dayCount, locale) })}
          </span>
        </div>
        <div className="card-body stack">
          <Field
            label={t("leave.type")}
            htmlFor="leave-type"
            required
            error={fieldErrors.type}
          >
            <select
              id="leave-type"
              className="select"
              value={selectedType?.id ?? ""}
              onChange={(event) => {
                setTypeId(event.target.value);
                setPartialDay(false);
              }}
              required
            >
              {data?.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {locale === "hi" && type.name_hi ? type.name_hi : type.name_en}
                </option>
              ))}
            </select>
          </Field>

          {balance !== null && selectedType && (
            <div className="balance-line">
              <div>
                <div className="tiny muted">{t("leave.balance_available")}</div>
                <div className="balance-line-value">
                  {formatNumber(available, locale)}
                </div>
              </div>
              <div className="balance-line-meta">
                <span>
                  {t("leave.balance_entitled")}:{" "}
                  {formatNumber(Number(balance?.entitled || 0), locale)}
                </span>
                <span>
                  {t("leave.balance_used")}:{" "}
                  {formatNumber(Number(balance?.consumed || 0), locale)}
                </span>
                <span>
                  {t("leave.balance_pending")}:{" "}
                  {formatNumber(Number(balance?.pending || 0), locale)}
                </span>
              </div>
            </div>
          )}

          <div className="form-grid">
            <Field
              label={t("leave.start_date")}
              htmlFor="start-date"
              required
              error={fieldErrors.start}
            >
              <input
                id="start-date"
                type="date"
                className="input"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  if (!endDate || endDate < event.target.value) setEndDate(event.target.value);
                }}
                required
              />
            </Field>
            <Field
              label={t("leave.end_date")}
              htmlFor="end-date"
              required
              error={fieldErrors.end}
            >
              <input
                id="end-date"
                type="date"
                className="input"
                value={partialDay ? startDate : endDate}
                min={startDate}
                disabled={partialDay}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </Field>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={partialDay}
              disabled={!selectedType?.allow_half_day}
              onChange={(event) => {
                setPartialDay(event.target.checked);
                if (event.target.checked) setEndDate(startDate);
              }}
            />
            <span>
              <span className="small" style={{ fontWeight: 650 }}>
                {t("leave.partial_day")}
              </span>
              <span className="tiny muted" style={{ display: "block" }}>
                {t("leave.partial_hint")}
              </span>
            </span>
          </label>

          {fieldErrors.balance && (
            <Alert tone="warning" title={t("leave.insufficient")}>
              {fieldErrors.balance}
            </Alert>
          )}

          <Field label={t("leave.reason")} htmlFor="leave-reason" hint={t("app.optional")}>
            <textarea
              id="leave-reason"
              className="textarea"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("leave.reason_placeholder")}
              maxLength={2000}
            />
          </Field>

          <Alert tone="info" title={t("leave.approver_note")}>
            {t("leave.team_scope")}
          </Alert>
        </div>
        <div className="card-footer row">
          <Link className="btn btn-ghost" href={`/${locale}/leave`}>
            {t("app.cancel")}
          </Link>
          <span className="spacer" />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !selectedType || dayCount <= 0}
          >
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

      <div className="split mt-3">
        <section className="card">
          <div className="card-header">
            <h2>
              <Sun size={15} aria-hidden="true" style={{ display: "inline", marginRight: 5 }} />
              {t("leave.holidays")}
            </h2>
          </div>
          <div className="card-body">
            {upcomingHolidays.length === 0 ? (
              <p className="muted small">{t("leave.holidays_empty")}</p>
            ) : (
              <div className="stack-sm">
                {upcomingHolidays.map((holiday) => (
                  <div className="row-between" key={`${holiday.date}-${holiday.name}`}>
                    <span className="small">{holiday.name}</span>
                    <span className="tiny muted">{formatDate(holiday.date, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="aside-card">
          <h3>
            <CheckCircle2 size={13} aria-hidden="true" style={{ display: "inline", marginRight: 5 }} />
            {t("assistant.disclaimer")}
          </h3>
          <p>
            <Info size={13} aria-hidden="true" style={{ display: "inline", marginRight: 4 }} />
            {t("leave.approver_note")}
          </p>
        </div>
      </div>
    </div>
  );
}
