import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { setWebhook, deleteWebhook, getWebhookInfo } from "../services/telegram.js";
import { createLinkToken, getTelegramLinkStatus, unlinkTelegram } from "../services/telegram-link.js";
import { logActivity } from "../utils/activity-log.js";
import { extractUserIdFromRequest } from "../utils/auth-middleware.js";
import { requireAdmin } from "../utils/admin-auth.js";

export async function telegramAdminRoutes(app: FastifyInstance) {
  app.post("/setup-webhook", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;

    if (!env.TELEGRAM_WEBHOOK_URL) {
      return reply.code(400).send({ error: "TELEGRAM_WEBHOOK_URL is not configured" });
    }

    try {
      await setWebhook(env.TELEGRAM_WEBHOOK_URL, env.TELEGRAM_WEBHOOK_SECRET);
      return reply.code(200).send({
        ok: true,
        webhookUrl: env.TELEGRAM_WEBHOOK_URL,
      });
    } catch (error) {
      app.log.error({ err: error }, "Failed to set Telegram webhook");
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.delete("/webhook", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;

    try {
      await deleteWebhook();
      return reply.code(200).send({ ok: true, message: "Webhook deleted" });
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.get("/webhook-info", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;

    try {
      const info = await getWebhookInfo();
      return reply.code(200).send(info);
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.post("/link-token", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdFromRequest(request, reply);
    if (!userId) return;

    try {
      const result = await createLinkToken(userId);
      return reply.code(200).send(result);
    } catch (error) {
      app.log.error({ err: error }, "Failed to create Telegram link token");
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.get("/link-status", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdFromRequest(request, reply);
    if (!userId) return;

    try {
      const status = await getTelegramLinkStatus(userId);
      return reply.code(200).send(status);
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.delete("/unlink", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdFromRequest(request, reply);
    if (!userId) return;

    try {
      await unlinkTelegram(userId);
      await logActivity({
        userId,
        source: "telegram",
        level: "success",
        message: "Telegram account unlinked",
      });
      return reply.code(200).send({ ok: true, message: "Telegram unlinked" });
    } catch (error) {
      app.log.error({ err: error }, "Failed to unlink Telegram");
      return reply.code(500).send({ error: (error as Error).message });
    }
  });
}
