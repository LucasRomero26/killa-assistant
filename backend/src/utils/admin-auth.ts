import type { FastifyRequest, FastifyReply } from "fastify";
import { timingSafeEqual } from "node:crypto";

/**
 * Validates the admin token sent by the operator for privileged endpoints
 * (Telegram webhook setup/teardown).
 *
 * Security measures:
 *  - Reads the token from the `x-admin-token` header (preferred), with a
 *    `?adminToken=...` query fallback for URLs typed manually in a browser.
 *  - Uses `crypto.timingSafeEqual` to prevent timing-based brute force.
 *  - Returns 503 if no admin token is configured on the server.
 *  - Returns 403 on mismatch (no payload leak).
 */
export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const adminToken = process.env.ADMIN_TOKEN ?? process.env.WHATSAPP_ADMIN_TOKEN;
  if (!adminToken) {
    reply.code(503).send({
      error: "ADMIN_TOKEN is not configured on the server",
    });
    return false;
  }

  const provided =
    (request.headers["x-admin-token"] as string | undefined) ??
    (request.query as { adminToken?: string } | undefined)?.adminToken;

  if (!provided || !safeEqualString(provided, adminToken)) {
    reply.code(403).send({ error: "Forbidden: invalid admin token" });
    return false;
  }
  return true;
}

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
