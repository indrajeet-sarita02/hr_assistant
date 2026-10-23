import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  backendRequest,
  clearSessionCookies,
  refreshSession,
} from "@/lib/bff";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host")) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  try {
    let accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    const refreshed = await refreshSession();
    if (refreshed) accessToken = refreshed.access_token;

    if (accessToken) {
      await backendRequest("/auth/session", { method: "DELETE" }, accessToken);
    }
  } catch {
    // Local cookie cleanup must not depend on the backend being reachable.
  } finally {
    clearSessionCookies();
  }

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
