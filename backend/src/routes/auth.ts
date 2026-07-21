import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  storeGoogleCredentials,
  disconnectGoogle,
  getGoogleConnectionStatus,
  getUserGrantedScopes,
} from "../services/google-auth.js";
import { signState, verifyState } from "../utils/oauth-state.js";
import { logActivity } from "../utils/activity-log.js";
import { extractUserIdOptional } from "../utils/auth-middleware.js";
import { isUserVip } from "../services/user-vip.js";

const VIP_SCOPE_SET = new Set([
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
]);

function hasAllVipScopes(granted: string[]): boolean {
  if (granted.length === 0) return false;
  return [...VIP_SCOPE_SET].every((s) => granted.includes(s));
}

export async function authRoutes(app: FastifyInstance) {
  // GET /api/auth/google — Starts the Google OAuth flow.
  // userId comes from the JWT (Bearer token), NOT from the query string.
  // VIP users are granted restricted scopes (calendar + drive); everyone else
  // gets light scopes (calendar.events + drive.file) which don't trigger the
  // Google unverified-app screen.
  //
  // We force `prompt: "consent"` ONLY when:
  //   - the user has NO Google credentials yet (first connection), OR
  //   - the user is VIP but their current granted scopes are missing one of
  //     the restricted scopes (scope upgrade path).
  // Otherwise we use `select_account` to avoid nulling out the refresh token
  // (Google only returns a new refresh_token on the first consent).
  app.get("/google", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdOptional(request);

    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const vip = await isUserVip(userId);
    const status = await getGoogleConnectionStatus(userId);
    const grantedScopes = await getUserGrantedScopes(userId);

    // First connection: no credentials yet → force consent to get a refresh_token.
    // VIP scope upgrade: user is VIP but their existing scopes don't include
    // the restricted calendar/drive scopes → force consent to re-prompt.
    let forceConsent = false;
    if (!status.connected || !status.has_refresh_token) {
      forceConsent = true;
    } else if (vip && !hasAllVipScopes(grantedScopes)) {
      forceConsent = true;
    }

    const state = signState(userId);
    const url = getAuthUrl(state, vip, forceConsent);

    request.log.info({ userId, vip, forceConsent }, "Starting Google OAuth flow");
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
      const status = await getGoogleConnectionStatus(userId);

      if (!tokens.refresh_token) {
        // This is expected when:
        //  - the user had previously consented to offline access and we used
        //    `prompt: "select_account"` (no re-consent → no new refresh_token),
        //  - OR the user revoked access at myaccount.google.com/permissions
        //    then re-authorized but Google treats it as a re-grant with no
        //    refresh_token (rare). In this second case the previously stored
        //    refresh_token is also invalid and the user will need to disconnect
        //    fully and re-connect with `prompt: "consent"`.
        request.log.warn({ userId, hadRefreshBefore: status.has_refresh_token },
          "Google OAuth: no refresh_token returned — preserving any previously stored token");
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
