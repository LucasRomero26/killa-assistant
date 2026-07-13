const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export function getBackendUrl(): string {
  if (!BACKEND_URL) {
    throw new Error("BACKEND_URL is not configured");
  }
  return BACKEND_URL;
}

/**
 * Client-side helper that proxies requests through /api/proxy?path=...
 * The proxy authenticates the user with the Supabase session cookie
 * and forwards the request with an `Authorization: Bearer <JWT>` header.
 *
 * Use this from Client Components ("use client") so that the JWT
 * is never exposed to the browser.
 */
export async function proxyFetch(
  backendPath: string,
  options?: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
  }
): Promise<Response> {
  if (!backendPath.startsWith("/api/")) {
    throw new Error("proxyFetch: path must start with /api/");
  }

  const url = new URL("/api/proxy", window.location.origin);
  url.searchParams.set("path", backendPath);

  if (options?.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }

  return fetch(url.toString(), {
    method: options?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Server-side fetch to the backend with a JWT.
 * Used only by the proxy route handler (route.ts) and server components.
 */
export async function backendFetch(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    accessToken?: string;
  }
): Promise<Response> {
  const url = `${getBackendUrl()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers ?? {}),
  };

  if (!headers["Authorization"] && options?.accessToken) {
    headers["Authorization"] = `Bearer ${options.accessToken}`;
  }

  return fetch(url, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
}
