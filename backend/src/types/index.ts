export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
  photo?: TelegramPhoto[];
  document?: TelegramDocument;
  caption?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type: string;
  file_size?: number;
}

export interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export type PendingMediaType = "photo" | "document";

export interface TelegramFileResponse {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export type LogSource = "telegram" | "calendar" | "drive" | "nvidia_nim" | "groq" | "system";
export type LogLevel = "info" | "warning" | "error" | "success";

export type MessagingChannel = "telegram";

export interface IncomingMessage {
  channel: MessagingChannel;
  userId: string;
  chatId: string;
  text?: string;
  voice?: {
    buffer: Buffer;
    mimeType: string;
  };
  raw: unknown;
}

export interface MessagingProvider {
  readonly channel: MessagingChannel;
  sendMessage(chatId: string, text: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
}

export interface PendingMedia {
  id: string;
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
  status: "pending" | "consumed";
  createdAt: string;
  expiresAt: string;
}

export interface IncomingMediaMessage {
  channel: MessagingChannel;
  chatId: string;
  userId: string;
  mediaType: PendingMediaType;
  fileId: string;
  fileUniqueId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  caption?: string;
}
