import { handleGoogleOAuthCallback } from "@/server/handlers/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGoogleOAuthCallback(request);
}
