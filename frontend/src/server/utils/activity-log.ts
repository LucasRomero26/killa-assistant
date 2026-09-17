import { supabaseAdmin } from "../config/supabase";
import type { LogSource, LogLevel } from "../types/index";

interface LogActivityParams {
  userId: string;
  source: LogSource;
  level?: LogLevel;
  message: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("logs_actividad").insert({
      user_id: params.userId,
      source: params.source,
      level: params.level ?? "info",
      message: params.message,
      detail: params.detail,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.error("Failed to log activity:", error.message);
    }
  } catch (err) {
    console.error("Activity logging threw:", err);
  }
}
