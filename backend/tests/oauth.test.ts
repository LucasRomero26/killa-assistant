import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

vi.mock("../src/services/google-auth.js", () => ({
  getAuthUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  storeGoogleCredentials: vi.fn(),
  getGoogleConnectionStatus: vi.fn(),
  disconnectGoogle: vi.fn(),
}));

vi.mock("../src/services/user-vip.js", () => ({
  isUserVip: vi.fn().mockResolvedValue(false),
}));

vi.mock("../src/utils/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/utils/oauth-state.js", () => ({
  signState: vi.fn((userId: string) => `state-for-${userId}`),
  verifyState: vi.fn(),
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    OAUTH_SUCCESS_REDIRECT_URL: undefined,
  },
}));

vi.mock("../src/config/supabase.js", () => {
  const mockGetUser = vi.fn().mockResolvedValue({
    data: { user: { id: "user-42" } },
    error: null,
  });
  return {
    supabaseAnon: { auth: { getUser: mockGetUser } },
    supabaseAdmin: {},
  };
});

import { authRoutes } from "../src/routes/auth.js";
import { getAuthUrl, exchangeCodeForTokens, storeGoogleCredentials } from "../src/services/google-auth.js";
import { isUserVip } from "../src/services/user-vip.js";
import { verifyState } from "../src/utils/oauth-state.js";
import { logActivity } from "../src/utils/activity-log.js";

async function buildApp() {
  const app = Fastify();
  await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  return app;
}

describe("Google OAuth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthUrl).mockReturnValue("https://accounts.google.com/o/oauth2/auth?state=xyz");
  });

  describe("GET /api/auth/google", () => {
    it("should redirect to Google consent URL with signed state (JWT auth)", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/google",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("accounts.google.com");
      expect(getAuthUrl).toHaveBeenCalledTimes(1);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", false);
      await app.close();
    });

    it("should pass vip=true to getAuthUrl when user is VIP", async () => {
      vi.mocked(isUserVip).mockResolvedValue(true);
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/google",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", true);
      await app.close();
    });

    it("should reject when no Authorization header is present", async () => {
      const app = await buildApp();

      const res = await app.inject({ method: "GET", url: "/api/auth/google" });

      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("GET /api/auth/callback/google", () => {
    it("should exchange code, store credentials and log success", async () => {
      vi.mocked(verifyState).mockReturnValue("user-42");
      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        access_token: "ya29.token",
        refresh_token: "1//refresh",
        token_type: "Bearer",
        expiry_date: Date.now() + 3600_000,
      });
      vi.mocked(storeGoogleCredentials).mockResolvedValue(undefined);

      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/callback/google?code=valid-code&state=signed-state",
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
      expect(exchangeCodeForTokens).toHaveBeenCalledWith("valid-code");
      expect(storeGoogleCredentials).toHaveBeenCalledWith("user-42", expect.objectContaining({
        access_token: "ya29.token",
        refresh_token: "1//refresh",
      }));
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-42",
        level: "success",
      }));
      await app.close();
    });

    it("should reject invalid or expired state (CSRF protection)", async () => {
      vi.mocked(verifyState).mockReturnValue(null);

      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/callback/google?code=valid-code&state=tampered-state",
      });

      expect(res.statusCode).toBe(403);
      expect(exchangeCodeForTokens).not.toHaveBeenCalled();
      expect(storeGoogleCredentials).not.toHaveBeenCalled();
      await app.close();
    });

    it("should handle user-denied consent", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/callback/google?error=access_denied",
      });

      expect(res.statusCode).toBe(403);
      expect(exchangeCodeForTokens).not.toHaveBeenCalled();
      await app.close();
    });

    it("should return 400 when code or state is missing", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/callback/google?code=only-code",
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("should return 500 and log error when token exchange fails", async () => {
      vi.mocked(verifyState).mockReturnValue("user-42");
      vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("Google token endpoint down"));

      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/callback/google?code=bad-code&state=signed-state",
      });

      expect(res.statusCode).toBe(500);
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-42",
        level: "error",
      }));
      await app.close();
    });
  });
});
