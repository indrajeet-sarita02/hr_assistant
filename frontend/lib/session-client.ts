// Centralized client for the Next.js BFF session endpoints
// (/api/session/*). Frontend.md §7: components never use ad-hoc fetch — all
// HTTP logic lives in one client. These endpoints are same-origin
// (the BFF layer in app/api/session) and communicate with the backend with
// credentials managed server-side, so they run beside apiFetch rather than
// through /api/backend.

import type { ApiErrorEnvelope } from "./api-client";

import { ApiError } from "./api-client";

const SEARCH_TIMEOUT_MS = 15000;

async function sessionRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  let body: BodyInit | undefined;
  if (typeof init.body === "string") body = init.body;
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    return await fetch(path, {
      ...init,
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(504, {
        error: {
          code: "timeout",
          message_key: "errors.unavailable",
          message: "The request timed out.",
          details: [],
          request_id: "",
          retryable: true,
        },
      });
    }
    throw new ApiError(0, {
      error: {
        code: "network_error",
        message_key: "errors.network",
        message: "The server could not be reached.",
        details: [],
        request_id: "",
        retryable: true,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return;
  let envelope: ApiErrorEnvelope | null = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      envelope = null;
    }
  }
  throw new ApiError(response.status, envelope);
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<void> {
  const response = await sessionRequest("/api/session/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await ensureOk(response);
}

export async function registerRequest(payload: {
  email: string;
  password: string;
  full_name: string;
  locale: string;
}): Promise<void> {
  const response = await sessionRequest("/api/session/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await ensureOk(response);
}

export async function logoutRequest(): Promise<void> {
  const response = await sessionRequest("/api/session/logout", {
    method: "POST",
  });
  // The local cookie cleanup must not depend on the backend being reachable;
  // the BFF route already swallows backend errors and always clears cookies.
  await ensureOk(response);
}
