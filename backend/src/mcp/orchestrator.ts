import { chatCompletion } from "../services/nvidia.js";
import { getOAuthClientForUser } from "../services/google-auth.js";
import {
  calendarTools,
  driveTools,
  executeCalendarTool,
  executeDriveTool,
  type MediaBufferResolver,
} from "../services/google-tools.js";
import { logActivity } from "../utils/activity-log.js";
import type { ChatMessage, ToolCall, ToolDefinition, PendingMedia } from "../types/index.js";

const ALL_TOOLS: ToolDefinition[] = [...calendarTools, ...driveTools];
const MAX_TOOL_ROUNDS = 5;

export async function processMessageWithTools(
  systemPrompt: string,
  userMessage: string,
  userId: string,
  options?: {
    nvidiaApiKey?: string;
    nvidiaModel?: string | null;
    pendingMedia?: PendingMedia;
    mediaResolver?: MediaBufferResolver;
  }
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const chatOptions = options?.nvidiaApiKey
    ? { apiKey: options.nvidiaApiKey, model: options.nvidiaModel }
    : undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatCompletion(messages, { tools: ALL_TOOLS, ...chatOptions });

    if (response.toolCalls.length === 0) {
      return response.content ?? "I could not generate a response.";
    }

    const toolResults = await executeToolCalls(
      response.toolCalls,
      userId,
      options?.mediaResolver
    );

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      tool_calls: response.toolCalls,
    });

    for (const result of toolResults) {
      messages.push({
        role: "tool",
        tool_call_id: result.toolCallId,
        content: result.content,
      });
    }
  }

  const finalResponse = await chatCompletion(messages, chatOptions);
  return finalResponse.content ?? "I could not complete the requested action.";
}

async function executeToolCalls(
  toolCalls: ToolCall[],
  userId: string,
  mediaResolver?: MediaBufferResolver
): Promise<Array<{ toolCallId: string; content: string }>> {
  const client = await getOAuthClientForUser(userId);

  if (!client) {
    return toolCalls.map((call) => ({
      toolCallId: call.id,
      content:
        "Google account not connected. The user must link their Google account via the web panel before I can access Calendar or Drive.",
    }));
  }

  const results: Array<{ toolCallId: string; content: string }> = [];

  for (const call of toolCalls) {
    const startedAt = Date.now();
    try {
      let content: string;
      let source: "calendar" | "drive";

      if (call.function.name.startsWith("calendar_")) {
        content = await executeCalendarTool(client, call);
        source = "calendar";
      } else if (call.function.name.startsWith("drive_")) {
        content = await executeDriveTool(client, call, mediaResolver);
        source = "drive";
      } else {
        results.push({ toolCallId: call.id, content: `Unknown tool: ${call.function.name}` });
        continue;
      }

      results.push({ toolCallId: call.id, content });

      await logActivity({
        userId,
        source,
        level: "success",
        message: `Tool executed: ${call.function.name}`,
        detail: content.slice(0, 500),
        metadata: { tool: call.function.name, durationMs: Date.now() - startedAt },
      });
    } catch (error) {
      const errMsg = (error as Error).message;
      results.push({
        toolCallId: call.id,
        content: `Tool execution error: ${errMsg}`,
      });

      await logActivity({
        userId,
        source: call.function.name.startsWith("calendar_") ? "calendar" : "drive",
        level: "error",
        message: `Tool failed: ${call.function.name}`,
        detail: errMsg,
        metadata: { tool: call.function.name, durationMs: Date.now() - startedAt },
      });
    }
  }

  return results;
}
