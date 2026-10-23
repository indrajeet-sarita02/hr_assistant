import { normalizeLocale } from "./i18n";

export function safeNextPath(
  next: string | string[] | undefined,
  localeInput: string | undefined,
): string {
  const locale = normalizeLocale(localeInput);
  const value = Array.isArray(next) ? next[0] : next;
  if (!value) return `/${locale}/dashboard`;
  if (!value.startsWith("/") || value.startsWith("//")) return `/${locale}/dashboard`;
  if (!value.startsWith(`/${locale}/`) && value !== `/${locale}`) {
    return `/${locale}/dashboard`;
  }
  return value;
}

export function localePath(locale: string, path: string): string {
  if (!path || path === "/") return `/${locale}`;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Choose the post-authentication landing route. Public career accounts cannot
 * open internal HR routes, so fall back to their resume profile when the
 * requested destination is internal.
 */
export function postAuthPath(
  me: { user: { user_type: string } },
  next: string,
  locale: string,
): string {
  if (me.user.user_type !== "public") return next;
  const publicPrefixes = [
    `/${locale}/jobs`,
    `/${locale}/exams`,
    `/${locale}/courses`,
    `/${locale}/mock-tests`,
    `/${locale}/resume`,
    `/${locale}/account`,
    `/${locale}/content-feedback`,
    `/${locale}/privacy`,
    `/${locale}/terms`,
    `/${locale}/accessibility`,
  ];
  const isPublic = publicPrefixes.some(
    (prefix) => next === prefix || next.startsWith(`${prefix}/`),
  );
  return isPublic ? next : `/${locale}/resume`;
}
