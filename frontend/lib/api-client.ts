import { newRequestId } from "./idempotency";
import type { Translator } from "./i18n";

export interface ApiErrorDetail {
  field?: string;
  code?: string;
  message_key?: string;
  message?: string;
}

export interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message_key?: string;
    message?: string;
    details?: ApiErrorDetail[];
    request_id?: string;
    retryable?: boolean;
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  messageKey: string;
  details: ApiErrorDetail[];
  requestId: string;
  retryable: boolean;
  retryAfterSeconds: number | null;

  constructor(
    status: number,
    envelope: ApiErrorEnvelope | null,
    retryAfterSeconds: number | null = null,
  ) {
    const body = envelope?.error;
    super(body?.message || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code || "unexpected_error";
    this.messageKey = body?.message_key || "errors.unexpected";
    this.details = body?.details || [];
    this.requestId = body?.request_id || "";
    this.retryable = Boolean(body?.retryable);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit | null;
  idempotencyKey?: string;
  timeoutMs?: number;
  suppressUnauthorizedEvent?: boolean;
}

function currentLocale(): string {
  if (typeof document === "undefined") return "en";
  return document.documentElement.lang === "hi" ? "hi" : "en";
}

function parseRetryAfter(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = new Date(value).getTime();
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return null;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  let envelope: ApiErrorEnvelope | null = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      envelope = (await response.json()) as ApiErrorEnvelope;
    } catch {
      envelope = null;
    }
  }
  return new ApiError(response.status, envelope, parseRetryAfter(response));
}

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const {
    json,
    body,
    idempotencyKey,
    timeoutMs = 30000,
    suppressUnauthorizedEvent = false,
    headers: providedHeaders,
    ...init
  } = options;

  const headers = new Headers(providedHeaders);
  headers.set("Accept", "application/json");
  headers.set("Accept-Language", currentLocale());
  headers.set("X-Request-Id", newRequestId());
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  let requestBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(json);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  try {
    const response = await fetch(`/api/backend${normalizedPath}`, {
      ...init,
      method: init.method || (json !== undefined ? "POST" : "GET"),
      headers,
      body: requestBody,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      if (error.status === 401 && !suppressUnauthorizedEvent) {
        window.dispatchEvent(new CustomEvent("hr:unauthorized"));
      }
      throw error;
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return (await response.text()) as unknown as T;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(504, {
        error: {
          code: "timeout",
          message_key: "errors.unavailable",
          message: "The request timed out.",
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
        request_id: "",
        retryable: true,
      },
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function apiGet<T>(path: string, options: ApiOptions = {}): Promise<T> {
  return apiFetch<T>(path, { ...options, method: "GET" });
}

export function errorMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return t("errors.network");
      case 401:
        return t("errors.unauthorized");
      case 403:
        return t("errors.forbidden");
      case 404:
        return t("errors.not_found");
      case 409:
        if (error.code === "idempotency_conflict")
          return t("errors.idempotency_conflict");
        if (error.code === "stale_version")
          return t("errors.stale_version");
        if (error.code === "already_decided")
          return t("errors.already_decided");
        if (error.code === "invalid_state_transition")
          return t("errors.invalid_state_transition");
        if (error.code === "leave_overlap") return t("errors.leave_overlap");
        if (error.code === "conflict")
          return t("errors.conflict");
        return t("errors.conflict");
      case 422:
        if (error.code === "insufficient_balance")
          return t("errors.insufficient_balance");
        if (error.code === "business_rule_violation" && error.message.includes("Evidence"))
          return t("errors.onboarding_evidence");
        if (error.code === "business_rule_violation" && error.message.includes("required"))
          return t("errors.required_fields");
        return t("errors.validation");
      case 429:
        return t("errors.rate_limited");
      case 504:
        return t("errors.unavailable");
      default:
        if (error.status >= 500) return t("errors.unavailable");
        if (error.messageKey.startsWith("errors.")) {
          const label = t(error.messageKey);
          if (label !== error.messageKey) return label;
        }
        return t("errors.unexpected");
    }
  }
  return t("errors.unexpected");
}

export function fieldError(error: unknown, field: string): string | null {
  if (!(error instanceof ApiError)) return null;
  const detail = error.details.find((item) => item.field === field);
  if (!detail) return null;
  return detail.message || detail.message_key || "Invalid value";
}
