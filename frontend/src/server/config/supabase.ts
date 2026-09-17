import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

const supabaseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client: bypasses RLS, server-side only. Created lazily so
 * importing a service module never requires the secrets to be present.
 */
function getAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, supabaseOptions);
  }
  return adminClient;
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getAdmin();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
