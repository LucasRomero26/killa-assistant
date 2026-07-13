import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getBackendUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Server-side route that initiates the Google OAuth flow.
 * It calls the backend `/api/auth/google` endpoint with the JWT
 * obtained from the Supabase session. The backend signs and returns
 * the OAuth URL, and we redirect the browser to Google's consent screen.
 *
 * This replaces the previous flow that passed `?userId=<uuid>` in the
 * URL (insecure since the backend now requires a JWT Bearer token).
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${getBackendUrl()}/api/auth/google`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      redirect: "manual",
      cache: "no-store",
    });

    if (res.status !== 302) {
      return NextResponse.json(
        { error: "Failed to start OAuth flow" },
        { status: 500 }
      );
    }

    const oauthUrl = res.headers.get("location");
    if (!oauthUrl) {
      return NextResponse.json(
        { error: "No OAuth URL returned from backend" },
        { status: 500 }
      );
    }

    return NextResponse.redirect(oauthUrl);
  } catch {
    return NextResponse.json(
      { error: "Backend unreachable" },
      { status: 502 }
    );
  }
}
