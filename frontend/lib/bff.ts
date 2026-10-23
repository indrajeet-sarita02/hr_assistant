import { cookies } from "next/headers";

const backendUrl = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

export const ACCESS_COOKIE = "hr_access";
export const REFRESH_COOKIE = "hr_refresh";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface TokenResponse extends TokenPair {
  token_type: string;
  user: unknown;
  active_tenant: unknown;
}

const secureCookie = process.env.NODE_ENV === "production";

function accessCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(60, maxAge),
  };
}

function refreshCookieOptions(maxAge = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setSessionCookies(tokens: TokenPair): void {
  const store = cookies();
  store.set(ACCESS_COOKIE, tokens.access_token, accessCookieOptions(tokens.expires_in));
  store.set(REFRESH_COOKIE, tokens.refresh_token, refreshCookieOptions());
}

export function clearSessionCookies(): void {
  const store = cookies();
  store.set(ACCESS_COOKIE, "", { ...accessCookieOptions(0), maxAge: 0 });
  store.set(REFRESH_COOKIE, "", { ...refreshCookieOptions(0), maxAge: 0 });
}

export async function backendRequest(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const url = `${backendUrl}/api/v1${path}`;
  const send = () =>
    fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });

  try {
    return await send();
  } catch (caught) {
    // Node's keep-alive pool can race the API server's idle timeout. A safe
    // request is retried once on a fresh connection before surfacing 503.
    const method = (init.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") throw caught;
    await new Promise((resolve) => setTimeout(resolve, 75));
    return send();
  }
}

let refreshInFlight: Promise<TokenResponse | null> | null = null;

async function refreshTokens(): Promise<TokenResponse | null> {
  const refreshToken = cookies().get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;

  const response = await backendRequest("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    clearSessionCookies();
    return null;
  }

  const tokens = (await response.json()) as TokenResponse;
  setSessionCookies(tokens);
  return tokens;
}

export async function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function establishSession(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const response = await backendRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return response;

  const tokens = (await response.json()) as TokenResponse;
  setSessionCookies(tokens);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function loginWithPassword(
  email: string,
  password: string,
): Promise<Response> {
  return establishSession("/auth/login", { email, password });
}

export function registerWithPassword(payload: {
  email: string;
  password: string;
  full_name: string;
  locale: string;
}): Promise<Response> {
  return establishSession("/auth/register", payload);
}

export function copyResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const name of ["content-type", "retry-after", "x-request-id"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "no-store");
  return headers;
}
