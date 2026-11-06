import { NextRequest, NextResponse } from "next/server";

const locales = ["en", "hi"] as const;

// Documented route aliases (Frontend.md §4.4). They redirect to the canonical
// screens so each page has a single implementation.
const aliasRoutes: Record<string, string> = {
  "/hr-assistant": "/assistant",
  "/service-requests": "/requests",
  "/service-requests/new": "/requests/new",
  "/service-requests/queue": "/requests?scope=queue",
  "/requests/queue": "/requests?scope=queue",
  "/onboarding/cases": "/onboarding",
  "/onboarding/tasks": "/onboarding",
  "/leave/approvals": "/leave?tab=approvals",
  "/recruitment/requisitions": "/recruitment",
  "/recruitment/applications": "/recruitment",
  "/admin/members": "/admin?tab=members",
  "/admin/roles": "/admin?tab=members",
  "/admin/leave-types": "/admin?tab=policy",
  "/admin/approval-rules": "/admin?tab=policy",
  "/admin/reminder-rules": "/admin?tab=policy",
  "/admin/service-catalog": "/admin?tab=policy",
  "/admin/retention": "/admin?tab=retention",
  "/admin/content": "/editorial",
  "/admin/content-reports": "/editorial?tab=reports",
};

function preferredLocale(request: NextRequest): string {
  const cookie = request.cookies.get("hr_locale")?.value;
  if (cookie === "en" || cookie === "hi") return cookie;
  const header = request.headers.get("accept-language") || "";
  if (/(^|,)\s*hi\b/i.test(header)) return "hi";
  return "en";
}

// Coarse route hygiene (Frontend.md §6.2): internal workspace routes require an
// internal session. Middleware only checks that a session cookie pair exists —
// the API still authorizes every request server-side. Signed-in users whose
// session is stale land on the client-side redirect in InternalShell.
const internalSegments = new Set([
  "dashboard",
  "assistant",
  "requests",
  "leave",
  "notifications",
  "onboarding",
  "recruitment",
  "resume",
  "reports",
  "audit",
  "editorial",
  "admin",
]);

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.has("hr_access") || request.cookies.has("hr_refresh");
}

function internalPath(rest: string): string | null {
  const segment = rest.split("/")[1];
  return segment && internalSegments.has(segment) ? segment : null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];

  if (locales.includes(firstSegment as (typeof locales)[number])) {
    const rest = pathname.slice(firstSegment.length + 1) || "/";
    if (internalPath(rest) && !hasSessionCookie(request)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/sign-in`;
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
    const target = aliasRoutes[rest];
    if (target) {
      const url = request.nextUrl.clone();
      const [targetPath, targetQuery] = target.split("?");
      url.pathname = `/${firstSegment}${targetPath}`;
      url.search = targetQuery ? `?${targetQuery}` : "";
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }

  const locale = preferredLocale(request);
  const url = request.nextUrl.clone();
  const internal = internalPath(`/${pathname === "/" ? "" : pathname}`);
  if (internal && !hasSessionCookie(request)) {
    url.pathname = `/${locale}/sign-in`;
    url.search = `?next=${encodeURIComponent(`/${locale}${pathname}`)}`;
    return NextResponse.redirect(url);
  }
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}


export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
