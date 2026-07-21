import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { telegramWebhookRoutes } from "../src/routes/telegram.js";
import { NvidiaError } from "../src/services/nvidia.js";
import { GroqError } from "../src/services/groq.js";

vi.mock("../src/services/nvidia.js", () => ({
  chatCompletion: vi.fn(),
  NvidiaError: class NvidiaError extends Error {
    constructor(
      message: string,
      public readonly kind: string,
      public readonly statusCode?: number,
      public readonly retriable: boolean = false
    ) {
      super(message);
      this.name = "NvidiaError";
    }
  },
}));

vi.mock("../src/services/groq.js", () => ({
  transcribeAudio: vi.fn(),
  GroqError: class GroqError extends Error {
    constructor(
      message: string,
      public readonly kind: string,
      public readonly statusCode?: number,
      public readonly retriable: boolean = false
    ) {
      super(message);
      this.name = "GroqError";
    }
  },
}));

vi.mock("../src/services/telegram.js", () => ({
  sendMessage: vi.fn(),
  downloadVoiceMessage: vi.fn(),
  downloadMediaMessage: vi.fn(),
  isValidTelegramUpdate: vi.fn(() => true),
  TelegramError: class TelegramError extends Error {
    constructor(
      message: string,
      public readonly kind: string,
      public readonly statusCode?: number
    ) {
      super(message);
      this.name = "TelegramError";
    }
  },
}));

vi.mock("../src/services/pending-media.js", () => ({
  createPendingMedia: vi.fn(),
  getPendingMedia: vi.fn().mockResolvedValue(null),
  markMediaConsumed: vi.fn().mockResolvedValue(undefined),
  cleanupExpiredMedia: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/google-auth.js", () => ({
  getOAuthClientForUser: vi.fn().mockResolvedValue(null),
  getUserGrantedScopes: vi.fn().mockResolvedValue([]),
  hasRestrictedDriveScope: vi.fn(() => false),
}));

vi.mock("../src/services/google-tools.js", () => ({
  calendarTools: [],
  driveTools: [],
  executeCalendarTool: vi.fn(),
  executeDriveTool: vi.fn(),
}));

vi.mock("../src/utils/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/user-api-keys.js", () => ({
  getUserApiKeys: vi.fn().mockResolvedValue({
    nvidiaApiKey: "test-nvidia-key",
    nvidiaModel: "meta/llama-3.1-70b-instruct",
    groqApiKey: "test-groq-key",
    groqModel: "whisper-large-v3",
  }),
  buildMissingKeysMessage: vi.fn((missing: string[]) => `Missing: ${missing.join(", ")}`),
  ApiKeyNotConfiguredError: class ApiKeyNotConfiguredError extends Error {
    constructor(public readonly missingProviders: string[]) {
      super(`Missing: ${missingProviders.join(", ")}`);
      this.name = "ApiKeyNotConfiguredError";
    }
  },
}));

vi.mock("../src/services/telegram-link.js", () => ({
  consumeLinkToken: vi.fn(),
  getUserIdByChatId: vi.fn().mockResolvedValue("supabase-uuid-1"),
  createLinkToken: vi.fn(),
  getTelegramLinkStatus: vi.fn(),
}));

vi.mock("../src/services/whatsapp-link.js", () => ({
  consumeWhatsAppLinkToken: vi.fn(),
  getUserIdByWhatsAppChatId: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/services/user-config.js", () => ({
  getUserSystemPrompt: vi.fn().mockResolvedValue(null),
}));

import { chatCompletion } from "../src/services/nvidia.js";
import { transcribeAudio } from "../src/services/groq.js";
import { sendMessage, downloadVoiceMessage } from "../src/services/telegram.js";

const SECRET = "test-telegram-webhook-secret-min-32-chars";

async function buildApp() {
  const app = Fastify();
  await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await app.register(telegramWebhookRoutes);
  return app;
}

function textUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: 123, type: "private" as const },
      date: Date.now(),
      text,
    },
  };
}

function voiceUpdate(fileId: string) {
  return {
    update_id: 2,
    message: {
      message_id: 2,
      chat: { id: 123, type: "private" as const },
      date: Date.now(),
      voice: { file_id: fileId, file_unique_id: "u1", duration: 5, mime_type: "audio/ogg" },
    },
  };
}

describe("Telegram webhook error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendMessage).mockResolvedValue(undefined);
  });

  it("should send timeout message when NVIDIA times out", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("timed out", "timeout", undefined, true)
    );

    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: textUpdate("hello"),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The AI model took too long to respond. Please try again with a shorter message."
    );
    await app.close();
  });

  it("should send rate limit message when NVIDIA returns 429", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("rate limit", "rate_limit", 429, false)
    );

    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: textUpdate("hello"),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The AI service is busy right now (rate limit). Please wait a moment and try again."
    );
    await app.close();
  });

  it("should send auth message when NVIDIA returns 401", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("auth failed", "auth", 401, false)
    );

    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: textUpdate("hello"),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "Tu API key de NVIDIA no es valida o ha expirado. Ve a https://killaassistant.vercel.app/apis para actualizarla."
    );
    await app.close();
  });

  it("should send server error message when NVIDIA returns 500", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("server error", "server", 500, true)
    );

    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: textUpdate("hello"),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The AI service is experiencing issues. Please try again shortly."
    );
    await app.close();
  });

  it("should send Groq timeout message when transcription times out", async () => {
    vi.mocked(downloadVoiceMessage).mockResolvedValue({
      buffer: Buffer.from("audio"),
      mimeType: "audio/ogg",
    });
    vi.mocked(transcribeAudio).mockRejectedValue(
      new GroqError("timed out", "timeout", undefined, true)
    );

    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: voiceUpdate("file1"),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "Audio transcription took too long. Please try a shorter voice message."
    );
    await app.close();
  });

  it("should send Groq rate limit message when transcription hits 429", async () => {
    vi.mocked(downloadVoiceMessage).mockResolvedValue({
      buffer: Buffer.from("audio"),
      mimeType: "audio/ogg",
    });
    vi.mocked(transcribeAudio).mockRejectedValue(
      new GroqError("rate limit", "rate_limit", 429, false)
    );

    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: voiceUpdate("file1"),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The transcription service is busy right now. Please wait and try again."
    );
    await app.close();
  });

  it("should send generic message for unknown errors", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new Error("unexpected failure"));

    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: textUpdate("hello"),
    });

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "A temporary error occurred. Please try again in a moment."
    );
    await app.close();
  });

  it("should still return 200 when an error occurs (Telegram retries on non-200)", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("timed out", "timeout", undefined, true)
    );

    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/telegram",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      payload: textUpdate("hello"),
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
