import { supabaseAdmin } from "../config/supabase.js";
import type {
  MessagingChannel,
  PendingMedia,
  PendingMediaType,
} from "../types/index.js";

const PENDING_MEDIA_TABLE = "pending_media";

interface PendingMediaRow {
  id: string;
  user_id: string;
  channel: MessagingChannel;
  chat_id: string;
  file_id: string;
  file_unique_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  media_type: PendingMediaType;
  caption: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

function rowToPendingMedia(row: PendingMediaRow): PendingMedia {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel,
    chatId: row.chat_id,
    fileId: row.file_id,
    fileUniqueId: row.file_unique_id ?? undefined,
    fileName: row.file_name ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    mediaType: row.media_type,
    caption: row.caption ?? undefined,
    status: row.status as "pending" | "consumed",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export interface CreatePendingMediaParams {
  userId: string;
  channel: MessagingChannel;
  chatId: string;
  fileId: string;
  fileUniqueId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  mediaType: PendingMediaType;
  caption?: string;
}

export async function createPendingMedia(
  params: CreatePendingMediaParams
): Promise<PendingMedia> {
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  const { error } = await supabaseAdmin
    .from(PENDING_MEDIA_TABLE)
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
    })
    .eq("user_id", params.userId)
    .eq("channel", params.channel)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to invalidate previous pending media: ${error.message}`);
  }

  const { data, error: insertError } = await supabaseAdmin
    .from(PENDING_MEDIA_TABLE)
    .insert({
      user_id: params.userId,
      channel: params.channel,
      chat_id: params.chatId,
      file_id: params.fileId,
      file_unique_id: params.fileUniqueId ?? null,
      file_name: params.fileName ?? null,
      mime_type: params.mimeType ?? null,
      file_size: params.fileSize ?? null,
      media_type: params.mediaType,
      caption: params.caption ?? null,
      status: "pending",
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (insertError || !data) {
    throw new Error(`Failed to create pending media: ${insertError?.message ?? "no data"}`);
  }

  return rowToPendingMedia(data as PendingMediaRow);
}

export async function getPendingMedia(
  userId: string,
  channel: MessagingChannel
): Promise<PendingMedia | null> {
  await cleanupExpiredMedia(userId);

  const { data, error } = await supabaseAdmin
    .from(PENDING_MEDIA_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return rowToPendingMedia(data as PendingMediaRow);
}

export async function markMediaConsumed(mediaId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(PENDING_MEDIA_TABLE)
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
    })
    .eq("id", mediaId);

  if (error) {
    throw new Error(`Failed to mark media as consumed: ${error.message}`);
  }
}

export async function cleanupExpiredMedia(userId?: string): Promise<void> {
  let query = supabaseAdmin
    .from(PENDING_MEDIA_TABLE)
    .delete()
    .lt("expires_at", new Date().toISOString());

  if (userId) {
    query = query.eq("user_id", userId);
  }

  await query;
}
