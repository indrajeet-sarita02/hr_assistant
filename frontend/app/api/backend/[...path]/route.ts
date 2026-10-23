import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  backendRequest,
  clearSessionCookies,
  copyResponseHeaders,
  refreshSession,
  setSessionCookies,
} from "@/lib/bff";

export const dynamic = "force-dynamic";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message_key: "errors.unexpected",
        message,
        details: [],
        request_id: "",
        retryable: status >= 500,
      },
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function sameOrigin(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

async function proxy(request: NextRequest, path: string[], accessToken?: string) {
  const target = `/api/backend/${path.map(encodeURIComponent).join("/")}`;
  void target;

  const headers = new Headers();
  for (const name of [
    "content-type",
    "accept-language",
    "idempotency-key",
    "x-request-id",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (!SAFE_METHODS.has(request.method)) {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  const backendPath = `/${path.join("/")}${request.nextUrl.search}`;
  return backendRequest(backendPath, init, accessToken);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handle(request, params.path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handle(request, params.path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handle(request, params.path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handle(request, params.path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return handle(request, params.path);
}

async function handle(request: NextRequest, path: string[]) {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden", "Cross-origin request blocked.");
  }

  try {
    let accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    if (!accessToken) {
      const refreshed = await refreshSession();
      accessToken = refreshed?.access_token;
    }

    let response = await proxy(request, path, accessToken);

    if (response.status === 401 && request.cookies.get("hr_refresh")?.value) {
      const refreshed = await refreshSession();
      if (refreshed) {
        setSessionCookies(refreshed);
        response = await proxy(request, path, refreshed.access_token);
      }
    }

    if (response.status === 401) clearSessionCookies();

    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        headers: copyResponseHeaders(response),
      });
    }

    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: copyResponseHeaders(response),
    });
  } catch (caught) {
    console.error("BFF backend proxy failed", {
      path: path.join("/"),
      method: request.method,
      error: caught instanceof Error ? caught.message : String(caught),
      stack: caught instanceof Error ? caught.stack : undefined,
    });
    return jsonError(503, "backend_unavailable", "The backend service is unavailable.");
  }
}
