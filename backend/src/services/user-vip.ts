import { supabaseAdmin } from "../config/supabase.js";

export async function isUserVip(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("usuarios")
    .select("is_vip")
    .eq("id", userId)
    .single();

  return Boolean(data?.is_vip);
}
