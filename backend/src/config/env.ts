import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BACKEND_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_MODEL: z.string().default("meta/llama-3.1-70b-instruct"),

  GROQ_API_KEY: z.string().optional(),
  GROQ_WHISPER_MODEL: z.string().default("whisper-large-v3"),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  OAUTH_SUCCESS_REDIRECT_URL: z.string().url().optional(),

  FRONTEND_URL: z.string().url().optional(),

  ENCRYPTION_KEY: z.string().length(64),

  WHATSAPP_USE_MOCK: z
    .enum(["true", "false"])
    .default("true"),

  WHATSAPP_AUTOSTART: z
    .enum(["true", "false"])
    .default("false"),

  WHATSAPP_ADMIN_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:");
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
