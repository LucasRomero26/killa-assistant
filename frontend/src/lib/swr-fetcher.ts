/**
 * SWR fetcher that routes client-side requests through the /api/proxy
 * server route. The proxy authenticates the user via the Supabase session
 * cookie and forwards the request with a `Bearer <JWT>` header.
 *
 * Callers pass a backend path like `/api/whatsapp/status` (NOT a full URL).
 * Optional query params are appended to the proxied URL.
 */
export async function proxyFetcher<T>(
  arg: string | readonly [string, Record<string, string>?]
): Promise<T> {
  const backendPath = typeof arg === "string" ? arg : arg[0];
  const query = typeof arg === "string" ? undefined : arg[1];

  let url = `/api/proxy?path=${encodeURIComponent(backendPath)}`;
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}
