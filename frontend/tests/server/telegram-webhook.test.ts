import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/config/env", () => ({
  env: {
    TELEGRAM_WEBHOOK_SECRET: "test-telegram-webhook-secret-min-32-chars",
    TELEGRAM_BOT_TOKEN: "test-token",
  },
}));

vi.mock("@/server/services/telegram", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  downloadVoiceMessage: vi.fn(),
  downloadMediaMessage: vi.fn(),
  isValidTelegramUpdate: vi.fn(() => true),
}));

vi.mock("@/server/services/message-handler", () => ({
  handleTextMessage: vi.fn().mockResolvedValue("text response"),
  handleVoiceMessage: vi.fn().mockResolvedValue("voice response"),
  handleMediaMessage: vi.fn().mockResolvedValue("media response"),
  buildUserErrorMessage: vi.fn(() => "error"),
}));

vi.mock("@/server/services/telegram-link", () => ({
  consumeLinkToken: vi.fn(),
}));

vi.mock("@/server/utils/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { handleTelegramWebhook } from "@/server/handlers/telegram-webhook";
import { sendMessage, isValidTelegramUpdate } from "@/server/services/telegram";
import { handleMediaMessage, handleTextMessage } from "@/server/services/message-handler";
import { consumeLinkToken } from "@/server/services/telegram-link";

const SECRET = "test-telegram-webhook-secret-min-32-chars";
const URL_ = "http://localhost/api/webhooks/telegram";

/** Run the webhook and wait for the background work it scheduled. */
async function post(payload: unknown, headers: Record<string, string> = {}) {
  const pending: Promise<void>[] = [];
  const res = await handleTelegramWebhook(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }),
    (work) => pending.push(work)
  );
  await Promise.all(pending);
  return { res, scheduled: pending.length };
}

describe("Telegram webhook handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(isValidTelegramUpdate).mockReturnValue(true);
  });

  it("should reject requests without valid secret token", async () => {
    const { res, scheduled } = await post({
      update_id: 1,
      message: { message_id: 1, chat: { id: 1, type: "private" }, date: 1 },
    });

    expect(res.status).toBe(403);
    expect(scheduled).toBe(0);
  });

  it("should reject invalid update format", async () => {
    vi.mocked(isValidTelegramUpdate).mockReturnValueOnce(false);

    const { res, scheduled } = await post({ invalid: true }, { "x-telegram-bot-api-secret-token": SECRET });

    expect(res.status).toBe(400);
    expect(scheduled).toBe(0);
  });

  it("should reject a non-JSON body", async () => {
    const res = await handleTelegramWebhook(
      new Request(URL_, {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": SECRET },
        body: "not json",
      }),
      () => {}
    );

    expect(res.status).toBe(400);
  });

  it("should acknowledge with 200 and process text messages in the background", async () => {
    const { res } = await post(
      {
        update_id: 2,
        message: { message_id: 2, chat: { id: 123, type: "private" }, date: 1, text: "hola" },
      },
      { "x-telegram-bot-api-secret-token": SECRET }
    );

    expect(res.status).toBe(200);
    expect(handleTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", chatId: "123", text: "hola" })
    );
    expect(sendMessage).toHaveBeenCalledWith(123, "text response");
  });

  it("should link the account on /start <token>", async () => {
    vi.mocked(consumeLinkToken).mockResolvedValueOnce({ success: true, userId: "user-1" });

    await post(
      {
        update_id: 3,
        message: { message_id: 3, chat: { id: 55, type: "private" }, date: 1, text: "/start KILLA-ABCD" },
      },
      { "x-telegram-bot-api-secret-token": SECRET }
    );

    expect(consumeLinkToken).toHaveBeenCalledWith("KILLA-ABCD", "55");
    expect(sendMessage).toHaveBeenCalledWith(55, expect.stringContaining("vinculada con exito"));
    expect(handleTextMessage).not.toHaveBeenCalled();
  });

  it("should route photo messages to handleMediaMessage", async () => {
    vi.mocked(handleMediaMessage).mockResolvedValueOnce("Foto recibida.");

    await post(
      {
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
      { "x-telegram-bot-api-secret-token": SECRET }
    );

    expect(handleMediaMessage).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(handleMediaMessage).mock.calls[0][0];
    expect(callArg.mediaType).toBe("photo");
    expect(callArg.fileId).toBe("large");
    expect(sendMessage).toHaveBeenCalledWith(123, "Foto recibida.");
  });

  it("should route document messages to handleMediaMessage", async () => {
    vi.mocked(handleMediaMessage).mockResolvedValueOnce("Documento recibido.");

    await post(
      {
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
      { "x-telegram-bot-api-secret-token": SECRET }
    );

    expect(handleMediaMessage).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(handleMediaMessage).mock.calls[0][0];
    expect(callArg.mediaType).toBe("document");
    expect(callArg.fileId).toBe("doc-123");
    expect(callArg.fileName).toBe("report.pdf");
    expect(sendMessage).toHaveBeenCalledWith(123, "Documento recibido.");
  });

  it("should return feedback for unsupported media types (e.g. sticker)", async () => {
    await post(
      {
        update_id: 12,
        message: {
          message_id: 12,
          chat: { id: 123, type: "private" },
          date: Date.now(),
          sticker: { file_id: "s1", width: 512, height: 512 },
        },
      },
      { "x-telegram-bot-api-secret-token": SECRET }
    );

    expect(handleMediaMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(123, expect.stringContaining("Solo puedo procesar"));
  });
});
