import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { telegramWebhookRoutes } from "./routes/telegram.js";
import { telegramAdminRoutes } from "./routes/telegram-admin.js";
import { authRoutes } from "./routes/auth.js";
import { apiConfigRoutes } from "./routes/api-config.js";
import { whatsappAdminRoutes, whatsappWebSocketRoutes } from "./routes/whatsapp.js";
import { initWhatsAppMessageHandler } from "./services/whatsapp-handler.js";
import { startWhatsAppBot } from "./services/whatsapp.js";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
  trustProxy: env.NODE_ENV === "production" ? 1 : 0,
});

async function bootstrap() {
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: env.NODE_ENV === "production"
      ? [env.BACKEND_URL, ...(env.FRONTEND_URL ? [env.FRONTEND_URL] : [])]
      : true,
    credentials: true,
  });
  await app.register(websocket);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    cache: 10000,
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
    },
  });

  await app.register(healthRoutes, { prefix: "/" });
  await app.register(telegramWebhookRoutes);
  await app.register(telegramAdminRoutes, { prefix: "/api/telegram" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(apiConfigRoutes, { prefix: "/api/api-config" });
  await app.register(whatsappAdminRoutes, { prefix: "/api/whatsapp" });
  await app.register(whatsappWebSocketRoutes);

  initWhatsAppMessageHandler();

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    return reply.code(500).send({
      error: "Internal Server Error",
      message: env.NODE_ENV === "production" ? "Something went wrong" : (error as Error).message,
    });
  });

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`KillaAssistant backend running on port ${env.PORT}`);

    if (env.WHATSAPP_AUTOSTART === "true") {
      app.log.info("Auto-starting WhatsApp bot session...");
      startWhatsAppBot().catch((err) => {
        app.log.error({ err }, "Failed to auto-start WhatsApp bot");
      });
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Prevent process crash on unhandled promise rejections (e.g. OpenWA
// attempting to rmdir session directories on logout throws ENOTEMPTY
// as an unhandled rejection that would otherwise kill the process).
process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "Unhandled promise rejection (non-fatal)");
});

process.on("uncaughtException", (err) => {
  app.log.error({ err }, "Uncaught exception (non-fatal)");
});

bootstrap();
