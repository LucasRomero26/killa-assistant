import { chatCompletion } from "../services/nvidia";
import { getOAuthClientForUser, getUserGrantedScopes, hasRestrictedDriveScope } from "../services/google-auth";
import {
  calendarTools,
  driveTools,
  executeCalendarTool,
  executeDriveTool,
  type MediaBufferResolver,
} from "../services/google-tools";
import { logActivity } from "../utils/activity-log";
import type { ChatMessage, ToolCall, ToolDefinition, PendingMedia } from "../types/index";

const ALL_TOOLS: ToolDefinition[] = [...calendarTools, ...driveTools];
const MAX_TOOL_ROUNDS = 5;

// Reinforces the response contract right after tool execution, where models
// tend to drift into English, third-person narration of the tool result.
const FINAL_STYLE_REMINDER =
  "Ahora responde al usuario en ESPAÑOL, dirigiéndote a él en segunda persona (tú), " +
  "de forma breve y natural, confirmando el resultado de las acciones realizadas. " +
  "No describas tu respuesta ni uses frases meta como \"This response indicates\" o descripciones en tercera persona.";

function filterToolsForUser(allTools: ToolDefinition[], grantedScopes: string[]): ToolDefinition[] {
  if (hasRestrictedDriveScope(grantedScopes)) {
    return allTools;
  }
  return allTools.filter((t) => t.function.name !== "drive_search_files");
}

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
  const grantedScopes = await getUserGrantedScopes(userId);
  const tools = filterToolsForUser(ALL_TOOLS, grantedScopes);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const chatOptions = options?.nvidiaApiKey
    ? { apiKey: options.nvidiaApiKey, model: options.nvidiaModel }
    : undefined;

  let styleReminderAdded = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatCompletion(messages, { tools, ...chatOptions });

    if (response.toolCalls.length === 0) {
      return response.content ?? "No pude generar una respuesta. Inténtalo de nuevo.";
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

    // After the first round of tool execution, remind the model of the
    // response contract (Spanish, second person, no meta-narration) so the
    // user-facing summary it produces next round stays on-contract.
    if (!styleReminderAdded) {
      messages.push({ role: "system", content: FINAL_STYLE_REMINDER });
      styleReminderAdded = true;
    }
  }

  const finalResponse = await chatCompletion(messages, chatOptions);
  return finalResponse.content ?? "No pude completar la acción solicitada. Inténtalo de nuevo.";
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
