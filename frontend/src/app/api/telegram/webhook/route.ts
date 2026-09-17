import { requireAdmin } from "@/server/http/auth";
import { json, serverError } from "@/server/http/responses";
import { deleteWebhook } from "@/server/services/telegram";

export const dynamic = "force-dynamic";

/** Operator-only: remove the Telegram webhook. */
export async function DELETE(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    await deleteWebhook();
    return json({ ok: true, message: "Webhook deleted" });
  } catch (error) {
    return serverError((error as Error).message);
  }
}
