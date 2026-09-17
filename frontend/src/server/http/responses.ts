export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function unauthorized(): Response {
  return json({ error: "Authentication required" }, 401);
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function serverError(message: string): Response {
  return json({ error: message }, 500);
}

/** Parse a JSON body, returning null when it is missing or malformed. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
