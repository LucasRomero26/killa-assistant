import { getSessionUserId } from "@/server/http/auth";
import { startGoogleOAuth } from "@/server/handlers/google-oauth";

export const dynamic = "force-dynamic";

/** Starts the Google OAuth flow for the signed-in user (redirects to Google). */
export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", "/connections");
    return Response.redirect(login, 302);
  }
  return startGoogleOAuth(userId);
}
