import { timingSafeEqual } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { env } from "../config/env";

/**
 * Resolve the signed-in user from the Supabase session cookie.
 *
 * `getUser()` validates the JWT against Supabase Auth (one round-trip), which
 * is what the old backend did with the Bearer token. Route handlers that
 * mutate user data go through this; page reads use the cheaper getSession().
 */
export async function getSessionUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Operator-only check for privileged endpoints (Telegram webhook setup).
 * Token comes from the `x-admin-token` header or `?adminToken=` query param.
 * Returns an error Response to send back, or null when the caller is allowed.
 */
export function requireAdmin(request: Request): Response | null {
  const adminToken = env.ADMIN_TOKEN;
  if (!adminToken) {
    return Response.json({ error: "ADMIN_TOKEN is not configured on the server" }, { status: 503 });
  }

  const provided =
    request.headers.get("x-admin-token") ??
    new URL(request.url).searchParams.get("adminToken");

  if (!provided || !safeEqualString(provided, adminToken)) {
    return Response.json({ error: "Forbidden: invalid admin token" }, { status: 403 });
  }
  return null;
}

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
