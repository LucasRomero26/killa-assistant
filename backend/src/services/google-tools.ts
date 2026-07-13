import { google } from "googleapis";
import { PassThrough } from "stream";
import type { Auth } from "googleapis";
import type { ToolDefinition, ToolCall } from "../types/index.js";

type OAuth2Client = Auth.OAuth2Client;

export const calendarTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "calendar_list_events",
      description: "List upcoming events from the user's Google Calendar",
      parameters: {
        type: "object",
        properties: {
          max_results: {
            type: "number",
            description: "Maximum number of events to return (default 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_create_event",
      description: "Create a new event in the user's Google Calendar. Requires title, start_time and end_time in ISO 8601 format. If the user does not specify a time, ask for clarification before calling this tool.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start_time: { type: "string", description: "Start time in ISO 8601 format (e.g. 2026-07-09T15:00:00)" },
          end_time: { type: "string", description: "End time in ISO 8601 format" },
          description: { type: "string", description: "Event description (optional)" },
          location: { type: "string", description: "Event location (optional)" },
        },
        required: ["title", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_update_event",
      description: "Update an existing event in the user's Google Calendar by its event ID",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "The Google Calendar event ID to update" },
          title: { type: "string", description: "New event title (optional)" },
          start_time: { type: "string", description: "New start time in ISO 8601 (optional)" },
          end_time: { type: "string", description: "New end time in ISO 8601 (optional)" },
          description: { type: "string", description: "New description (optional)" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_delete_event",
      description: "Delete an event from the user's Google Calendar by its event ID",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "The Google Calendar event ID to delete" },
        },
        required: ["event_id"],
      },
    },
  },
];

export const driveTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "drive_list_files",
      description: "List recent files from the user's Google Drive",
      parameters: {
        type: "object",
        properties: {
          max_results: {
            type: "number",
            description: "Maximum number of files to return (default 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_search_files",
      description: "Search files in the user's Google Drive by name query",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Full-text search query for file names or content" },
          max_results: { type: "number", description: "Maximum number of files to return (default 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_create_folder",
      description: "Create a new folder in the user's Google Drive",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Folder name" },
          parent_id: { type: "string", description: "Parent folder ID (optional, defaults to root)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_upload_file",
      description:
        "Upload a previously received file (photo or document) to the user's Google Drive. " +
        "The file was sent by the user in a previous message and is referenced by media_id. " +
        "If folder_name is provided and the folder does not exist, it will be created. " +
        "If file_name is not provided, the original file name is used.",
      parameters: {
        type: "object",
        properties: {
          media_id: { type: "string", description: "The media_id of the pending file (provided in the conversation context)" },
          folder_name: { type: "string", description: "Name of the destination folder. If it does not exist, it will be created." },
          file_name: { type: "string", description: "Custom file name for the uploaded file (optional, uses original by default)" },
        },
        required: ["media_id"],
      },
    },
  },
];

export interface MediaBuffer {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

export type MediaBufferResolver = (mediaId: string) => MediaBuffer | undefined;

export async function executeCalendarTool(
  client: OAuth2Client,
  call: ToolCall
): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth: client });
  const args = JSON.parse(call.function.arguments);

  switch (call.function.name) {
    case "calendar_list_events": {
      const maxResults = args.max_results ?? 10;
      const res = await calendar.events.list({
        calendarId: "primary",
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
        timeMin: new Date().toISOString(),
      });
      const events = res.data.items ?? [];
      if (events.length === 0) return "No upcoming events found.";
      return events
        .map((e) => `${e.id ?? "?"} | ${e.summary ?? "Untitled"} - ${e.start?.dateTime ?? e.start?.date}`)
        .join("\n");
    }

    case "calendar_create_event": {
      const res = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: args.title,
          description: args.description,
          location: args.location,
          start: { dateTime: args.start_time },
          end: { dateTime: args.end_time },
        },
      });
      return `Event created: ${res.data.summary} (${res.data.htmlLink})`;
    }

    case "calendar_update_event": {
      const patch: Record<string, unknown> = {};
      if (args.title !== undefined) patch.summary = args.title;
      if (args.description !== undefined) patch.description = args.description;
      if (args.start_time !== undefined) patch.start = { dateTime: args.start_time };
      if (args.end_time !== undefined) patch.end = { dateTime: args.end_time };

      const res = await calendar.events.patch({
        calendarId: "primary",
        eventId: args.event_id,
        requestBody: patch,
      });
      return `Event updated: ${res.data.summary ?? args.event_id}`;
    }

    case "calendar_delete_event": {
      await calendar.events.delete({
        calendarId: "primary",
        eventId: args.event_id,
      });
      return `Event deleted: ${args.event_id}`;
    }

    default:
      return `Unknown calendar tool: ${call.function.name}`;
  }
}

