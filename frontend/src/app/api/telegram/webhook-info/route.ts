import { requireAdmin } from "@/server/http/auth";
import { json, serverError } from "@/server/http/responses";
import { getWebhookInfo } from "@/server/services/telegram";

export const dynamic = "force-dynamic";

/** Operator-only: inspect the webhook Telegram currently has registered. */
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    return json(await getWebhookInfo());
  } catch (error) {
    return serverError((error as Error).message);
  }
}
