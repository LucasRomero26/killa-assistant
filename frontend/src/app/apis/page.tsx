export const dynamic = "force-dynamic";

import { AppShell } from "@/components/AppShell";
import { ApiConfigForm } from "@/components/ApiConfigForm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export default async function ApisPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell title="APIs">
      <div className="mb-2">
        <h3 className="font-sans font-xl text-text-primary mb-1">
          AI APIs
        </h3>
        <p className="text-sm text-text-secondary">
          API keys are encrypted (AES-256-GCM).
        </p>
      </div>
      <ApiConfigForm userId={user.id} />
    </AppShell>
  );
}
