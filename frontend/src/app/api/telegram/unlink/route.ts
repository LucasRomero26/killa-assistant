import { getSessionUserId } from "@/server/http/auth";
import { json, unauthorized, serverError } from "@/server/http/responses";
import { unlinkTelegram } from "@/server/services/telegram-link";
import { logActivity } from "@/server/utils/activity-log";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  try {
    await unlinkTelegram(userId);
    await logActivity({
      userId,
      source: "telegram",
      level: "success",
      message: "Telegram account unlinked",
    });
    return json({ ok: true, message: "Telegram unlinked" });
  } catch (error) {
    console.error("Failed to unlink Telegram", error);
    return serverError((error as Error).message);
  }
}
