import { AppShell } from "@/components/AppShell";
import { pageMetadata } from "@/lib/metadata";
import { ConnectionsClient } from "@/components/ConnectionsClient";

export const metadata = pageMetadata({
  title: "Connections",
  description:
    "Link your Telegram account and grant Google Calendar and Drive access so KillaAssistant can manage your events and files.",
  path: "/connections",
  index: false,
});

// The middleware guards this route; statuses load client-side so the shell
// paints immediately instead of waiting on the backend.
export default function ConnectionsPage() {
  return (
    <AppShell
      title="Connections"
      description="Link Telegram and grant Google access so the assistant can manage your calendar and files."
    >
      <ConnectionsClient googleOAuthUrl="/api/auth/google" />
    </AppShell>
  );
}
