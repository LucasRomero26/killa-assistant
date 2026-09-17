import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/services/google-auth", () => ({
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

vi.mock("@/server/services/user-vip", () => ({
  isUserVip: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/server/utils/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/utils/oauth-state", () => ({
  signState: vi.fn((userId: string) => `state-for-${userId}`),
  verifyState: vi.fn(),
}));

vi.mock("@/server/config/env", () => ({
  env: {
    OAUTH_SUCCESS_REDIRECT_URL: "http://localhost:3000/connections",
  },
}));

import { startGoogleOAuth, handleGoogleOAuthCallback } from "@/server/handlers/google-oauth";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  storeGoogleCredentials,
  getGoogleConnectionStatus,
  getUserGrantedScopes,
} from "@/server/services/google-auth";
import { isUserVip } from "@/server/services/user-vip";
import { verifyState } from "@/server/utils/oauth-state";
import { logActivity } from "@/server/utils/activity-log";

function callback(query: string) {
  return handleGoogleOAuthCallback(
    new Request(`http://localhost/api/auth/callback/google${query}`)
  );
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
      const res = await startGoogleOAuth("user-42");

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("accounts.google.com");
      expect(getAuthUrl).toHaveBeenCalledTimes(1);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", false, true);
    });

    it("should pass vip=true and forceConsent=true to getAuthUrl when user is VIP and not yet connected", async () => {
      vi.mocked(isUserVip).mockResolvedValue(true);
      const res = await startGoogleOAuth("user-42");

      expect(res.status).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", true, true);
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
      const res = await startGoogleOAuth("user-42");

      expect(res.status).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", false, false);
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
      const res = await startGoogleOAuth("user-42");

      expect(res.status).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", true, true);
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
      const res = await startGoogleOAuth("user-42");

      expect(res.status).toBe(302);
      expect(getAuthUrl).toHaveBeenCalledWith("state-for-user-42", true, false);
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

      const res = await callback("?code=valid-code&state=signed-state");

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:3000/connections");
      expect(exchangeCodeForTokens).toHaveBeenCalledWith("valid-code");
      expect(storeGoogleCredentials).toHaveBeenCalledWith("user-42", expect.objectContaining({
        access_token: "ya29.token",
        refresh_token: "1//refresh",
      }));
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-42",
        level: "success",
      }));
    });

    it("should reject invalid or expired state (CSRF protection)", async () => {
      vi.mocked(verifyState).mockReturnValue(null);

      const res = await callback("?code=valid-code&state=tampered-state");

      expect(res.status).toBe(403);
      expect(exchangeCodeForTokens).not.toHaveBeenCalled();
      expect(storeGoogleCredentials).not.toHaveBeenCalled();
    });

    it("should handle user-denied consent", async () => {
      const res = await callback("?error=access_denied");

      expect(res.status).toBe(403);
      expect(exchangeCodeForTokens).not.toHaveBeenCalled();
    });

    it("should return 400 when code or state is missing", async () => {
      const res = await callback("?code=only-code");

      expect(res.status).toBe(400);
    });

    it("should return 500 and log error when token exchange fails", async () => {
      vi.mocked(verifyState).mockReturnValue("user-42");
      vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("Google token endpoint down"));

      const res = await callback("?code=bad-code&state=signed-state");

      expect(res.status).toBe(500);
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-42",
        level: "error",
      }));
    });
  });
});
