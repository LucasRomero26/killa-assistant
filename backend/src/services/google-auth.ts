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

/**
 * Build the Google OAuth consent URL.
 *
 * `forceConsent` controls the `prompt` parameter:
 *  - `true`  → `prompt: "consent"` forces Google to show the consent screen
 *              AND return a brand-new refresh_token. This is required when
 *              upgrading a user from light scopes to VIP scopes (Google will
 *              not otherwise re-prompt for the new restricted scopes).
 *  - `false` → `prompt: "select_account"` just asks which account to use,
 *              preserving any previously granted offline access (and thus
 *              the existing refresh_token). This is what we want for users
 *              who already consented to the same scopes.
 *
 * Using `consent` blindly for every flow is what previously destroyed
 * refresh_tokens: Google only returns a new refresh_token on the first
 * consent, so a re-consent that doesn't return one would null-out the
 * stored token via the upsert. See `storeGoogleCredentials` for the
 * defensive fix that preserves the prior refresh token regardless.
 */
export function getAuthUrl(
  state: string,
  vip: boolean = false,
  forceConsent: boolean = false
): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: vip ? VIP_SCOPES : LIGHT_SCOPES,
    prompt: forceConsent ? "consent" : "select_account",
    include_granted_scopes: true,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}


/**
 * Store tokens returned by the Google OAuth callback.
 *
 * IMPORTANT: Google only returns a `refresh_token` the FIRST time a user
 * consents to offline access (or when they revoke + re-consent). On subsequent
 * re-authorizations the callback receives `refresh_token: undefined`.
 *
 * If we blindly upsert `refresh_token_encrypted: null` we destroy a perfectly
 * valid refresh token that was previously stored. This function therefore
 * MERGES with the existing row: it never nulls-out the refresh token unless a
 * new one is explicitly provided.
 */
export async function storeGoogleCredentials(userId: string, tokens: Auth.Credentials) {
  const encryptedAccess = tokens.access_token ? encrypt(tokens.access_token) : null;
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  // Fetch the existing row so we can preserve a previously stored refresh token
  // when Google does not return a new one (the common re-consent case).
  const { data: existing } = await supabaseAdmin
    .from("credenciales_google")
    .select("refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  const refreshToStore =
    encryptedRefresh ?? (existing?.refresh_token_encrypted ?? null);

  const { error } = await supabaseAdmin
    .from("credenciales_google")
    .upsert({
      user_id: userId,
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: refreshToStore,
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

/**
 * Disconnect a user's Google account.
 *
 * Two things must happen here for a clean Disconnect:
 *  1. Revoke the OAuth tokens at Google so any cached access_token stops
 *     working immediately (https://oauth2.googleapis.com/revoke?token=...).
 *  2. Delete the row from `credenciales_google` so the user can re-connect
 *     fresh from the dashboard.
 *
 * If Google revocation fails (token already expired, revoked by the user
 * directly at myaccount.google.com/permissions, network blip, …) we still
 * delete the local row — the user's intent is to disconnect, and forcing them
 * to re-revoke at Google's dashboard would be a poor UX. We just log.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  // Fetch the access + refresh tokens so we can revoke them at Google.
  const { data } = await supabaseAdmin
    .from("credenciales_google")
    .select("access_token_encrypted, refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  const accessToken = data?.access_token_encrypted
    ? decrypt(data.access_token_encrypted)
    : null;
  const refreshToken = data?.refresh_token_encrypted
    ? decrypt(data.refresh_token_encrypted)
    : null;

  // Google's revocation endpoint accepts either the access_token or the
  // refresh_token and works over plain HTTP POST with no auth header.
  const tokenToRevoke = accessToken ?? refreshToken;
  if (tokenToRevoke) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
    } catch (err) {
      // Non-fatal: proceed to delete the local row anyway.
      console.warn("Google token revocation failed (non-fatal):", (err as Error).message);
    }
  }

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
