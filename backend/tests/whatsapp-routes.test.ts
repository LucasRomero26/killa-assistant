import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

vi.mock("../src/services/whatsapp.js", () => ({
  startWhatsAppBot: vi.fn(),
  stopWhatsApp: vi.fn(),
  getWhatsAppConnectionStatus: vi.fn(),
  getLastWhatsAppQR: vi.fn(() => null),
  clearLastWhatsAppQR: vi.fn(),
  onWhatsAppQR: vi.fn(() => () => {}),
  onWhatsAppStatus: vi.fn(() => () => {}),
  WhatsAppError: class WhatsAppError extends Error {
    constructor(
      message: string,
      public readonly kind: string,
      public readonly statusCode?: number
    ) {
      super(message);
      this.name = "WhatsAppError";
    }
  },
}));

vi.mock("../src/services/whatsapp-link.js", () => ({
  createWhatsAppLinkToken: vi.fn(),
  getWhatsAppLinkStatus: vi.fn(),
  unlinkWhatsApp: vi.fn(),
}));

vi.mock("../src/utils/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
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

import { whatsappAdminRoutes } from "../src/routes/whatsapp.js";
import { startWhatsAppBot, stopWhatsApp, getWhatsAppConnectionStatus } from "../src/services/whatsapp.js";
import { createWhatsAppLinkToken, getWhatsAppLinkStatus, unlinkWhatsApp } from "../src/services/whatsapp-link.js";
import { logActivity } from "../src/utils/activity-log.js";

async function buildApp() {
  const app = Fastify();
  await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await app.register(whatsappAdminRoutes, { prefix: "/api/whatsapp" });
  return app;
}

describe("WhatsApp Admin Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_ADMIN_TOKEN = "admin-secret";
  });

  describe("GET /api/whatsapp/admin/qr-page", () => {
    it("should return the QR page HTML when admin token is valid", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/admin/qr-page?adminToken=admin-secret",
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain("KillaAssistant");
      expect(res.body).toContain("WebSocket");
      await app.close();
    });

    it("should reject when admin token is missing", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/admin/qr-page",
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("should reject when admin token is wrong", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/admin/qr-page?adminToken=wrong",
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("should return 503 when WHATSAPP_ADMIN_TOKEN is not configured", async () => {
      delete process.env.WHATSAPP_ADMIN_TOKEN;
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/admin/qr-page?adminToken=anything",
      });

      expect(res.statusCode).toBe(503);
      await app.close();
    });
  });

  describe("POST /api/whatsapp/admin/start", () => {
    it("should start the bot session when admin token is valid", async () => {
      vi.mocked(startWhatsAppBot).mockResolvedValue(undefined);
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/admin/start",
        headers: { "x-admin-token": "admin-secret" },
      });

      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.body).ok).toBe(true);
      expect(startWhatsAppBot).toHaveBeenCalled();
      await app.close();
    });

    it("should reject when admin token is missing", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/admin/start",
      });

      expect(res.statusCode).toBe(403);
      expect(startWhatsAppBot).not.toHaveBeenCalled();
      await app.close();
    });

    it("should reject when admin token is wrong", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/admin/start",
        headers: { "x-admin-token": "wrong" },
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("should return 500 when startWhatsAppBot fails", async () => {
      vi.mocked(startWhatsAppBot).mockRejectedValue(new Error("Chromium not available"));
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/admin/start",
        headers: { "x-admin-token": "admin-secret" },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).toContain("Chromium not available");
      await app.close();
    });
  });

  describe("POST /api/whatsapp/stop", () => {
    it("should stop the active session when admin token is valid", async () => {
      vi.mocked(stopWhatsApp).mockResolvedValue(undefined);
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/stop",
        headers: { "x-admin-token": "admin-secret" },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
      expect(stopWhatsApp).toHaveBeenCalled();
      await app.close();
    });

    it("should reject when admin token is missing", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/stop",
      });

      expect(res.statusCode).toBe(403);
      expect(stopWhatsApp).not.toHaveBeenCalled();
      await app.close();
    });

    it("should return 500 when stopWhatsApp fails", async () => {
      vi.mocked(stopWhatsApp).mockRejectedValue(new Error("Disconnect failed"));
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/stop",
        headers: { "x-admin-token": "admin-secret" },
      });

      expect(res.statusCode).toBe(500);
      await app.close();
    });
  });

  describe("GET /api/whatsapp/status", () => {
    it("should return current connection status", async () => {
      vi.mocked(getWhatsAppConnectionStatus).mockReturnValue({
        connected: true,
        status: "ready",
      });
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/status",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.connected).toBe(true);
      expect(body.status).toBe("ready");
      await app.close();
    });

    it("should return disconnected when no session is active", async () => {
      vi.mocked(getWhatsAppConnectionStatus).mockReturnValue({
        connected: false,
        status: "disconnected",
      });
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/status",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.connected).toBe(false);
      await app.close();
    });
  });

  describe("POST /api/whatsapp/link-token", () => {
    it("should generate a link token for the user", async () => {
      vi.mocked(createWhatsAppLinkToken).mockResolvedValue({
        token: "KILLA-ABCD12",
        botCommand: "/start KILLA-ABCD12",
      });
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/link-token",
        headers: { authorization: "Bearer test-jwt-token", "Content-Type": "application/json" },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBe("KILLA-ABCD12");
      expect(body.botCommand).toBe("/start KILLA-ABCD12");
      expect(createWhatsAppLinkToken).toHaveBeenCalledWith("user-42");
      await app.close();
    });

    it("should reject when userId is missing", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/link-token",
        payload: {},
      });

      expect(res.statusCode).toBe(401);
      expect(createWhatsAppLinkToken).not.toHaveBeenCalled();
      await app.close();
    });

    it("should return 500 when token creation fails", async () => {
      vi.mocked(createWhatsAppLinkToken).mockRejectedValue(new Error("DB down"));
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/whatsapp/link-token",
        headers: { authorization: "Bearer test-jwt-token", "Content-Type": "application/json" },
        payload: {},
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).toContain("DB down");
      await app.close();
    });
  });

  describe("GET /api/whatsapp/link-status", () => {
    it("should return linked status for a valid userId", async () => {
      vi.mocked(getWhatsAppLinkStatus).mockResolvedValue({
        linked: true,
        chatId: "555@c.us",
      });
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/link-status",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.linked).toBe(true);
      expect(getWhatsAppLinkStatus).toHaveBeenCalledWith("user-42");
      await app.close();
    });

    it("should reject when userId is missing", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "GET",
        url: "/api/whatsapp/link-status",
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("DELETE /api/whatsapp/unlink", () => {
    it("should unlink the user and log activity", async () => {
      vi.mocked(unlinkWhatsApp).mockResolvedValue(undefined);
      const app = await buildApp();

      const res = await app.inject({
        method: "DELETE",
        url: "/api/whatsapp/unlink",
        headers: { authorization: "Bearer test-jwt-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(unlinkWhatsApp).toHaveBeenCalledWith("user-42");
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-42",
          source: "whatsapp",
          level: "success",
        })
      );
      await app.close();
    });

    it("should reject when userId is missing", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "DELETE",
        url: "/api/whatsapp/unlink",
      });

      expect(res.statusCode).toBe(401);
      expect(unlinkWhatsApp).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
