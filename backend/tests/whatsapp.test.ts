import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/config/env.js", () => ({
  env: {
    WHATSAPP_USE_MOCK: "true",
    WHATSAPP_AUTOSTART: "false",
    NODE_ENV: "test",
  },
}));

import {
  startWhatsAppBot,
  stopWhatsApp,
  sendWhatsAppMessage,
  onWhatsAppQR,
  onWhatsAppStatus,
  getWhatsAppConnectionStatus,
  isWhatsAppReady,
  WhatsAppError,
} from "../src/services/whatsapp.js";

describe("WhatsApp Service (Mock Mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopWhatsApp();
  });

  describe("startWhatsAppBot", () => {
    it("should start a singleton session and emit connecting status", async () => {
      const statuses: Array<{ status: string; message?: string }> = [];
      onWhatsAppStatus((payload) => statuses.push(payload));

      await startWhatsAppBot();

      expect(statuses.some((s) => s.status === "connecting")).toBe(true);
    });

    it("should emit QR code in mock mode", async () => {
      const qrPayloads: Array<{ qr: string; timestamp: number }> = [];
      onWhatsAppQR((payload) => qrPayloads.push(payload));

      await startWhatsAppBot();

      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(qrPayloads.length).toBeGreaterThan(0);
      expect(qrPayloads[0].qr).toBeDefined();
      expect(typeof qrPayloads[0].timestamp).toBe("number");
    });

    it("should not start a second session when already running", async () => {
      await startWhatsAppBot();
      const firstStatus = getWhatsAppConnectionStatus();

      await startWhatsAppBot();
      const secondStatus = getWhatsAppConnectionStatus();

      expect(secondStatus).toEqual(firstStatus);
    });
  });

  describe("stopWhatsApp", () => {
    it("should clear the active session", async () => {
      await startWhatsAppBot();
      await stopWhatsApp();

      const status = getWhatsAppConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it("should emit disconnected status", async () => {
      const statuses: Array<{ status: string; message?: string }> = [];
      onWhatsAppStatus((payload) => statuses.push(payload));

      await startWhatsAppBot();
      await stopWhatsApp();

      expect(statuses.some((s) => s.status === "disconnected")).toBe(true);
    });
  });

  describe("sendWhatsAppMessage", () => {
    it("should throw when no session is active", async () => {
      await expect(sendWhatsAppMessage("123", "hello")).rejects.toThrow();
    });

    it("should throw WhatsAppError when not connected", async () => {
      await expect(sendWhatsAppMessage("123", "hello")).rejects.toBeInstanceOf(WhatsAppError);
    });
  });

  describe("getWhatsAppConnectionStatus", () => {
    it("should return disconnected when no session is active", () => {
      const status = getWhatsAppConnectionStatus();
      expect(status.connected).toBe(false);
      expect(status.status).toBe("disconnected");
    });
  });

  describe("isWhatsAppReady", () => {
    it("should return false when no session is active", () => {
      expect(isWhatsAppReady()).toBe(false);
    });
  });

  describe("event listeners", () => {
    it("should allow registering and unregistering QR listeners", async () => {
      const qrPayloads: Array<{ qr: string; timestamp: number }> = [];
      const unregister = onWhatsAppQR((payload) => qrPayloads.push(payload));

      await startWhatsAppBot();
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(qrPayloads.length).toBeGreaterThan(0);

      unregister();
      qrPayloads.length = 0;

      await stopWhatsApp();
      await startWhatsAppBot();
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(qrPayloads.length).toBe(0);
    });

    it("should allow registering multiple status listeners", async () => {
      const statuses1: string[] = [];
      const statuses2: string[] = [];

      onWhatsAppStatus((payload) => statuses1.push(payload.status));
      onWhatsAppStatus((payload) => statuses2.push(payload.status));

      await startWhatsAppBot();

      expect(statuses1.length).toBeGreaterThan(0);
      expect(statuses2.length).toBeGreaterThan(0);
    });
  });
});
