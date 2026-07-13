import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

vi.mock("../src/config/env.js", () => ({
  env: {
    TELEGRAM_WEBHOOK_SECRET: "test-telegram-webhook-secret-min-32-chars",
    TELEGRAM_BOT_TOKEN: "test-token",
  },
}));

vi.mock("../src/services/telegram.js", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  downloadVoiceMessage: vi.fn(),
  downloadMediaMessage: vi.fn(),
  isValidTelegramUpdate: vi.fn(() => true),
}));

vi.mock("../src/services/message-handler.js", () => ({
  handleTextMessage: vi.fn().mockResolvedValue("text response"),
  handleVoiceMessage: vi.fn().mockResolvedValue("voice response"),
  handleMediaMessage: vi.fn().mockResolvedValue("media response"),
  buildUserErrorMessage: vi.fn(() => "error"),
}));

vi.mock("../src/services/telegram-link.js", () => ({
  consumeLinkToken: vi.fn(),
}));

vi.mock("../src/utils/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { telegramWebhookRoutes } from "../src/routes/telegram.js";
import { sendMessage, isValidTelegramUpdate } from "../src/services/telegram.js";
import { handleMediaMessage } from "../src/services/message-handler.js";

const SECRET = "test-telegram-webhook-secret-min-32-chars";

async function buildApp() {
  const app = Fastify();
  await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await app.register(telegramWebhookRoutes);
  return app;
}

describe("Telegram webhook endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(isValidTelegramUpdate).mockReturnValue(true);
  });

  it("should reject requests without valid secret token", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: {},
      payload: { update_id: 1, message: { message_id: 1, chat: { id: 1, type: "private" }, date: 1 } },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("should reject invalid update format", async () => {
    const app = await buildApp();
    vi.mocked(isValidTelegramUpdate).mockReturnValueOnce(false);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: { invalid: true },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("should route photo messages to handleMediaMessage", async () => {
    const app = await buildApp();

    vi.mocked(handleMediaMessage).mockResolvedValueOnce("Foto recibida.");

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: {
        update_id: 10,
        message: {
          message_id: 10,
          chat: { id: 123, type: "private" },
          date: Date.now(),
          photo: [
            { file_id: "small", file_unique_id: "u1", width: 160, height: 160 },
            { file_id: "large", file_unique_id: "u2", width: 800, height: 600 },
          ],
        },
      },
    });

    expect(handleMediaMessage).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(handleMediaMessage).mock.calls[0][0];
    expect(callArg.mediaType).toBe("photo");
    expect(callArg.fileId).toBe("large");
    expect(sendMessage).toHaveBeenCalledWith(123, "Foto recibida.");
    await app.close();
  });

  it("should route document messages to handleMediaMessage", async () => {
    const app = await buildApp();

    vi.mocked(handleMediaMessage).mockResolvedValueOnce("Documento recibido.");

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: {
        update_id: 11,
        message: {
          message_id: 11,
          chat: { id: 123, type: "private" },
          date: Date.now(),
          document: {
            file_id: "doc-123",
            file_unique_id: "u3",
            file_name: "report.pdf",
            mime_type: "application/pdf",
          },
        },
      },
    });

    expect(handleMediaMessage).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(handleMediaMessage).mock.calls[0][0];
    expect(callArg.mediaType).toBe("document");
    expect(callArg.fileId).toBe("doc-123");
    expect(callArg.fileName).toBe("report.pdf");
    expect(sendMessage).toHaveBeenCalledWith(123, "Documento recibido.");
    await app.close();
  });

  it("should return feedback for unsupported media types (e.g. sticker)", async () => {
    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: {
        update_id: 12,
        message: {
          message_id: 12,
          chat: { id: 123, type: "private" },
          date: Date.now(),
          sticker: { file_id: "s1", width: 512, height: 512 },
        },
      },
    });

    expect(handleMediaMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining("Solo puedo procesar")
    );
    await app.close();
  });
});
