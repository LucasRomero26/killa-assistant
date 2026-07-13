import { supabaseAdmin } from "../config/supabase.js";
import { decrypt } from "../utils/crypto.js";

export interface UserApiKeys {
  nvidiaApiKey: string | null;
  nvidiaModel: string | null;
  groqApiKey: string | null;
  groqModel: string | null;
}

export class ApiKeyNotConfiguredError extends Error {
  constructor(
    public readonly missingProviders: ("nvidia_nim" | "groq")[]
  ) {
    super(
      `Missing API keys for: ${missingProviders.join(", ")}`
    );
    this.name = "ApiKeyNotConfiguredError";
  }
}

export async function getUserApiKeys(userId: string): Promise<UserApiKeys> {
  const { data, error } = await supabaseAdmin
    .from("configuraciones_api")
    .select("provider, api_key_encrypted, model, is_enabled")
    .eq("user_id", userId)
    .eq("is_enabled", true);

  if (error || !data) {
    return { nvidiaApiKey: null, nvidiaModel: null, groqApiKey: null, groqModel: null };
  }

  let nvidiaApiKey: string | null = null;
  let nvidiaModel: string | null = null;
  let groqApiKey: string | null = null;
  let groqModel: string | null = null;

  for (const row of data) {
    if (!row.api_key_encrypted) continue;

    if (row.provider === "nvidia_nim") {
      nvidiaApiKey = decrypt(row.api_key_encrypted);
      nvidiaModel = row.model ?? null;
    } else if (row.provider === "groq") {
      groqApiKey = decrypt(row.api_key_encrypted);
      groqModel = row.model ?? null;
    }
  }

  return { nvidiaApiKey, nvidiaModel, groqApiKey, groqModel };
}

export function buildMissingKeysMessage(missing: ("nvidia_nim" | "groq")[]): string {
  const parts: string[] = [];

  if (missing.includes("nvidia_nim")) {
    parts.push("NVIDIA NIM (para inteligencia artificial)");
  }
  if (missing.includes("groq")) {
    parts.push("Groq (para transcripcion de voz)");
  }

  return (
    "No puedes usar el asistente sin configurar tus propias credenciales de API.\n\n" +
    `Falta configurar: ${parts.join(" y ")}.\n\n` +
    "Ingresa a https://killaassistant.vercel.app/apis para agregar tus API keys.\n\n" +
    "NVIDIA: obtiene tu key en https://build.nvidia.com\n" +
    "Groq: obtiene tu key en https://console.groq.com"
  );
}
