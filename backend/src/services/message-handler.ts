import { processMessageWithTools } from "../mcp/orchestrator.js";
import { transcribeAudio, GroqError } from "../services/groq.js";
import { NvidiaError } from "../services/nvidia.js";
import { getUserApiKeys, buildMissingKeysMessage } from "../services/user-api-keys.js";
import { getUserSystemPrompt } from "../services/user-config.js";
import { getUserIdByChatId as getTelegramUserIdByChatId } from "../services/telegram-link.js";
import { getUserIdByWhatsAppChatId } from "../services/whatsapp-link.js";
import {
  createPendingMedia,
  getPendingMedia,
  markMediaConsumed,
} from "../services/pending-media.js";
import { downloadMediaMessage } from "../services/telegram.js";
import { logActivity } from "../utils/activity-log.js";
import { sanitizeUserMessage, buildProtectedSystemPrompt } from "../utils/prompt-sanitizer.js";
import type { MessagingChannel, IncomingMediaMessage, PendingMedia } from "../types/index.js";

const DEFAULT_SYSTEM_PROMPT =
  "You are KillaAssistant, an elite administrative assistant focused on technical precision and executive brevity. " +
  "You maintain awareness of the current date and time (provided in the system context) and can answer questions about it. " +
  "When the user asks what day it is, what time it is, or similar temporal questions, respond directly using the current date/time context.\n" +
  "CRITICAL: The user is in the timezone specified in the temporal context below (America/Bogota, UTC-5, Colombia). " +
  "ALL times the user mentions are in THEIR local timezone, NOT UTC. " +
  "If the user says '12 PM', they mean 12:00 in their local timezone (UTC-5). " +
  "When creating calendar events, always use the user's local time with the correct UTC offset. " +
  "When a user asks to create an event, list calendar events, or list Drive files, use the available tools. " +
  "If required parameters are missing (e.g. event time), ask the user for clarification before calling the tool. " +
  "When resolving relative date references (e.g. 'tomorrow', 'next Monday', 'pasado manana'), compute the absolute date from the current date in the context, in the user's timezone. " +
  "When the user references a previously sent file/photo/document (e.g. 'guarda esto en Drive', 'sube la foto a la carpeta X'), use the drive_upload_file tool to upload the pending file to their Google Drive. " +
  "If the user's instruction does not clearly mention archiving or processing the previously sent file, ignore the pending file and respond as usual. " +
  "Always respond in Spanish unless the user writes in another language. " +
  "Respond concisely and helpfully.";

const NEEDS_LINK_MESSAGE_TELEGRAM =
  "No has vinculado tu cuenta de KillaAssistant con Telegram.\n\n" +
  "Ingresa a https://killaassistant.vercel.app/connections, " +
  "genera un codigo de vinculacion y envialo aqui con /start KILLA-XXXXXX.";

const NEEDS_LINK_MESSAGE_WHATSAPP =
  "No has vinculado tu cuenta de KillaAssistant con WhatsApp.\n\n" +
  "Ingresa a https://killaassistant.vercel.app/connections, " +
  "genera un codigo de vinculacion y envialo aqui con /start KILLA-XXXXXX.";

async function resolveUserId(channel: MessagingChannel, chatId: string): Promise<string | null> {
  if (channel === "telegram") {
    return getTelegramUserIdByChatId(chatId);
  }
  if (channel === "whatsapp") {
    return getUserIdByWhatsAppChatId(chatId);
  }
  return null;
}

function needsLinkMessage(channel: MessagingChannel): string {
  return channel === "telegram" ? NEEDS_LINK_MESSAGE_TELEGRAM : NEEDS_LINK_MESSAGE_WHATSAPP;
}

const MEDIA_RECEIVED_MESSAGE_PHOTO =
  "Foto recibida. Envíame un mensaje con la acción que deseas realizar " +
  "(por ejemplo: \"guárdala en Drive en la carpeta Documentos\").";

const MEDIA_RECEIVED_MESSAGE_DOCUMENT = (fileName?: string) =>
  `Documento${fileName ? ` "${fileName}"` : ""} recibido. ` +
  "Envíame un mensaje con la acción que deseas realizar " +
  "(por ejemplo: \"guárdalo en Drive en la carpeta Facturas\").";

export interface MessageHandlerOptions {
  channel: MessagingChannel;
  systemPrompt?: string;
}

export interface IncomingTextMessage {
  channel: MessagingChannel;
  chatId: string;
  userId: string;
  text: string;
}

export interface IncomingVoiceMessage {
  channel: MessagingChannel;
  chatId: string;
  userId: string;
  audioBuffer: Buffer;
  mimeType: string;
}

