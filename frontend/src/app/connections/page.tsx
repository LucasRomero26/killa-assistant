import { AppShell } from "@/components/AppShell";
import { ConnectionsClient } from "@/components/ConnectionsClient";

// The middleware guards this route; statuses load client-side so the shell
// paints immediately instead of waiting on the backend.
export default function ConnectionsPage() {
  return (
    <AppShell
      title="Connections"
      description="Link Telegram and grant Google access so the assistant can manage your calendar and files."
    >
      <ConnectionsClient googleOAuthUrl="/api/auth/google-redirect" />
    </AppShell>
  );
}
