import { getSessionUserId } from "@/server/http/auth";
import { json, unauthorized, serverError } from "@/server/http/responses";
import { createLinkToken } from "@/server/services/telegram-link";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  try {
    return json(await createLinkToken(userId));
  } catch (error) {
    console.error("Failed to create Telegram link token", error);
    return serverError((error as Error).message);
  }
}
