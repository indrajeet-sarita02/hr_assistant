import type { Locale } from "./i18n";

const intlLocales: Record<Locale, string> = {
  en: "en-IN",
  hi: "hi-IN",
};

export function intlLocale(locale: Locale): string {
  return intlLocales[locale];
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | number | Date | null | undefined,
  locale: Locale,
  timezone?: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone || undefined,
    ...options,
  }).format(date);
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale: Locale,
  timezone?: string,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: timezone || undefined,
  }).format(date);
}

export function formatTime(
  value: string | number | Date | null | undefined,
  locale: Locale,
  timezone?: string,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone || undefined,
  }).format(date);
}

export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: Locale,
  timezone?: string,
): string {
  const startText = formatDate(start, locale, timezone);
  const endText = formatDate(end, locale, timezone);
  if (startText === endText) return startText;
  return `${startText} – ${endText}`;
}

export function formatNumber(
  value: number | string | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat(intlLocale(locale), options).format(number);
}

export function formatCurrency(
  value: number | string | null | undefined,
  locale: Locale,
  currency = "INR",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(number);
}

export function formatRelative(
  value: string | null | undefined,
  locale: Locale,
): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  if (abs < 60) return formatter.format(diffSeconds, "second");
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86400 * 30)
    return formatter.format(Math.round(diffSeconds / 86400), "day");
  if (abs < 86400 * 365)
    return formatter.format(Math.round(diffSeconds / (86400 * 30)), "month");
  return formatter.format(Math.round(diffSeconds / (86400 * 365)), "year");
}

export function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortReference(id: string | null | undefined, length = 8): string {
  if (!id) return "—";
  return id.replace(/-/g, "").slice(0, length).toUpperCase();
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function dateInputToIso(
  value: string,
  time = "start",
): string {
  if (!value) return "";
  const suffix = time === "end" ? "T23:59:59" : "T00:00:00";
  return new Date(`${value}${suffix}`).toISOString();
}

export function dateInputToNoonIso(value: string): string {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toISOString();
}

export function inclusiveDayCount(start: string, end: string): number {
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

export function isoDateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function timeAgoOrDate(
  value: string | null | undefined,
  locale: Locale,
  timezone?: string,
): string {
  if (!value) return "—";
  const date = new Date(value);
  const age = Date.now() - date.getTime();
  if (age >= 0 && age < 86400000 * 2) return formatRelative(value, locale);
  return formatDate(value, locale, timezone);
}