export async function handleMediaMessage(
  msg: IncomingMediaMessage,
  _options?: MessageHandlerOptions
): Promise<string> {
  const resolvedUserId = await resolveUserId(msg.channel, msg.chatId);
  if (!resolvedUserId) {
    return needsLinkMessage(msg.channel);
  }
  const userId = resolvedUserId;

  const pendingMedia = await createPendingMedia({
    userId,
    channel: msg.channel,
    chatId: msg.chatId,
    fileId: msg.fileId,
    fileUniqueId: msg.fileUniqueId,
    fileName: msg.fileName,
    mimeType: msg.mimeType,
    fileSize: msg.fileSize,
    mediaType: msg.mediaType,
    caption: msg.caption,
  });

  if (msg.channel === "whatsapp" && msg.mediaBuffer) {
    setCachedMediaBuffer(pendingMedia.id, msg.mediaBuffer.buffer, msg.mediaBuffer.mimeType, msg.fileName);
  }

  await logActivity({
    userId,
    source: msg.channel,
    level: "info",
    message: `Media received (${msg.channel}, ${msg.mediaType})`,
    detail: `File: ${msg.fileName ?? msg.fileId}`,
  });

  if (msg.mediaType === "photo") {
    return MEDIA_RECEIVED_MESSAGE_PHOTO;
  }
  return MEDIA_RECEIVED_MESSAGE_DOCUMENT(msg.fileName);
}

export async function handleTextMessage(
  msg: IncomingTextMessage,
  options?: MessageHandlerOptions
): Promise<string> {
  const resolvedUserId = await resolveUserId(msg.channel, msg.chatId);
  if (!resolvedUserId) {
    return needsLinkMessage(msg.channel);
  }
  const userId = resolvedUserId;

  const userKeys = await getUserApiKeys(userId);

  const missing: ("nvidia_nim" | "groq")[] = [];
  if (!userKeys.nvidiaApiKey) missing.push("nvidia_nim");

  if (missing.length > 0) {
    await logActivity({
      userId,
      source: msg.channel,
      level: "warning",
      message: "User attempted to use assistant without API keys configured",
      detail: `Missing: ${missing.join(", ")}`,
    });
    return buildMissingKeysMessage(missing);
  }

  const userPrompt = options?.systemPrompt ?? (await getUserSystemPrompt(userId)) ?? DEFAULT_SYSTEM_PROMPT;
  const basePrompt = userPrompt;
  const systemPrompt = buildProtectedSystemPrompt(basePrompt);

  const sanitizeResult = sanitizeUserMessage(msg.text);
  const userText = sanitizeResult.sanitized;

  if (sanitizeResult.wasFiltered) {
    await logActivity({
      userId,
      source: msg.channel,
      level: "warning",
      message: "Potential prompt injection detected and filtered",
      detail: `Patterns: ${sanitizeResult.filteredPatterns.join(", ")}`,
    });
  }

  const pendingMedia = await getPendingMedia(userId, msg.channel);
  const mediaContext = await buildMediaContext(pendingMedia, msg.channel);

  const enrichedUserText = mediaContext
    ? `${mediaContext}\n\n${userText}`
    : userText;

  const response = await processMessageWithTools(
    systemPrompt,
    enrichedUserText,
    userId,
    {
      nvidiaApiKey: userKeys.nvidiaApiKey!,
      nvidiaModel: userKeys.nvidiaModel,
      pendingMedia: pendingMedia ?? undefined,
      mediaResolver: pendingMedia ? getCachedMediaBuffer : undefined,
    }
  );

  if (pendingMedia) {
    await markMediaConsumed(pendingMedia.id);
    clearCachedMediaBuffer(pendingMedia.id);
  }

  await logActivity({
    userId,
    source: msg.channel,
    level: "success",
    message: `Message processed (${msg.channel})`,
    detail: userText.slice(0, 200),
  });

  return response;
}

