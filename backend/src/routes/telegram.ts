import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import {
  sendMessage,
  downloadVoiceMessage,
  isValidTelegramUpdate,
} from "../services/telegram.js";
import {
  handleTextMessage,
  handleVoiceMessage,
  handleMediaMessage,
  buildUserErrorMessage,
} from "../services/message-handler.js";
import { consumeLinkToken } from "../services/telegram-link.js";
import { logActivity } from "../utils/activity-log.js";

const NEEDS_LINK_MESSAGE =
  "No has vinculado tu cuenta de KillaAssistant con Telegram.\n\n" +
  "Ingresa a https://killaassistant.vercel.app/connections, " +
  "genera un codigo de vinculacion y envialo aqui con /start KILLA-XXXXXX.\n\n" +
  "Mientras no vincules tu cuenta, no podre responderte.";

const LINK_SUCCESS_MESSAGE =
  "Cuenta vinculada con exito! Ya puedes escribirme y usare tus propias API keys. ";

const LINK_ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "Codigo de vinculacion invalido. Verifica el codigo en la web e intentalo de nuevo.",
  already_used: "Este codigo ya fue usado. Genera uno nuevo en https://killaassistant.vercel.app/connections",
  expired: "Este codigo ha expirado. Genera uno nuevo en https://killaassistant.vercel.app/connections",
  db_error: "Error al vincular la cuenta. Intentalo de nuevo en unos minutos.",
};

async function handleStartCommand(
  chatId: number,
  text: string
): Promise<string | null> {
  const parts = text.trim().split(/\s+/);

  if (parts.length === 1 && parts[0] === "/start") {
    return null;
  }

  const token = parts[1];
  const result = await consumeLinkToken(token, chatId.toString());

  if (result.success) {
    await logActivity({
      userId: result.userId!,
      source: "telegram",
      level: "success",
      message: "Telegram account linked via /start token",
    });
    return LINK_SUCCESS_MESSAGE;
  }

  const errorMsg = LINK_ERROR_MESSAGES[result.error ?? "invalid_token"];
  return errorMsg;
}

export async function telegramWebhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/telegram", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const secretToken = request.headers["x-telegram-bot-api-secret-token"];

    if (secretToken !== env.TELEGRAM_WEBHOOK_SECRET) {
      request.log.warn("Telegram webhook: invalid secret token");
      return reply.code(403).send({ error: "Forbidden" });
    }

    const update = request.body as unknown;

    if (!isValidTelegramUpdate(update)) {
      request.log.warn("Telegram webhook: invalid update format");
      return reply.code(400).send({ error: "Invalid update" });
    }

    const message = update.message!;
    const chatId = message.chat.id;

    if (message.text && message.text.startsWith("/start")) {
      try {
        const linkResponse = await handleStartCommand(chatId, message.text);

        if (linkResponse !== null) {
          await sendMessage(chatId, linkResponse);
          return reply.code(200).send({ ok: true });
        }

        await sendMessage(chatId, NEEDS_LINK_MESSAGE);
        return reply.code(200).send({ ok: true });
      } catch (error) {
        request.log.error({ err: error }, "Telegram /start handling error");
        try {
          await sendMessage(chatId, LINK_ERROR_MESSAGES.db_error);
        } catch {
          // nothing more we can do
        }
        return reply.code(200).send({ ok: true });
      }
    }

    const chatIdStr = chatId.toString();

    try {
      if (message.text) {
        const response = await handleTextMessage({
          channel: "telegram",
          chatId: chatIdStr,
          userId: chatIdStr,
          text: message.text,
        });
        await sendMessage(chatId, response);
      } else if (message.voice) {
        const { buffer, mimeType } = await downloadVoiceMessage(message.voice.file_id);
        const response = await handleVoiceMessage({
          channel: "telegram",
          chatId: chatIdStr,
          userId: chatIdStr,
          audioBuffer: buffer,
          mimeType,
        });
        await sendMessage(chatId, response);
      } else if (message.photo && message.photo.length > 0) {
        const largestPhoto = message.photo[message.photo.length - 1];
        const response = await handleMediaMessage({
          channel: "telegram",
          chatId: chatIdStr,
          userId: chatIdStr,
          mediaType: "photo",
          fileId: largestPhoto.file_id,
          fileUniqueId: largestPhoto.file_unique_id,
          caption: message.caption,
        });
        await sendMessage(chatId, response);
      } else if (message.document) {
        const response = await handleMediaMessage({
          channel: "telegram",
          chatId: chatIdStr,
          userId: chatIdStr,
          mediaType: "document",
          fileId: message.document.file_id,
          fileUniqueId: message.document.file_unique_id,
          fileName: message.document.file_name,
          mimeType: message.document.mime_type,
          caption: message.caption,
        });
        await sendMessage(chatId, response);
      } else {
        await sendMessage(chatId, "Solo puedo procesar texto, notas de voz, fotos y documentos por ahora.");
      }
    } catch (error) {
      request.log.error({ err: error }, "Telegram webhook processing error");
      const userMessage = buildUserErrorMessage(error);
      try {
        await sendMessage(chatId, userMessage);
      } catch {
        // If sending the error message also fails, there is nothing more to do
      }
    }

    return reply.code(200).send({ ok: true });
  });
}
