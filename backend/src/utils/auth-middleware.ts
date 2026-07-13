import type { FastifyRequest, FastifyReply } from "fastify";
import { supabaseAnon } from "../config/supabase.js";

export async function extractUserIdFromRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  _options?: { requireAuth?: boolean }
): Promise<string | null> {
  const authHeader = request.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Authentication required (Bearer token)" });
    return null;
  }

  const jwt = authHeader.slice("Bearer ".length).trim();
  const { data, error } = await supabaseAnon.auth.getUser(jwt);
  if (error || !data.user) {
    reply.code(401).send({ error: "Invalid or expired token" });
    return null;
  }

  return data.user.id;
}

export async function extractUserIdOptional(
  request: FastifyRequest
): Promise<string | null> {
  const authHeader = request.headers["authorization"] as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const jwt = authHeader.slice("Bearer ".length).trim();
  const { data, error } = await supabaseAnon.auth.getUser(jwt);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}
