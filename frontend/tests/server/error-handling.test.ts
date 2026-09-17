import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleTelegramWebhook } from "@/server/handlers/telegram-webhook";
import { NvidiaError } from "@/server/services/nvidia";
import { GroqError } from "@/server/services/groq";

vi.mock("@/server/services/nvidia", () => ({
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

vi.mock("@/server/services/groq", () => ({
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

vi.mock("@/server/services/telegram", () => ({
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

vi.mock("@/server/services/pending-media", () => ({
  createPendingMedia: vi.fn(),
  getPendingMedia: vi.fn().mockResolvedValue(null),
  markMediaConsumed: vi.fn().mockResolvedValue(undefined),
  cleanupExpiredMedia: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/google-auth", () => ({
  getOAuthClientForUser: vi.fn().mockResolvedValue(null),
  getUserGrantedScopes: vi.fn().mockResolvedValue([]),
  hasRestrictedDriveScope: vi.fn(() => false),
}));

vi.mock("@/server/services/google-tools", () => ({
  calendarTools: [],
  driveTools: [],
  executeCalendarTool: vi.fn(),
  executeDriveTool: vi.fn(),
}));

vi.mock("@/server/utils/activity-log", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/user-api-keys", () => ({
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

vi.mock("@/server/services/telegram-link", () => ({
  consumeLinkToken: vi.fn(),
  getUserIdByChatId: vi.fn().mockResolvedValue("supabase-uuid-1"),
  createLinkToken: vi.fn(),
  getTelegramLinkStatus: vi.fn(),
}));

vi.mock("@/server/services/user-config", () => ({
  getUserSystemPrompt: vi.fn().mockResolvedValue(null),
}));

import { chatCompletion } from "@/server/services/nvidia";
import { transcribeAudio } from "@/server/services/groq";
import { sendMessage, downloadVoiceMessage } from "@/server/services/telegram";

const SECRET = "test-telegram-webhook-secret-min-32-chars";

/** Run the webhook and wait for the background work it scheduled. */
async function post(payload: unknown) {
  const pending: Promise<void>[] = [];
  const res = await handleTelegramWebhook(
    new Request("http://localhost/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": SECRET,
      },
      body: JSON.stringify(payload),
    }),
    (work) => pending.push(work)
  );
  await Promise.all(pending);
  return res;
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

    await post(textUpdate("hello"));

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The AI model took too long to respond. Please try again with a shorter message."
    );
  });

  it("should send rate limit message when NVIDIA returns 429", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("rate limit", "rate_limit", 429, false)
    );

    await post(textUpdate("hello"));

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The AI service is busy right now (rate limit). Please wait a moment and try again."
    );
  });

  it("should send auth message when NVIDIA returns 401", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("auth failed", "auth", 401, false)
    );

    await post(textUpdate("hello"));

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "Tu API key de NVIDIA no es valida o ha expirado. Ve a https://killaassistant.vercel.app/apis para actualizarla."
    );
  });

  it("should send server error message when NVIDIA returns 500", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("server error", "server", 500, true)
    );

    await post(textUpdate("hello"));

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The AI service is experiencing issues. Please try again shortly."
    );
  });

  it("should send Groq timeout message when transcription times out", async () => {
    vi.mocked(downloadVoiceMessage).mockResolvedValue({
      buffer: Buffer.from("audio"),
      mimeType: "audio/ogg",
    });
    vi.mocked(transcribeAudio).mockRejectedValue(
      new GroqError("timed out", "timeout", undefined, true)
    );

    await post(voiceUpdate("file1"));

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "Audio transcription took too long. Please try a shorter voice message."
    );
  });

  it("should send Groq rate limit message when transcription hits 429", async () => {
    vi.mocked(downloadVoiceMessage).mockResolvedValue({
      buffer: Buffer.from("audio"),
      mimeType: "audio/ogg",
    });
    vi.mocked(transcribeAudio).mockRejectedValue(
      new GroqError("rate limit", "rate_limit", 429, false)
    );

    await post(voiceUpdate("file1"));

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "The transcription service is busy right now. Please wait and try again."
    );
  });

  it("should send generic message for unknown errors", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(new Error("unexpected failure"));

    await post(textUpdate("hello"));

    expect(sendMessage).toHaveBeenCalledWith(
      123,
      "A temporary error occurred. Please try again in a moment."
    );
  });

  it("should still return 200 when an error occurs (Telegram retries on non-200)", async () => {
    vi.mocked(chatCompletion).mockRejectedValue(
      new NvidiaError("timed out", "timeout", undefined, true)
    );

    const response = await post(textUpdate("hello"));

    expect(response.status).toBe(200);
  });
});
