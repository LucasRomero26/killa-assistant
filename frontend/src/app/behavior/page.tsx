export const dynamic = "force-dynamic";

import { AppShell } from "@/components/AppShell";
import { BehaviorForm } from "@/components/BehaviorForm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export default async function BehaviorPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell title="Behavior">
      <div className="mb-2">
        <h3 className="font-sans font-xl text-text-primary mb-1">
          Behavior
        </h3>
        <p className="text-sm text-text-secondary">
          Configure the personality and behavior of your assistant.
        </p>
      </div>
      <BehaviorForm userId={user.id} />
    </AppShell>
  );
}
