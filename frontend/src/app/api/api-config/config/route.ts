import { supabaseAdmin } from "@/server/config/supabase";
import { encrypt } from "@/server/utils/crypto";
import { logActivity } from "@/server/utils/activity-log";
import { getSessionUserId } from "@/server/http/auth";
import { json, unauthorized, badRequest, serverError, readJson } from "@/server/http/responses";

export const dynamic = "force-dynamic";

const VALID_PROVIDERS = ["nvidia_nim", "groq"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(value: unknown): value is Provider {
  return typeof value === "string" && (VALID_PROVIDERS as readonly string[]).includes(value);
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from("configuraciones_api")
    .select("provider, api_key_encrypted, model, is_enabled, last_tested_at, last_test_status")
    .eq("user_id", userId);

  if (error) return serverError(error.message);

  // Never return the ciphertext; the client only needs to know a key exists.
  const sanitized = (data ?? []).map((row: Record<string, unknown>) => ({
    provider: row.provider,
    has_key: Boolean(row.api_key_encrypted),
    model: row.model,
    is_enabled: row.is_enabled,
    last_tested_at: row.last_tested_at,
    last_test_status: row.last_test_status,
  }));

  return json(sanitized);
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const body = await readJson<{
    provider?: string;
    api_key?: string;
    model?: string;
    is_enabled?: boolean;
  }>(request);

  if (!body || !isValidProvider(body.provider)) return badRequest("Invalid provider");

  const apiKey = (body.api_key ?? "").trim();
  if (!apiKey) return badRequest("Missing api_key");

  const { error } = await supabaseAdmin.from("configuraciones_api").upsert({
    user_id: userId,
    provider: body.provider,
    api_key_encrypted: encrypt(apiKey),
    model: body.model ?? null,
    is_enabled: body.is_enabled ?? true,
  });

  if (error) return serverError(error.message);

  await logActivity({
    userId,
    source: "system",
    level: "success",
    message: `API key updated for provider: ${body.provider}`,
  });

  return json({ ok: true, message: "API key saved (encrypted)" });
}

export async function DELETE(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const body = await readJson<{ provider?: string }>(request);
  const provider = new URL(request.url).searchParams.get("provider") ?? body?.provider;
  if (!isValidProvider(provider)) return badRequest("Invalid provider");

  const { error } = await supabaseAdmin
    .from("configuraciones_api")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  if (error) return serverError(error.message);

  await logActivity({
    userId,
    source: "system",
    level: "success",
    message: `API key deleted for provider: ${provider}`,
  });

  return json({ ok: true, message: "API key deleted" });
}
