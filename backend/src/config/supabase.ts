import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { env } from "./env.js";

const supabaseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: ws as unknown as never,
  },
};

// Admin client: bypasses RLS, for server-side operations only
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseOptions
);

// Anon client: respects RLS, for user-scoped operations
export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  supabaseOptions
);
