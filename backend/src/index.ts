import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { telegramWebhookRoutes } from "./routes/telegram.js";
import { telegramAdminRoutes } from "./routes/telegram-admin.js";
import { authRoutes } from "./routes/auth.js";
import { apiConfigRoutes } from "./routes/api-config.js";

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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "Unhandled promise rejection (non-fatal)");
});

process.on("uncaughtException", (err) => {
  app.log.error({ err }, "Uncaught exception (non-fatal)");
});

// Graceful shutdown so in-flight requests finish before Docker kills the
// container on `docker compose stop/restart` (SIGTERM).
let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Graceful shutdown initiated");
  try {
    await app.close();
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

bootstrap();
