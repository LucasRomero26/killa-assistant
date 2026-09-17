import { getSessionUserId } from "@/server/http/auth";
import { json, unauthorized, serverError } from "@/server/http/responses";
import { disconnectGoogle } from "@/server/services/google-auth";
import { logActivity } from "@/server/utils/activity-log";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  try {
    await disconnectGoogle(userId);
    await logActivity({
      userId,
      source: "system",
      level: "success",
      message: "Google account disconnected (Calendar + Drive)",
    });
    return json({ ok: true, message: "Google account disconnected" });
  } catch (error) {
    console.error("Failed to disconnect Google account", { error, userId });
    return serverError("Failed to disconnect Google account");
  }
}
