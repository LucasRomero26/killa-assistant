import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

vi.mock("../src/services/google-auth.js", () => ({
  getAuthUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  storeGoogleCredentials: vi.fn(),
  getGoogleConnectionStatus: vi.fn().mockResolvedValue({
    connected: false,
    calendar_connected: false,
    drive_connected: false,
    has_refresh_token: false,
    expiry_date: null,
  }),
  getUserGrantedScopes: vi.fn().mockResolvedValue([]),
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
import {
  getAuthUrl,
  exchangeCodeForTokens,
  storeGoogleCredentials,
  getGoogleConnectionStatus,
  getUserGrantedScopes,
} from "../src/services/google-auth.js";
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
    // Defaults: non-VIP, not connected, no refresh_token, no granted scopes.
    // Individual tests override these as needed.
    vi.mocked(isUserVip).mockResolvedValue(false);
    vi.mocked(getGoogleConnectionStatus).mockResolvedValue({
      connected: false,
      calendar_connected: false,
      drive_connected: false,
      has_refresh_token: false,
      expiry_date: null,
    });
    vi.mocked(getUserGrantedScopes).mockResolvedValue([]);
  });

  describe("GET /api/auth/google", () => {
    it("should redirect to Google consent URL with signed state (JWT auth)", async () => {
      // Not connected yet → forceConsent=true
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/google",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("accounts.google.com");
      expect(getAuthUrl).toHaveBeenCalledTimes(1);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", false, true);
      await app.close();
    });

    it("should pass vip=true and forceConsent=true to getAuthUrl when user is VIP and not yet connected", async () => {
      vi.mocked(isUserVip).mockResolvedValue(true);
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/google",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", true, true);
      await app.close();
    });

    it("should use forceConsent=false when already connected with refresh_token and scopes are sufficient", async () => {
      // Non-VIP user, already connected, with refresh_token → no need to
      // force consent (preserves the existing refresh_token).
      vi.mocked(getGoogleConnectionStatus).mockResolvedValue({
        connected: true,
        calendar_connected: true,
        drive_connected: true,
        has_refresh_token: true,
        expiry_date: new Date(Date.now() + 3600_000).toISOString(),
      });
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/google",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", false, false);
      await app.close();
    });

    it("should forceConsent=true for VIP user whose scopes are missing restricted scopes", async () => {
      // VIP user but granted scopes only include light scopes → must force
      // consent to upgrade to restricted scopes.
      vi.mocked(isUserVip).mockResolvedValue(true);
      vi.mocked(getGoogleConnectionStatus).mockResolvedValue({
        connected: true,
        calendar_connected: true,
        drive_connected: true,
        has_refresh_token: true,
        expiry_date: new Date(Date.now() + 3600_000).toISOString(),
      });
      vi.mocked(getUserGrantedScopes).mockResolvedValue([
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.file",
      ]);
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/google",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", true, true);
      await app.close();
    });

    it("should use forceConsent=false for VIP user whose scopes already include restricted scopes", async () => {
      // VIP user already has full VIP scopes → no need to re-prompt.
      vi.mocked(isUserVip).mockResolvedValue(true);
      vi.mocked(getGoogleConnectionStatus).mockResolvedValue({
        connected: true,
        calendar_connected: true,
        drive_connected: true,
        has_refresh_token: true,
        expiry_date: new Date(Date.now() + 3600_000).toISOString(),
      });
      vi.mocked(getUserGrantedScopes).mockResolvedValue([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive",
      ]);
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/google",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", true, false);
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
