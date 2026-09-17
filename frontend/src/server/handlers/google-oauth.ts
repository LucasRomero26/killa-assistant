import { env } from "../config/env";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  storeGoogleCredentials,
  getGoogleConnectionStatus,
  getUserGrantedScopes,
} from "../services/google-auth";
import { signState, verifyState } from "../utils/oauth-state";
import { logActivity } from "../utils/activity-log";
import { isUserVip } from "../services/user-vip";

const VIP_SCOPE_SET = new Set([
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
]);

function hasAllVipScopes(granted: string[]): boolean {
  if (granted.length === 0) return false;
  return [...VIP_SCOPE_SET].every((s) => granted.includes(s));
}

/**
 * Build the redirect to Google's consent screen for a signed-in user.
 *
 * VIP users are granted restricted scopes (calendar + drive); everyone else
 * gets light scopes (calendar.events + drive.file) which don't trigger the
 * Google unverified-app screen.
 *
 * `prompt: "consent"` is forced ONLY when the user has no credentials yet
 * (first connection) or is VIP but missing a restricted scope (upgrade path).
 * Otherwise `select_account` is used so Google keeps the existing
 * refresh_token (it only issues a new one on the first consent).
 */
export async function startGoogleOAuth(userId: string): Promise<Response> {
  const vip = await isUserVip(userId);
  const status = await getGoogleConnectionStatus(userId);
  const grantedScopes = await getUserGrantedScopes(userId);

  let forceConsent = false;
  if (!status.connected || !status.has_refresh_token) {
    forceConsent = true;
  } else if (vip && !hasAllVipScopes(grantedScopes)) {
    forceConsent = true;
  }

  const state = signState(userId);
  const url = getAuthUrl(state, vip, forceConsent);

  console.info("Starting Google OAuth flow", { userId, vip, forceConsent });
  return Response.redirect(url, 302);
}

export async function handleGoogleOAuthCallback(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const error = query.get("error");
  const code = query.get("code");
  const state = query.get("state");

  if (error) {
    console.warn("Google OAuth user denied consent", { error });
    return Response.json({ error: "Consent denied", detail: error }, { status: 403 });
  }

  if (!code || !state) {
    return Response.json({ error: "Missing code or state" }, { status: 400 });
  }

  const userId = verifyState(state);
  if (!userId) {
    console.warn("Google OAuth callback: invalid or expired state");
    return Response.json({ error: "Invalid or expired state" }, { status: 403 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const status = await getGoogleConnectionStatus(userId);

    if (!tokens.refresh_token) {
      // Expected when the user had already consented and we used
      // `select_account`: Google returns no new refresh_token and
      // storeGoogleCredentials preserves the stored one.
      console.warn("Google OAuth: no refresh_token returned — preserving any previously stored token", {
        userId,
        hadRefreshBefore: status.has_refresh_token,
      });
    }

    await storeGoogleCredentials(userId, tokens);
    await logActivity({
      userId,
      source: "system",
      level: "success",
      message: "Google account linked successfully (Calendar + Drive)",
    });

    console.info("Google OAuth completed successfully", { userId });
    return Response.redirect(env.OAUTH_SUCCESS_REDIRECT_URL, 302);
  } catch (err) {
    console.error("Google OAuth token exchange failed", { err, userId });
    await logActivity({
      userId,
      source: "system",
      level: "error",
      message: "Failed to link Google account",
      detail: (err as Error).message,
    });
    return Response.json({ error: "Failed to link Google account" }, { status: 500 });
  }
}
