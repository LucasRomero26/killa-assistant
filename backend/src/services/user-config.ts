import { supabaseAdmin } from "../config/supabase.js";

export async function getUserSystemPrompt(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("configuraciones_bot")
    .select("system_prompt")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const prompt = data.system_prompt?.trim();
  return prompt && prompt.length > 0 ? prompt : null;
}
