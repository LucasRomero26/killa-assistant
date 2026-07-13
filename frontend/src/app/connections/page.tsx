export const dynamic = "force-dynamic";

import { AppShell } from "@/components/AppShell";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getBackendUrl } from "@/lib/api";
import { redirect } from "next/navigation";
import { ConnectionsClient } from "@/components/ConnectionsClient";

interface GoogleStatus {
  connected: boolean;
  calendar_connected: boolean;
  drive_connected: boolean;
  has_refresh_token: boolean;
  expiry_date: string | null;
}

async function getGoogleStatus(accessToken: string): Promise<GoogleStatus | null> {
  try {
    const res = await fetch(
      `${getBackendUrl()}/api/auth/google/status`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as GoogleStatus;
  } catch {
    return null;
  }
}

export default async function ConnectionsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const googleStatus = session.access_token
    ? await getGoogleStatus(session.access_token)
    : null;

  const googleConnected = googleStatus?.connected ?? false;
  const googleOAuthUrl = `/api/auth/google-redirect`;

  return (
    <AppShell title="Connections">
      <div className="mb-2">
        <h3 className="font-sans font-xl text-text-primary mb-1">
          Services
        </h3>
        <p className="text-sm text-text-secondary">
          Connect your account with external providers.
        </p>
      </div>

      <ConnectionsClient
        googleConnected={googleConnected}
        googleCalendarConnected={googleStatus?.calendar_connected ?? false}
        googleDriveConnected={googleStatus?.drive_connected ?? false}
        googleOAuthUrl={googleOAuthUrl}
      />
    </AppShell>
  );
}