export async function executeDriveTool(
  client: OAuth2Client,
  call: ToolCall,
  mediaResolver?: MediaBufferResolver
): Promise<string> {
  const drive = google.drive({ version: "v3", auth: client });
  const args = JSON.parse(call.function.arguments);

  switch (call.function.name) {
    case "drive_list_files": {
      const maxResults = args.max_results ?? 10;
      const res = await drive.files.list({
        pageSize: maxResults,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "modifiedTime desc",
      });
      const files = res.data.files ?? [];
      if (files.length === 0) return "No files found.";
      return files.map((f) => `${f.name} (${f.mimeType}) [${f.id}]`).join("\n");
    }

    case "drive_search_files": {
      const maxResults = args.max_results ?? 10;
      const escaped = String(args.query).replace(/'/g, "\\'");
      const res = await drive.files.list({
        pageSize: maxResults,
        fields: "files(id, name, mimeType, modifiedTime)",
        q: `name contains '${escaped}' and trashed = false`,
      });
      const files = res.data.files ?? [];
      if (files.length === 0) return `No files found matching "${args.query}".`;
      return files.map((f) => `${f.name} (${f.mimeType}) [${f.id}]`).join("\n");
    }

    case "drive_create_folder": {
      const res = await drive.files.create({
        requestBody: {
          name: args.name,
          mimeType: "application/vnd.google-apps.folder",
          ...(args.parent_id ? { parents: [args.parent_id] } : {}),
        },
        fields: "id, name",
      });
      return `Folder created: ${res.data.name} [${res.data.id}]`;
    }

    case "drive_upload_file": {
      if (!mediaResolver) {
        return "Media resolver not available. Cannot upload file.";
      }

      const media = mediaResolver(args.media_id);
      if (!media) {
        return `Pending file not found for media_id="${args.media_id}". The file may have expired or was already consumed. Ask the user to re-send the file.`;
      }

      let parentId: string | undefined;
      if (args.folder_name) {
        const escaped = String(args.folder_name).replace(/'/g, "\\'");
        const folderSearch = await drive.files.list({
          pageSize: 1,
          fields: "files(id, name)",
          q: `mimeType = 'application/vnd.google-apps.folder' and name = '${escaped}' and trashed = false`,
        });

        const existingFolder = folderSearch.data.files?.[0];
        if (existingFolder?.id) {
          parentId = existingFolder.id;
        } else {
          const createdFolder = await drive.files.create({
            requestBody: {
              name: args.folder_name,
              mimeType: "application/vnd.google-apps.folder",
            },
            fields: "id, name",
          });
          parentId = createdFolder.data.id ?? undefined;
        }
      }

      const uploadName = args.file_name
        ? String(args.file_name)
        : (media.fileName ?? `file_${Date.now()}`);

      const res = await drive.files.create({
        requestBody: {
          name: uploadName,
          ...(parentId ? { parents: [parentId] } : {}),
        },
        media: {
          mimeType: media.mimeType,
          body: (() => {
            const stream = new PassThrough();
            stream.end(media.buffer);
            return stream;
          })(),
        },
        fields: "id, name, webViewLink",
      });

      const link = res.data.webViewLink ?? `[${res.data.id}]`;
      return `File uploaded to Google Drive: ${res.data.name} (${link})`;
    }

    default:
      return `Unknown drive tool: ${call.function.name}`;
  }
}
