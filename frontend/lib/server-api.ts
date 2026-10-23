import type { Page } from "./types";

const baseUrl = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

export async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function serverGetPage<T>(
  path: string,
  fallbackLimit = 20,
): Promise<Page<T>> {
  const page = await serverGet<Page<T>>(path);
  return page ?? { items: [], total: 0, limit: fallbackLimit, offset: 0 };
}

export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
