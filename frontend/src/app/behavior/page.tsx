export const dynamic = "force-dynamic";

import { AppShell } from "@/components/AppShell";
import { pageMetadata } from "@/lib/metadata";
import { BehaviorForm } from "@/components/BehaviorForm";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const metadata = pageMetadata({
  title: "Behavior",
  description:
    "Shape how KillaAssistant talks and what it does with your notes: a custom system prompt, when it responds, and how it formats and summarizes notes.",
  path: "/behavior",
  index: false,
});

export default async function BehaviorPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppShell
      title="Behavior"
      description="Shape how the assistant talks and what it does with your notes."
    >
      <BehaviorForm userId={session.user.id} />
    </AppShell>
  );
}
