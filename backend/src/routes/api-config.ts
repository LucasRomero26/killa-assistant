import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { supabaseAdmin } from "../config/supabase.js";
import { encrypt } from "../utils/crypto.js";
import { logActivity } from "../utils/activity-log.js";
import { extractUserIdOptional } from "../utils/auth-middleware.js";

const VALID_PROVIDERS = ["nvidia_nim", "groq"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(value: string): value is Provider {
  return (VALID_PROVIDERS as readonly string[]).includes(value);
}

export async function apiConfigRoutes(app: FastifyInstance) {
  app.get("/config", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const { data, error } = await supabaseAdmin
      .from("configuraciones_api")
      .select("provider, api_key_encrypted, model, is_enabled, last_tested_at, last_test_status")
      .eq("user_id", userId);

    if (error) {
      return reply.code(500).send({ error: error.message });
    }

    const sanitized = (data ?? []).map((row: Record<string, unknown>) => ({
      provider: row.provider,
      has_key: Boolean(row.api_key_encrypted),
      model: row.model,
      is_enabled: row.is_enabled,
      last_tested_at: row.last_tested_at,
      last_test_status: row.last_test_status,
    }));

    return reply.code(200).send(sanitized);
  });

  app.post("/config", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const body = request.body as {
      provider?: string;
      api_key?: string;
      model?: string;
      is_enabled?: boolean;
    };

    if (!body.provider || !isValidProvider(body.provider)) {
      return reply.code(400).send({ error: "Invalid provider" });
    }

    const apiKey = (body.api_key ?? "").trim();
    if (!apiKey) {
      return reply.code(400).send({ error: "Missing api_key" });
    }

    const encryptedKey = encrypt(apiKey);

    const { error } = await supabaseAdmin
      .from("configuraciones_api")
      .upsert({
        user_id: userId,
        provider: body.provider,
        api_key_encrypted: encryptedKey,
        model: body.model ?? null,
        is_enabled: body.is_enabled ?? true,
      });

    if (error) {
      return reply.code(500).send({ error: error.message });
    }

    await logActivity({
      userId,
      source: "system",
      level: "success",
      message: `API key updated for provider: ${body.provider}`,
    });

    return reply.code(200).send({ ok: true, message: "API key saved (encrypted)" });
  });

  app.delete("/config", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const provider = (request.query as { provider?: string })?.provider ??
      (request.body as { provider?: string })?.provider;
    if (!provider || !isValidProvider(provider)) {
      return reply.code(400).send({ error: "Invalid provider" });
    }

    const { error } = await supabaseAdmin
      .from("configuraciones_api")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);

    if (error) {
      return reply.code(500).send({ error: error.message });
    }

    await logActivity({
      userId,
      source: "system",
      level: "success",
      message: `API key deleted for provider: ${provider}`,
    });

    return reply.code(200).send({ ok: true, message: "API key deleted" });
  });

  app.put("/config/toggle", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const body = request.body as {
      provider?: string;
      is_enabled?: boolean;
      model?: string;
    };

    if (!body.provider || !isValidProvider(body.provider)) {
      return reply.code(400).send({ error: "Invalid provider" });
    }

    const updates: Record<string, unknown> = {};
    if (body.is_enabled !== undefined) updates.is_enabled = body.is_enabled;
    if (body.model !== undefined) updates.model = body.model;

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: "No fields to update" });
    }

    const { error } = await supabaseAdmin
      .from("configuraciones_api")
      .update(updates)
      .eq("user_id", userId)
      .eq("provider", body.provider);

    if (error) {
      return reply.code(500).send({ error: error.message });
    }

    return reply.code(200).send({ ok: true });
  });
}
