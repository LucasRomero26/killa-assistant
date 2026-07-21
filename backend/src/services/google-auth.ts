import { google } from "googleapis";
import type { Auth } from "googleapis";
import { env } from "../config/env.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { supabaseAdmin } from "../config/supabase.js";

type OAuth2Client = Auth.OAuth2Client;

const LIGHT_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
];

const VIP_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
];

export function createOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(state: string, vip: boolean = false): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: vip ? VIP_SCOPES : LIGHT_SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}


export async function storeGoogleCredentials(userId: string, tokens: Auth.Credentials) {
  const encryptedAccess = tokens.access_token ? encrypt(tokens.access_token) : null;
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  const { error } = await supabaseAdmin
    .from("credenciales_google")
    .upsert({
      user_id: userId,
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh,
      token_type: tokens.token_type ?? "Bearer",
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      scope: tokens.scope,
      calendar_connected: true,
      drive_connected: true,
    });

  if (error) throw new Error(`Failed to store Google credentials: ${error.message}`);
}

export interface GoogleConnectionStatus {
  connected: boolean;
  calendar_connected: boolean;
  drive_connected: boolean;
  has_refresh_token: boolean;
  expiry_date: string | null;
}

export async function getGoogleConnectionStatus(userId: string): Promise<GoogleConnectionStatus> {
  const { data, error } = await supabaseAdmin
    .from("credenciales_google")
    .select("calendar_connected, drive_connected, refresh_token_encrypted, expiry_date")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return {
      connected: false,
      calendar_connected: false,
      drive_connected: false,
      has_refresh_token: false,
      expiry_date: null,
    };
  }

  const connected = Boolean(data.calendar_connected || data.drive_connected);
  return {
    connected,
    calendar_connected: data.calendar_connected,
    drive_connected: data.drive_connected,
    has_refresh_token: Boolean(data.refresh_token_encrypted),
    expiry_date: data.expiry_date,
  };
}

async function persistRefreshedTokens(
  userId: string,
  rowId: string,
  credentials: Auth.Credentials
): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (credentials.access_token) {
    updates.access_token_encrypted = encrypt(credentials.access_token);
  }
  if (credentials.refresh_token) {
    updates.refresh_token_encrypted = encrypt(credentials.refresh_token);
  }
  if (credentials.expiry_date) {
    updates.expiry_date = new Date(credentials.expiry_date).toISOString();
  }
  if (credentials.token_type) {
    updates.token_type = credentials.token_type;
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabaseAdmin
    .from("credenciales_google")
    .update(updates)
    .eq("id", rowId);

  if (error) {
    console.error("Failed to persist refreshed Google tokens:", error.message);
  }
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("credenciales_google")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to disconnect Google: ${error.message}`);
  }
}

export async function getOAuthClientForUser(userId: string): Promise<OAuth2Client | null> {
  const { data, error } = await supabaseAdmin
    .from("credenciales_google")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const client = createOAuthClient();

  if (data.access_token_encrypted) {
    client.setCredentials({
      access_token: decrypt(data.access_token_encrypted),
      refresh_token: data.refresh_token_encrypted ? decrypt(data.refresh_token_encrypted) : undefined,
      token_type: data.token_type,
      expiry_date: data.expiry_date ? new Date(data.expiry_date).getTime() : undefined,
    });
  } else if (data.refresh_token_encrypted) {
    client.setCredentials({
      refresh_token: decrypt(data.refresh_token_encrypted),
    });
  } else {
    return null;
  }

  client.on("tokens", (newTokens: Auth.Credentials) => {
    persistRefreshedTokens(userId, data.id, newTokens).catch((err) => {
      console.error("Token refresh persistence failed:", err);
    });
  });

  return client;
}

export async function getUserGrantedScopes(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("credenciales_google")
    .select("scope")
    .eq("user_id", userId)
    .single();

  if (!data?.scope) return [];
  return data.scope.split(" ").filter(Boolean);
}

export function hasRestrictedDriveScope(grantedScopes: string[]): boolean {
  return grantedScopes.some(
    (s) => s === "https://www.googleapis.com/auth/drive"
  );
}
