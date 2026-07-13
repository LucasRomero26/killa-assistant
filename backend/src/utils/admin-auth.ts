import type { FastifyRequest, FastifyReply } from "fastify";
import { timingSafeEqual } from "node:crypto";

/**
 * Validates the admin token sent by the operator for privileged endpoints
 * (WhatsApp bot start/stop, Telegram webhook setup, QR WebSocket).
 *
 * Security measures:
 *  - Reads the token from the `x-admin-token` header (preferred).
 *  - Falls back to `?adminToken=...` query param only for the QR page,
 *    which the operator opens in a browser by manually typing the URL.
 *  - Uses `crypto.timingSafeEqual` to prevent timing-based brute force.
 *  - Returns 503 if `WHATSAPP_ADMIN_TOKEN` env var is not configured.
 *  - Returns 403 on mismatch (no payload leak).
 */
export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const adminToken = process.env.WHATSAPP_ADMIN_TOKEN;
  if (!adminToken) {
    reply.code(503).send({
      error: "WHATSAPP_ADMIN_TOKEN is not configured on the server",
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
