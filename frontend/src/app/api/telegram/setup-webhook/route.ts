import { env } from "@/server/config/env";
import { requireAdmin } from "@/server/http/auth";
import { json, serverError } from "@/server/http/responses";
import { setWebhook } from "@/server/services/telegram";

export const dynamic = "force-dynamic";

/** Operator-only: point the Telegram bot at this deployment's webhook. */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    await setWebhook(env.TELEGRAM_WEBHOOK_URL, env.TELEGRAM_WEBHOOK_SECRET);
    return json({ ok: true, webhookUrl: env.TELEGRAM_WEBHOOK_URL });
  } catch (error) {
    console.error("Failed to set Telegram webhook", error);
    return serverError((error as Error).message);
  }
}
