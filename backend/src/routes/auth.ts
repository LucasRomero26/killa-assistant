import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { getAuthUrl, exchangeCodeForTokens, storeGoogleCredentials, disconnectGoogle } from "../services/google-auth.js";
import { signState, verifyState } from "../utils/oauth-state.js";
import { logActivity } from "../utils/activity-log.js";
import { extractUserIdOptional } from "../utils/auth-middleware.js";
import { isUserVip } from "../services/user-vip.js";

export async function authRoutes(app: FastifyInstance) {
  // GET /api/auth/google — Starts the Google OAuth flow.
  // userId comes from the JWT (Bearer token), NOT from the query string.
  // VIP users are granted restricted scopes (calendar + drive); everyone else
  // gets light scopes (calendar.events + drive.file) which don't trigger the
  // Google unverified-app screen.
  app.get("/google", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const vip = await isUserVip(userId);
    const state = signState(userId);
    const url = getAuthUrl(state, vip);

    request.log.info({ userId, vip }, "Starting Google OAuth flow");
    return reply.code(302).redirect(url);
  });

  app.get("/callback/google", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (query.error) {
      request.log.warn({ error: query.error }, "Google OAuth user denied consent");
      return reply.code(403).send({ error: "Consent denied", detail: query.error });
    }

    if (!query.code || !query.state) {
      return reply.code(400).send({ error: "Missing code or state" });
    }

    const userId = verifyState(query.state);
    if (!userId) {
      request.log.warn("Google OAuth callback: invalid or expired state");
      return reply.code(403).send({ error: "Invalid or expired state" });
    }

    try {
      const tokens = await exchangeCodeForTokens(query.code);

      if (!tokens.refresh_token) {
        request.log.warn({ userId }, "Google OAuth: no refresh_token returned (user previously consented)");
      }

      await storeGoogleCredentials(userId, tokens);
      await logActivity({
        userId,
        source: "system",
        level: "success",
        message: "Google account linked successfully (Calendar + Drive)",
      });

      request.log.info({ userId }, "Google OAuth completed successfully");

      const redirectSuccess = env.OAUTH_SUCCESS_REDIRECT_URL;
      if (redirectSuccess) {
        return reply.code(302).redirect(redirectSuccess);
      }
      return reply.code(200).send({ ok: true, message: "Google account linked" });
    } catch (error) {
      request.log.error({ err: error, userId }, "Google OAuth token exchange failed");
      await logActivity({
        userId,
        source: "system",
        level: "error",
        message: "Failed to link Google account",
        detail: (error as Error).message,
      });
      return reply.code(500).send({ error: "Failed to link Google account" });
    }
  });

  app.get("/google/status", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const { getGoogleConnectionStatus } = await import("../services/google-auth.js");
    const status = await getGoogleConnectionStatus(userId);
    return reply.code(200).send(status);
  });

  app.delete("/google/disconnect", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    try {
      await disconnectGoogle(userId);
      await logActivity({
        userId,
        source: "system",
        level: "success",
        message: "Google account disconnected (Calendar + Drive)",
      });
      return reply.code(200).send({ ok: true, message: "Google account disconnected" });
    } catch (error) {
      request.log.error({ err: error, userId }, "Failed to disconnect Google account");
      return reply.code(500).send({ error: "Failed to disconnect Google account" });
    }
  });
}
