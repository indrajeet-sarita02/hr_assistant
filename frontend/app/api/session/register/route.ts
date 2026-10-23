import { NextRequest, NextResponse } from "next/server";

import { registerWithPassword } from "@/lib/bff";

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

  let body: {
    email?: unknown;
    password?: unknown;
    full_name?: unknown;
    locale?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const locale = body.locale === "hi" ? "hi" : "en";
  if (
    !email ||
    !password ||
    !fullName ||
    email.length > 320 ||
    fullName.length > 200 ||
    password.length < 12 ||
    password.length > 128
  ) {
    return NextResponse.json({ ok: false }, { status: 422 });
  }

  try {
    const response = await registerWithPassword({
      email,
      password,
      full_name: fullName,
      locale,
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", "no-store");
    const responseBody = await response.arrayBuffer();
    return new Response(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "backend_unavailable",
          message_key: "errors.unavailable",
          message: "The backend service is unavailable.",
          details: [],
          request_id: "",
          retryable: true,
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