export async function handleVoiceMessage(
  msg: IncomingVoiceMessage,
  options?: MessageHandlerOptions
): Promise<string> {
  const resolvedUserId = await resolveUserId(msg.channel, msg.chatId);
  if (!resolvedUserId) {
    return needsLinkMessage(msg.channel);
  }
  const userId = resolvedUserId;

  const userKeys = await getUserApiKeys(userId);

  const missing: ("nvidia_nim" | "groq")[] = [];
  if (!userKeys.nvidiaApiKey) missing.push("nvidia_nim");
  if (!userKeys.groqApiKey) missing.push("groq");

  if (missing.length > 0) {
    await logActivity({
      userId,
      source: msg.channel,
      level: "warning",
      message: "User attempted to send voice without API keys configured",
      detail: `Missing: ${missing.join(", ")}`,
    });
    return buildMissingKeysMessage(missing);
  }

  const userPrompt = options?.systemPrompt ?? (await getUserSystemPrompt(userId)) ?? DEFAULT_SYSTEM_PROMPT;
  const basePrompt = userPrompt;
  const systemPrompt = buildProtectedSystemPrompt(basePrompt);

  const transcription = await transcribeAudio(msg.audioBuffer, msg.mimeType, {
    apiKey: userKeys.groqApiKey!,
    model: userKeys.groqModel,
  });

  if (!transcription.trim()) {
    return "I could not transcribe the audio. The message may be silent or unclear.";
  }

  const sanitizeResult = sanitizeUserMessage(transcription);
  const userText = sanitizeResult.sanitized;

  if (sanitizeResult.wasFiltered) {
    await logActivity({
      userId,
      source: msg.channel,
      level: "warning",
      message: "Potential prompt injection detected in voice message",
      detail: `Patterns: ${sanitizeResult.filteredPatterns.join(", ")}`,
    });
  }

  const pendingMedia = await getPendingMedia(userId, msg.channel);
  const mediaContext = await buildMediaContext(pendingMedia, msg.channel);

  const enrichedUserText = mediaContext
    ? `${mediaContext}\n\n${userText}`
    : userText;

  const response = await processMessageWithTools(
    systemPrompt,
    enrichedUserText,
    userId,
    {
      nvidiaApiKey: userKeys.nvidiaApiKey!,
      nvidiaModel: userKeys.nvidiaModel,
      pendingMedia: pendingMedia ?? undefined,
      mediaResolver: pendingMedia ? getCachedMediaBuffer : undefined,
    }
  );

  if (pendingMedia) {
    await markMediaConsumed(pendingMedia.id);
    clearCachedMediaBuffer(pendingMedia.id);
  }

  await logActivity({
    userId,
    source: msg.channel,
    level: "success",
    message: `Voice message processed (${msg.channel})`,
    detail: userText.slice(0, 200),
  });

  return response;
}

export function buildUserErrorMessage(error: unknown): string {
  if (error instanceof NvidiaError) {
    switch (error.kind) {
      case "timeout":
        return "The AI model took too long to respond. Please try again with a shorter message.";
      case "rate_limit":
        return "The AI service is busy right now (rate limit). Please wait a moment and try again.";
      case "auth":
        return "Tu API key de NVIDIA no es valida o ha expirado. Ve a https://killaassistant.vercel.app/apis para actualizarla.";
      case "server":
        return "The AI service is experiencing issues. Please try again shortly.";
      case "network":
        return "Could not reach the AI service due to a network issue. Please try again.";
      default:
        return "An error occurred while generating a response. Please try again.";
    }
  }

  if (error instanceof GroqError) {
    switch (error.kind) {
      case "timeout":
        return "Audio transcription took too long. Please try a shorter voice message.";
      case "rate_limit":
        return "The transcription service is busy right now. Please wait and try again.";
      case "auth":
        return "Tu API key de Groq no es valida o ha expirado. Ve a https://killaassistant.vercel.app/apis para actualizarla.";
      case "server":
        return "The transcription service is experiencing issues. Please try again shortly.";
      case "network":
        return "Could not reach the transcription service. Please try again.";
      default:
        return "Could not transcribe the audio. Please try again.";
    }
  }

  return "A temporary error occurred. Please try again in a moment.";
}

const mediaBufferCache = new Map<string, { buffer: Buffer; mimeType: string; fileName?: string }>();

export function getCachedMediaBuffer(mediaId: string): { buffer: Buffer; mimeType: string; fileName?: string } | undefined {
  return mediaBufferCache.get(mediaId);
}

export function clearCachedMediaBuffer(mediaId: string): void {
  mediaBufferCache.delete(mediaId);
}

export function setCachedMediaBuffer(mediaId: string, buffer: Buffer, mimeType: string, fileName?: string): void {
  mediaBufferCache.set(mediaId, { buffer, mimeType, fileName });
}

async function buildMediaContext(
  pendingMedia: PendingMedia | null,
  channel: MessagingChannel
): Promise<string | null> {
  if (!pendingMedia) return null;

  if (channel === "telegram") {
    try {
      const downloaded = await downloadMediaMessage(pendingMedia.fileId);
      mediaBufferCache.set(pendingMedia.id, downloaded);
    } catch {
      return null;
    }
  }

  // WhatsApp media is already cached when the message arrived (set in handleMediaMessage)

  const parts: string[] = [
    `[PENDING FILE — media_id: ${pendingMedia.id}]`,
    `Type: ${pendingMedia.mediaType}`,
  ];
  if (pendingMedia.fileName) parts.push(`Name: ${pendingMedia.fileName}`);
  if (pendingMedia.mimeType) parts.push(`MIME: ${pendingMedia.mimeType}`);
  if (pendingMedia.fileSize) parts.push(`Size: ${pendingMedia.fileSize} bytes`);
  if (pendingMedia.caption) parts.push(`Caption: ${pendingMedia.caption}`);
  parts.push("Use the drive_upload_file tool with media_id='" + pendingMedia.id + "' if the user wants to save this file to Google Drive.");

  return parts.join("\n");
}
