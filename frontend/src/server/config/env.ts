import { z } from "zod";

/**
 * Server-side environment. Parsed lazily on first access so `next build`
 * can import server modules without every secret being present, and so a
 * misconfiguration surfaces as a clear error from the request that needs
 * it instead of crashing the whole app at import time.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Public origin of this deployment. Used to derive the Telegram webhook URL
  // and the Google OAuth redirect URI when they are not set explicitly.
  APP_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_MODEL: z.string().default("meta/llama-3.1-70b-instruct"),

  GROQ_API_KEY: z.string().optional(),
  GROQ_WHISPER_MODEL: z.string().default("whisper-large-v3"),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_URL: z.string().url(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  OAUTH_SUCCESS_REDIRECT_URL: z.string().url(),

  ENCRYPTION_KEY: z.string().length(64),

  // Operator-only token for privileged endpoints (Telegram webhook setup).
  ADMIN_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function resolveAppUrl(): string | undefined {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return undefined;
}

function loadEnv(): Env {
  const appUrl = resolveAppUrl();
  const raw = {
    ...process.env,
    APP_URL: appUrl,
    SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    TELEGRAM_WEBHOOK_URL:
      process.env.TELEGRAM_WEBHOOK_URL ?? (appUrl ? `${appUrl}/api/webhooks/telegram` : undefined),
    GOOGLE_REDIRECT_URI:
      process.env.GOOGLE_REDIRECT_URI ?? (appUrl ? `${appUrl}/api/auth/callback/google` : undefined),
    OAUTH_SUCCESS_REDIRECT_URL:
      process.env.OAUTH_SUCCESS_REDIRECT_URL ?? (appUrl ? `${appUrl}/connections` : undefined),
  };

  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid server environment: ${JSON.stringify(fields)}`);
  }
  return parsed.data;
}

let cached: Env | null = null;

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (!cached) cached = loadEnv();
    return cached[prop as keyof Env];
  },
});

/** Test hook: forget the cached environment so the next access re-parses. */
export function resetEnvCache(): void {
  cached = null;
}
