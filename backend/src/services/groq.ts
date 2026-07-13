import { env } from "../config/env.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;
const DEFAULT_GROQ_MODEL = "whisper-large-v3";

interface GroqTranscriptionResponse {
  text: string;
}

export class GroqError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "rate_limit" | "auth" | "server" | "network" | "unknown",
    public readonly statusCode?: number,
    public readonly retriable: boolean = false
  ) {
    super(message);
    this.name = "GroqError";
  }
}

function classifyError(error: unknown, statusCode?: number): GroqError {
  if (error instanceof GroqError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new GroqError("Groq transcription timed out", "timeout", undefined, true);
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new GroqError("Network error reaching Groq API", "network", undefined, true);
  }

  const msg = error instanceof Error ? error.message : String(error);

  if (statusCode === 429) {
    return new GroqError("Groq API rate limit exceeded", "rate_limit", 429, false);
  }
  if (statusCode === 401 || statusCode === 403) {
    return new GroqError("Groq API authentication failed", "auth", statusCode, false);
  }
  if (statusCode && statusCode >= 500) {
    return new GroqError(`Groq server error (${statusCode})`, "server", statusCode, true);
  }

  return new GroqError(msg, "unknown", statusCode, false);
}

async function transcribeOnce(
  formData: FormData,
  apiKey: string,
  signal: AbortSignal
): Promise<string> {
  const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw classifyError(
      new Error(`Groq API error ${response.status}: ${errorText}`),
      response.status
    );
  }

  const data = (await response.json()) as GroqTranscriptionResponse;
  return data.text;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  options?: { apiKey?: string; model?: string | null }
): Promise<string> {
  const apiKey = options?.apiKey ?? env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError(
      "No Groq API key configured (neither user-specific nor global)",
      "auth",
      401,
      false
    );
  }

  const model = options?.model ?? env.GROQ_WHISPER_MODEL ?? DEFAULT_GROQ_MODEL;

  const formData = new FormData();
  const fileExt = mimeType === "audio/ogg" ? "ogg" : "mp3";
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append("file", blob, `voice.${fileExt}`);
  formData.append("model", model);
  formData.append("response_format", "json");

  let lastError: GroqError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const result = await transcribeOnce(formData, apiKey, controller.signal);
      clearTimeout(timeout);
      return result;
    } catch (error) {
      clearTimeout(timeout);
      const classified = classifyError(error);
      lastError = classified;

      if (!classified.retriable || attempt === MAX_RETRIES) {
        throw classified;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError!;
}
