export const dynamic = "force-dynamic";

import { AppShell } from "@/components/AppShell";
import { ApiConfigForm } from "@/components/ApiConfigForm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export default async function ApisPage() {
  const supabase = await createSupabaseServerClient();
  // getSession() parses the cookie locally; the middleware already validated
  // it, and every proxied request re-verifies the JWT on the backend.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppShell
      title="AI APIs"
      description="Bring your own keys. They are encrypted with AES-256-GCM and only decrypted at inference time."
    >
      <ApiConfigForm userId={session.user.id} />
    </AppShell>
  );
}
