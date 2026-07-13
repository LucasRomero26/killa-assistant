import { env } from "../config/env.js";
import type { TelegramUpdate, TelegramFileResponse } from "../types/index.js";

const TELEGRAM_BASE_URL = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 15_000;

export class TelegramError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "rate_limit" | "auth" | "server" | "network" | "unknown",
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

function classifyError(error: unknown, statusCode?: number): TelegramError {
  if (error instanceof TelegramError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new TelegramError("Telegram API request timed out", "timeout", undefined);
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new TelegramError("Network error reaching Telegram API", "network", undefined);
  }

  const msg = error instanceof Error ? error.message : String(error);

  if (statusCode === 429) return new TelegramError("Telegram API rate limit", "rate_limit", 429);
  if (statusCode === 401) return new TelegramError("Telegram bot token invalid", "auth", 401);
  if (statusCode && statusCode >= 500) {
    return new TelegramError(`Telegram server error (${statusCode})`, "server", statusCode);
  }

  return new TelegramError(msg, "unknown", statusCode);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw classifyError(error);
  }
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${TELEGRAM_BASE_URL}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw classifyError(
      new Error(`Telegram sendMessage error ${response.status}: ${errorText}`),
      response.status
    );
  }
}

export async function getFile(fileId: string): Promise<TelegramFileResponse> {
  const response = await fetchWithTimeout(
    `${TELEGRAM_BASE_URL}/bot${env.TELEGRAM_BOT_TOKEN}/getFile`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw classifyError(
      new Error(`Telegram getFile error ${response.status}: ${errorText}`),
      response.status
    );
  }

  const data = (await response.json()) as { ok: boolean; description?: string; result: TelegramFileResponse };
  if (!data.ok) {
    throw new TelegramError(`Telegram getFile failed: ${data.description}`, "unknown");
  }
  return data.result;
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const url = `${TELEGRAM_BASE_URL}/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const response = await fetchWithTimeout(url, {});

  if (!response.ok) {
    throw classifyError(
      new Error(`Telegram downloadFile error ${response.status}`),
      response.status
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadVoiceMessage(fileId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const file = await getFile(fileId);
  if (!file.file_path) {
    throw new TelegramError("Telegram file_path is missing", "unknown");
  }
  const buffer = await downloadFile(file.file_path);
  const ext = file.file_path.split(".").pop()?.toLowerCase() ?? "ogg";
  const mimeType = ext === "mp3" ? "audio/mp3" : "audio/ogg";
  return { buffer, mimeType };
}

export async function downloadMediaMessage(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string; fileName?: string }> {
  const file = await getFile(fileId);
  if (!file.file_path) {
    throw new TelegramError("Telegram file_path is missing", "unknown");
  }
  const buffer = await downloadFile(file.file_path);

  const ext = file.file_path.split(".").pop()?.toLowerCase() ?? "";
  let mimeType = "application/octet-stream";
  let fileName: string | undefined;

  if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
  else if (ext === "png") mimeType = "image/png";
  else if (ext === "gif") mimeType = "image/gif";
  else if (ext === "webp") mimeType = "image/webp";
  else if (ext === "pdf") mimeType = "application/pdf";
  else if (ext === "mp4") mimeType = "video/mp4";
  else if (ext === "mp3") mimeType = "audio/mpeg";

  const baseName = file.file_path.split("/").pop();
  if (baseName) fileName = baseName;

  return { buffer, mimeType, fileName };
}

export async function setWebhook(webhookUrl: string, secretToken: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${TELEGRAM_BASE_URL}/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ["message"],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw classifyError(
      new Error(`Telegram setWebhook error ${response.status}: ${errorText}`),
      response.status
    );
  }
}

export async function deleteWebhook(): Promise<void> {
  const response = await fetchWithTimeout(
    `${TELEGRAM_BASE_URL}/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    throw classifyError(
      new Error(`Telegram deleteWebhook error ${response.status}`),
      response.status
    );
  }
}

export async function getWebhookInfo(): Promise<unknown> {
  const response = await fetchWithTimeout(
    `${TELEGRAM_BASE_URL}/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    throw classifyError(
      new Error(`Telegram getWebhookInfo error ${response.status}`),
      response.status
    );
  }

  const data = (await response.json()) as { result: unknown };
  return data.result;
}

export function isValidTelegramUpdate(update: unknown): update is TelegramUpdate {
  const u = update as Record<string, unknown>;
  return typeof u.update_id === "number" && u.message !== undefined;
}
