import crypto from "crypto";
import { supabaseAdmin } from "../config/supabase.js";

const TOKEN_PREFIX = "KILLA-";
const TOKEN_LENGTH = 6;
const TOKEN_TTL_MINUTES = 10;

export interface LinkTokenResult {
  token: string;
  botCommand: string;
}

export async function createWhatsAppLinkToken(userId: string): Promise<LinkTokenResult> {
  const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789";
  let token = TOKEN_PREFIX;
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += chars[crypto.randomInt(0, chars.length)];
  }

  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabaseAdmin
    .from("whatsapp_link_tokens")
    .insert({
      token,
      user_id: userId,
      status: "pending",
      expires_at: expiresAt,
    });

  if (error) {
    throw new Error(`Failed to create WhatsApp link token: ${error.message}`);
  }

  return { token, botCommand: `/start ${token}` };
}

export interface ConsumeWhatsAppTokenResult {
  success: boolean;
  error?: string;
  userId?: string;
}

export async function consumeWhatsAppLinkToken(
  token: string,
  chatId: string
): Promise<ConsumeWhatsAppTokenResult> {
  // Atomic claim: UPDATE ... WHERE token = ? AND status = 'pending'
  // This prevents race conditions where two concurrent requests with the
  // same token both pass the SELECT check and both proceed to link.
  // Only the first request will get count > 0; the second gets count = 0.
  const { data: claimData, count, error: claimError } = await supabaseAdmin
    .from("whatsapp_link_tokens")
    .update({
      status: "linked",
      chat_id: chatId,
      used_at: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id, user_id")
    .single<{ id: string; user_id: string }>();

  if (claimError || count === 0) {
    // Distinguish why the claim failed: token doesn't exist vs already
    // used/expired. We do a SELECT to classify the error.
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_link_tokens")
      .select("status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: "invalid_token" };
    }
    if (existing.status !== "pending") {
      return { success: false, error: "already_used" };
    }
    if (new Date(existing.expires_at) < new Date()) {
      return { success: false, error: "expired" };
    }
    return { success: false, error: "db_error" };
  }

  // Claim succeeded — now update the messaging connection
  const { error: updateConnError } = await supabaseAdmin
    .from("conexiones_mensajeria")
    .update({
      status: "connected",
      chat_id: chatId,
      connected_at: new Date().toISOString(),
    })
    .eq("user_id", claimData!.user_id)
    .eq("channel", "whatsapp");

  if (updateConnError) {
    return { success: false, error: "db_error" };
  }

  return { success: true, userId: claimData!.user_id };
}

export async function getUserIdByWhatsAppChatId(chatId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("conexiones_mensajeria")
    .select("user_id")
    .eq("channel", "whatsapp")
    .eq("chat_id", chatId)
    .eq("status", "connected")
    .single();

  if (error || !data) {
    return null;
  }

  return data.user_id;
}

export async function getWhatsAppLinkStatus(userId: string): Promise<{
  linked: boolean;
  chatId: string | null;
}> {
  const { data, error } = await supabaseAdmin
    .from("conexiones_mensajeria")
    .select("chat_id, status")
    .eq("user_id", userId)
    .eq("channel", "whatsapp")
    .single();

  if (error || !data) {
    return { linked: false, chatId: null };
  }

  return {
    linked: data.status === "connected" && Boolean(data.chat_id),
    chatId: data.chat_id,
  };
}

export async function unlinkWhatsApp(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("conexiones_mensajeria")
    .update({
      status: "disconnected",
      chat_id: null,
      connected_at: null,
    })
    .eq("user_id", userId)
    .eq("channel", "whatsapp");

  if (error) {
    throw new Error(`Failed to unlink WhatsApp: ${error.message}`);
  }
}
