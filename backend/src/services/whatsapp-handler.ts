import {
  onWhatsAppMessage,
  sendWhatsAppMessage,
  getActiveWhatsAppClient,
  getHostChatId,
} from "../services/whatsapp.js";
import {
  consumeWhatsAppLinkToken,
  getUserIdByWhatsAppChatId,
} from "../services/whatsapp-link.js";
import {
  handleTextMessage,
  handleVoiceMessage,
  handleMediaMessage,
  buildUserErrorMessage,
} from "../services/message-handler.js";
import { logActivity } from "../utils/activity-log.js";
import type { WhatsAppIncomingMessage } from "../types/index.js";
import pino from "pino";
import { env } from "../config/env.js";

const app_log = pino({ name: "whatsapp-handler", level: env.NODE_ENV === "production" ? "info" : "debug" });

let initialized = false;

const NEEDS_LINK_MESSAGE =
  "No has vinculado tu cuenta de KillaAssistant con WhatsApp.\n\n" +
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

const UNAUTHORIZED_MESSAGE =
  "Hola! Este numero es el bot asistente de KillaAssistant y solo responde a usuarios vinculados. " +
  "Si tienes cuenta en KillaAssistant, ingresa a https://killaassistant.vercel.app/connections " +
  "y genera un codigo de vinculacion para conectar tu WhatsApp.";

export function initWhatsAppMessageHandler(): void {
  if (initialized) return;
  initialized = true;

  onWhatsAppMessage(async (msg: WhatsAppIncomingMessage) => {
    app_log.debug({ chatId: msg.chatId, type: msg.type, text: msg.text?.slice(0, 50) }, "[WA-handler] Message received");
    try {
      if (msg.type === "text" && msg.text.startsWith("/start")) {
        app_log.debug({ text: msg.text }, "[WA-handler] /start command detected");
        const response = await handleStartCommand(msg);
        app_log.debug({ response: response?.slice(0, 50) }, "[WA-handler] handleStartCommand returned");
        if (response !== null) {
          await sendWhatsAppMessage(msg.chatId, response);
          app_log.debug({ chatId: msg.chatId }, "[WA-handler] Response sent successfully");
        }
        return;
      }

      const response = await processWhatsAppMessage(msg);
      await sendWhatsAppMessage(msg.chatId, response);
      app_log.debug({ chatId: msg.chatId }, "[WA-handler] Response sent successfully");
    } catch (error) {
      app_log.error({ err: error, chatId: msg.chatId }, "[WA-handler] Error processing message");
      if (error instanceof Error && error.message.includes("sendText is not a function")) {
        return;
      }

      const userMessage = buildUserErrorMessage(error);
      try {
        await sendWhatsAppMessage(msg.chatId, userMessage);
      } catch {
        // If sending the error message also fails, there is nothing more to do
      }

      await logActivity({
        userId: msg.userId ?? "unknown",
        source: "whatsapp",
        level: "error",
        message: "WhatsApp message processing error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function handleStartCommand(msg: WhatsAppIncomingMessage): Promise<string | null> {
  const parts = msg.text.trim().split(/\s+/);

  if (parts.length === 1 && parts[0] === "/start") {
    return NEEDS_LINK_MESSAGE;
  }

  const token = parts[1];
  const result = await consumeWhatsAppLinkToken(token, msg.chatId);

  if (result.success) {
    await logActivity({
      userId: result.userId!,
      source: "whatsapp",
      level: "success",
      message: "WhatsApp account linked via /start token",
    });
    return LINK_SUCCESS_MESSAGE;
  }

  const errorMsg = LINK_ERROR_MESSAGES[result.error ?? "invalid_token"];
  return errorMsg;
}

async function processWhatsAppMessage(msg: WhatsAppIncomingMessage): Promise<string> {
  const resolvedUserId = await getUserIdByWhatsAppChatId(msg.chatId);
  if (!resolvedUserId) {
    // Security audit: distinguish between the bot owner (who forgot to link)
    // and a third party (truly unauthorized person contacting the bot).
    const hostId = getHostChatId();
    if (hostId && msg.chatId !== hostId) {
      app_log.warn(
        { chatId: msg.chatId, hostId },
        "[WA-handler] Unauthorized third-party message — not the host, not linked. Replying with unauthorized message."
      );
      return UNAUTHORIZED_MESSAGE;
    }
    return NEEDS_LINK_MESSAGE;
  }

  const msgWithUser = { ...msg, userId: resolvedUserId };

  if (msg.type === "text") {
    return handleTextMessage({
      channel: "whatsapp",
      chatId: msg.chatId,
      userId: resolvedUserId,
      text: msg.text,
    });
  }

  if (msg.type === "voice") {
    return processVoiceMessage(msgWithUser);
  }

  return processMediaMessage(msgWithUser);
}

async function processVoiceMessage(msg: WhatsAppIncomingMessage): Promise<string> {
  if (!msg.rawMessage) {
    await logActivity({
      userId: msg.userId!,
      source: "whatsapp",
      level: "warning",
      message: "WhatsApp voice message missing rawMessage for download",
    });
    return "No pude procesar la nota de voz. Intenta enviarla de nuevo.";
  }

  const client = getActiveWhatsAppClient();
  if (!client) {
    return "La sesión de WhatsApp no está activa. Intenta reconectarla.";
  }

  const { buffer, mimeType } = await client.decryptMedia(msg.rawMessage);

  return handleVoiceMessage({
    channel: "whatsapp",
    chatId: msg.chatId,
    userId: msg.userId!,
    audioBuffer: buffer,
    mimeType: msg.mimeType ?? mimeType,
  });
}

async function processMediaMessage(msg: WhatsAppIncomingMessage): Promise<string> {
  if (!msg.rawMessage) {
    await logActivity({
      userId: msg.userId!,
      source: "whatsapp",
      level: "warning",
      message: "WhatsApp media message missing rawMessage for download",
    });
    return "No pude procesar el archivo. Intenta enviarlo de nuevo.";
  }

  const client = getActiveWhatsAppClient();
  if (!client) {
    return "La sesión de WhatsApp no está activa. Intenta reconectarla.";
  }

  let downloaded: { buffer: Buffer; mimeType: string };
  try {
    downloaded = await client.decryptMedia(msg.rawMessage);
  } catch (error) {
    await logActivity({
      userId: msg.userId!,
      source: "whatsapp",
      level: "error",
      message: "Failed to download WhatsApp media",
      detail: error instanceof Error ? error.message : String(error),
    });
    return "No pude descargar el archivo. Intenta enviarlo de nuevo.";
  }

  const mediaResponse = await handleMediaMessage({
    channel: "whatsapp",
    chatId: msg.chatId,
    userId: msg.userId!,
    mediaType: msg.type as "photo" | "document",
    fileId: "wa-" + Date.now(),
    fileName: msg.fileName,
    mimeType: msg.mimeType ?? downloaded.mimeType,
    caption: msg.caption ?? msg.text,
    mediaBuffer: downloaded,
  });

  return mediaResponse;
}
