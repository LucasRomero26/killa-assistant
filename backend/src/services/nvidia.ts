import { env } from "../config/env.js";
import type { ChatMessage, LLMResponse, ToolDefinition } from "../types/index.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.1-70b-instruct";

interface NvidiaChoice {
  message: {
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
}

interface NvidiaChatResponse {
  choices: NvidiaChoice[];
}

export class NvidiaError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "rate_limit" | "auth" | "server" | "network" | "unknown",
    public readonly statusCode?: number,
    public readonly retriable: boolean = false
  ) {
    super(message);
    this.name = "NvidiaError";
  }
}

function classifyError(error: unknown, statusCode?: number): NvidiaError {
  if (error instanceof NvidiaError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new NvidiaError("NVIDIA request timed out", "timeout", undefined, true);
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new NvidiaError("Network error reaching NVIDIA API", "network", undefined, true);
  }

  const msg = error instanceof Error ? error.message : String(error);

  if (statusCode === 429) {
    return new NvidiaError("NVIDIA API rate limit exceeded", "rate_limit", 429, false);
  }
  if (statusCode === 401 || statusCode === 403) {
    return new NvidiaError("NVIDIA API authentication failed", "auth", statusCode, false);
  }
  if (statusCode && statusCode >= 500) {
    return new NvidiaError(`NVIDIA server error (${statusCode})`, "server", statusCode, true);
  }

  return new NvidiaError(msg, "unknown", statusCode, false);
}

async function callNvidiaOnce(
  body: Record<string, unknown>,
  apiKey: string,
  signal: AbortSignal
): Promise<LLMResponse> {
  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw classifyError(
      new Error(`NVIDIA API error ${response.status}: ${errorText}`),
      response.status
    );
  }

  const data = (await response.json()) as NvidiaChatResponse;
  const choice = data.choices?.[0];

  if (!choice) {
    throw new NvidiaError("NVIDIA API returned no choices", "server", undefined, false);
  }

  return {
    content: choice.message.content,
    toolCalls: choice.message.tool_calls ?? [],
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
    model?: string | null;
  }
): Promise<LLMResponse> {
  const apiKey = options?.apiKey ?? env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new NvidiaError(
      "No NVIDIA API key configured (neither user-specific nor global)",
      "auth",
      401,
      false
    );
  }

  const model = options?.model ?? env.NVIDIA_MODEL ?? DEFAULT_NVIDIA_MODEL;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.2,
    max_tokens: options?.maxTokens ?? 1024,
  };

  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = "auto";
  }

  let lastError: NvidiaError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const result = await callNvidiaOnce(body, apiKey, controller.signal);
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
