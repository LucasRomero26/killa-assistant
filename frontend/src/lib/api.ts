/**
 * Client-side helper for calling this app's own API route handlers.
 * The Supabase session cookie travels automatically (same origin), and each
 * handler validates it server-side, so no token is ever exposed to JS.
 */
export async function apiFetch(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
  }
): Promise<Response> {
  if (!path.startsWith("/api/")) {
    throw new Error("apiFetch: path must start with /api/");
  }

  const url = new URL(path, window.location.origin);
  if (options?.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }

  const hasBody = options?.body !== undefined;
  return fetch(url.toString(), {
    method: options?.method ?? "GET",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
}
