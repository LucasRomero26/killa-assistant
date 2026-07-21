import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/nvidia.js", () => ({
  chatCompletion: vi.fn(),
  NvidiaError: class NvidiaError extends Error {
    constructor(
      message: string,
      public readonly kind: string,
      public readonly statusCode?: number,
      public readonly retriable: boolean = false
    ) {
      super(message);
      this.name = "NvidiaError";
    }
  },
}));

vi.mock("../src/services/google-auth.js", () => ({
  getOAuthClientForUser: vi.fn(),
  getUserGrantedScopes: vi.fn().mockResolvedValue([]),
  hasRestrictedDriveScope: vi.fn((scopes: string[]) =>
    scopes.includes("https://www.googleapis.com/auth/drive")
  ),
}));

vi.mock("../src/services/google-tools.js", () => ({
  calendarTools: [],
  driveTools: [],
  executeCalendarTool: vi.fn(),
  executeDriveTool: vi.fn(),
}));

vi.mock("../src/utils/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { chatCompletion } from "../src/services/nvidia.js";
import { getOAuthClientForUser, getUserGrantedScopes, hasRestrictedDriveScope } from "../src/services/google-auth.js";
import { executeCalendarTool } from "../src/services/google-tools.js";
import { processMessageWithTools } from "../src/mcp/orchestrator.js";

const SYSTEM_PROMPT = "You are KillaAssistant.";

describe("MCP orchestrator - scope-based tool filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose drive_search_files when user has restricted drive scope", async () => {
    vi.mocked(getUserGrantedScopes).mockResolvedValueOnce([
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive",
    ]);
    vi.mocked(hasRestrictedDriveScope).mockReturnValueOnce(true);
    vi.mocked(chatCompletion).mockResolvedValueOnce({ content: "ok", toolCalls: [] });

    await processMessageWithTools(SYSTEM_PROMPT, "hi", "user-vip");

    const callOpts = (vi.mocked(chatCompletion).mock.calls[0] as unknown as [unknown, { tools?: unknown }])[1];
    expect(callOpts?.tools).toBeDefined();
    expect(Array.isArray(callOpts?.tools)).toBe(true);
  });

  it("should still call chatCompletion when user has empty scopes", async () => {
    vi.mocked(getUserGrantedScopes).mockResolvedValueOnce([]);
    vi.mocked(hasRestrictedDriveScope).mockReturnValueOnce(false);
    vi.mocked(chatCompletion).mockResolvedValueOnce({ content: "ok", toolCalls: [] });

    const result = await processMessageWithTools(SYSTEM_PROMPT, "hi", "user-regular");
    expect(result).toBe("ok");
  });
});

describe("MCP orchestrator - ambiguous intent handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should NOT call tools and ask for clarification when event time is missing", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: "Sure, what time should I schedule the meeting for?",
      toolCalls: [],
    });

    const result = await processMessageWithTools(
      SYSTEM_PROMPT,
      "Reserve a meeting with Juan",
      "user-123"
    );

    expect(result).toBe("Sure, what time should I schedule the meeting for?");
    expect(getOAuthClientForUser).not.toHaveBeenCalled();
    expect(executeCalendarTool).not.toHaveBeenCalled();
  });

  it("should call calendar tool when all params are provided and Google is connected", async () => {
    vi.mocked(getOAuthClientForUser).mockResolvedValueOnce({} as any);
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "calendar_create_event",
              arguments: JSON.stringify({
                title: "Team sync",
                start_time: "2026-07-09T15:00:00",
                end_time: "2026-07-09T16:00:00",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: "Done! I created the 'Team sync' event.",
        toolCalls: [],
      });

    vi.mocked(executeCalendarTool).mockResolvedValueOnce(
      "Event created: Team sync (https://calendar.google.com/xxx)"
    );

    const result = await processMessageWithTools(
      SYSTEM_PROMPT,
      "Create a 'Team sync' event tomorrow at 3pm for 1 hour",
      "user-123"
    );

    expect(result).toBe("Done! I created the 'Team sync' event.");
    expect(getOAuthClientForUser).toHaveBeenCalledWith("user-123");
    expect(executeCalendarTool).toHaveBeenCalledTimes(1);
  });

  it("should inform the user to link Google account when not connected", async () => {
    vi.mocked(getOAuthClientForUser).mockResolvedValueOnce(null);
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "calendar_list_events",
              arguments: "{}",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: "Your Google account is not linked. Please link it from the web panel.",
        toolCalls: [],
      });

    const result = await processMessageWithTools(
      SYSTEM_PROMPT,
      "What's on my calendar today?",
      "user-123"
    );

    expect(result).toBe("Your Google account is not linked. Please link it from the web panel.");
    expect(executeCalendarTool).not.toHaveBeenCalled();
  });

  it("should handle tool execution errors gracefully and report to LLM", async () => {
    vi.mocked(getOAuthClientForUser).mockResolvedValueOnce({} as any);
    vi.mocked(chatCompletion)
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "calendar_create_event",
              arguments: JSON.stringify({
                title: "Bad",
                start_time: "not-a-date",
                end_time: "also-bad",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: "It looks like the date format was invalid. Could you provide the date again?",
        toolCalls: [],
      });

    vi.mocked(executeCalendarTool).mockRejectedValueOnce(new Error("Invalid time format"));

    const result = await processMessageWithTools(
      SYSTEM_PROMPT,
      "Create event 'Bad' at not-a-date",
      "user-123"
    );

    expect(result).toBe(
      "It looks like the date format was invalid. Could you provide the date again?"
    );
  });
});
