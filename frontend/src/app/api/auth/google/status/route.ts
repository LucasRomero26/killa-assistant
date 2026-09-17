import { getSessionUserId } from "@/server/http/auth";
import { json, unauthorized } from "@/server/http/responses";
import { getGoogleConnectionStatus } from "@/server/services/google-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();
  return json(await getGoogleConnectionStatus(userId));
}
