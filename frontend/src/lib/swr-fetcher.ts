/**
 * SWR fetcher for this app's API route handlers. Callers pass a path like
 * `/api/telegram/link-status`; optional query params are appended.
 */
export async function apiFetcher<T>(
  arg: string | readonly [string, Record<string, string>?]
): Promise<T> {
  const path = typeof arg === "string" ? arg : arg[0];
  const query = typeof arg === "string" ? undefined : arg[1];

  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}
