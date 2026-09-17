import { getSessionUserId } from "@/server/http/auth";
import { json, unauthorized, serverError } from "@/server/http/responses";
import { getTelegramLinkStatus } from "@/server/services/telegram-link";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  try {
    return json(await getTelegramLinkStatus(userId));
  } catch (error) {
    return serverError((error as Error).message);
  }
}
