import { NextRequest, NextResponse } from "next/server";

const locales = ["en", "hi"] as const;

function preferredLocale(request: NextRequest): string {
  const cookie = request.cookies.get("hr_locale")?.value;
  if (cookie === "en" || cookie === "hi") return cookie;
  const header = request.headers.get("accept-language") || "";
  if (/(^|,)\s*hi\b/i.test(header)) return "hi";
  return "en";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];
  if (locales.includes(firstSegment as (typeof locales)[number])) {
    return NextResponse.next();
  }

  const locale = preferredLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
