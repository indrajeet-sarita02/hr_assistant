import type { Page } from "./types";

const baseUrl = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

export async function serverGet<T>(path: string): Promise<T | null> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Backend request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function serverGetPage<T>(path: string): Promise<Page<T>> {
  const page = await serverGet<Page<T>>(path);
  if (page === null) {
    throw new Error("Paginated backend endpoint returned 404.");
  }
  return page;
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
