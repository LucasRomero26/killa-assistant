import { env } from "../config/env.js";
import { existsSync, mkdirSync, rmSync, lstatSync } from "fs";
import pino from "pino";
import type { WhatsAppQRPayload, WhatsAppStatusPayload, WhatsAppIncomingMessage } from "../types/index.js";

const app_log = pino({ name: "whatsapp-service", level: env.NODE_ENV === "production" ? "info" : "debug" });

const SESSION_DIR = "/sessions/killa-assistant";

function ensureSessionDir(): string {
  try {
    if (!existsSync(SESSION_DIR)) {
      mkdirSync(SESSION_DIR, { recursive: true });
    }
    // Chromium leaves SingletonLock/SingletonCookie/SingletonSocket symlinks
    // pointing to the previous container's hostname after a redeploy. These
    // stale locks prevent Chrome from launching ("Failed to launch the browser
    // process! undefined"). Remove them before starting a new session.
    //
    // NOTE: existsSync() returns false for broken symlinks (target missing),
    // so we use lstatSync() which detects the symlink itself regardless of
    // whether the target still exists.
    const staleLocks = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
    for (const lock of staleLocks) {
      const lockPath = `${SESSION_DIR}/${lock}`;
      try {
        let isLock = false;
        try {
          isLock = lstatSync(lockPath).isSymbolicLink();
        } catch {
          // not present
        }
        if (isLock || existsSync(lockPath)) {
          rmSync(lockPath);
        }
      } catch {
        // lock may not be removable (permissions) — best effort
      }
    }
  } catch {
    // best-effort: if /sessions is not writable (no volume mount), OpenWA
    // will fall back to an ephemeral profile under the container workdir.
  }
  return SESSION_DIR;
}

type QRListener = (payload: WhatsAppQRPayload) => void;
type StatusListener = (payload: WhatsAppStatusPayload) => void;
type MessageListener = (msg: WhatsAppIncomingMessage) => void;

interface OpenWAIncomingMessageType {
  fromMe: boolean;
  chatId: string;
  from: string;
  body: string;
  type: string;
  caption?: string;
  mimetype?: string;
  filename?: string;
  duration?: string | number;
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "auth" | "server" | "network" | "unknown",
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

export interface WhatsAppClient {
  sendText(chatId: string, text: string): Promise<void>;
  isConnected(): boolean;
  disconnect(): Promise<void>;
  decryptMedia(message: Record<string, unknown>): Promise<{ buffer: Buffer; mimeType: string }>;
}

interface WhatsAppClientEvents {
  onQR?: (qr: string) => void;
  onStatus?: (status: WhatsAppStatusPayload) => void;
  onMessage?: (msg: WhatsAppIncomingMessage) => void;
}

// The bot is a single shared WhatsApp account (singleton).
// There is no per-user client. Users authenticate via /start <token>.
let activeClient: WhatsAppClient | null = null;
let lastStatus: WhatsAppConnectionStatus["status"] = "disconnected";
let startingPromise: Promise<void> | null = null;
let lastQRPayload: WhatsAppQRPayload | null = null;

// Internal reference to the raw OpenWA client for direct isConnected() probes.
// This is a defensive measure: if onReady / ev bus events don't fire in some
// OpenWA 4.x versions, getWhatsAppConnectionStatus() can still determine the
// real connection state by calling client.isConnected() directly.
let rawOpenWAClient: { isConnected?: () => boolean } | null = null;

// The host (owner) chatId of the WhatsApp account that the bot is logged in
// as. Only messages coming from this chatId are processed; messages from
// third parties are filtered to prevent unauthorized access to the owner's
// API keys. Populated from client.getMe() after the session becomes ready.
let hostChatId: string | null = null;

const qrListeners = new Set<QRListener>();
const statusListeners = new Set<StatusListener>();
const messageListeners = new Set<MessageListener>();

function emitQR(payload: WhatsAppQRPayload): void {
  lastQRPayload = payload;
  qrListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      // listener errors are non-fatal
    }
  });
}

function emitStatus(payload: WhatsAppStatusPayload): void {
  lastStatus = payload.status as WhatsAppConnectionStatus["status"];
  statusListeners.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      // listener errors are non-fatal
    }
  });
}

function emitMessage(msg: WhatsAppIncomingMessage): void {
  messageListeners.forEach((cb) => {
    try {
      cb({ ...msg });
    } catch {
      // listener errors are non-fatal
    }
  });
}

export function onWhatsAppQR(cb: QRListener): () => void {
  qrListeners.add(cb);
  return () => {
    qrListeners.delete(cb);
  };
}

export function onWhatsAppStatus(cb: StatusListener): () => void {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

export function onWhatsAppMessage(cb: MessageListener): () => void {
  messageListeners.add(cb);
  return () => {
    messageListeners.delete(cb);
  };
}

export function getActiveWhatsAppClient(): WhatsAppClient | null {
  return activeClient;
}

export function isWhatsAppReady(): boolean {
  return activeClient?.isConnected() ?? false;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  status: "qr" | "authenticated" | "disconnected" | "connecting" | "ready";
}

export function getWhatsAppConnectionStatus(): WhatsAppConnectionStatus {
  if (!activeClient) {
    return {
      connected: false,
      status: lastStatus === "qr" ? "qr" : "disconnected",
    };
  }
  let isConnected = activeClient.isConnected();
  // Fallback: if the wrapper's isConnected() returns false but lastStatus was
  // already set to "ready" or "authenticated", trust lastStatus. This handles
  // the OpenWA 4.x bug where onReady fires and updates lastStatus via
  // emitStatus but the wrapper closure's `connected` flag was not updated.
  if (!isConnected && (lastStatus === "ready" || lastStatus === "authenticated")) {
    isConnected = true;
  }
  // Second fallback: probe the raw OpenWA client directly.
  if (!isConnected && rawOpenWAClient && typeof rawOpenWAClient.isConnected === "function") {
    try {
      isConnected = rawOpenWAClient.isConnected();
    } catch {
      // ignore probe errors
    }
  }
  return {
    connected: isConnected,
    status: isConnected ? "ready" : lastStatus === "qr" ? "qr" : "connecting",
  };
}

export function getLastWhatsAppQR(): WhatsAppQRPayload | null {
  return lastQRPayload;
}

export function clearLastWhatsAppQR(): void {
  lastQRPayload = null;
}

export function getHostChatId(): string | null {
  return hostChatId;
}

async function captureHostChatId(
  client: { getMe?: () => Promise<unknown> } | null,
  label: string
): Promise<void> {
  if (!client || typeof client.getMe !== "function") return;
  try {
    const me = await client.getMe();
    let id: string | null = null;
    if (typeof me === "string") {
      id = me;
    } else if (me && typeof me === "object") {
      const record = me as Record<string, unknown>;
      id =
        (typeof record.wid === "object" && record.wid !== null
          ? (record.wid as Record<string, unknown>)._serialized as string
          : undefined) ??
        (record._serialized as string) ??
        (record.id as string) ??
        (record.serialized as string) ??
        null;
    }
    if (id && typeof id === "string") {
      hostChatId = id;
      app_log.info({ hostChatId }, `[WA] ${label}: host chatId captured`);
    }
  } catch (err) {
    app_log.warn({ err }, `[WA] ${label}: getMe() failed`);
  }
}

async function createMockClient(events: WhatsAppClientEvents): Promise<WhatsAppClient> {
  let connected = false;
  let qrTimer: ReturnType<typeof setTimeout> | null = null;

  events.onStatus?.({ status: "connecting", message: "Mock client starting" });

  qrTimer = setTimeout(() => {
    events.onQR?.("mock-qr-code-for-development");
    events.onStatus?.({ status: "qr", message: "QR generated (mock)" });
  }, 500);

  return {
    async sendText(_chatId: string, _text: string): Promise<void> {
      if (!connected) throw new WhatsAppError("WhatsApp not connected", "auth");
    },
    isConnected(): boolean {
      return connected;
    },
    async disconnect(): Promise<void> {
      if (qrTimer) clearTimeout(qrTimer);
      connected = false;
    },
    async decryptMedia(_message: Record<string, unknown>): Promise<{ buffer: Buffer; mimeType: string }> {
      throw new WhatsAppError("Mock client cannot decrypt media", "server");
    },
  };
}

async function createOpenWAClient(events: WhatsAppClientEvents): Promise<WhatsAppClient> {
  const wa = await import("@open-wa/wa-automate");
  let client: Awaited<ReturnType<typeof wa.create>> | null = null;
  let connected = false;

  const sessionPath = ensureSessionDir();

  const qrHandler = (qr: string) => {
    lastStatus = "qr";
    emitStatus({ status: "qr", message: "QR code generated" });
    events.onQR?.(qr);
  };

  const statusHandler = (payload: WhatsAppStatusPayload) => {
    if (payload.status === "qr") {
      qrHandler(typeof payload === "string" ? payload : (payload as unknown as { qr?: string })?.qr ?? "");
      return;
    }
    if (payload.status === "authenticated" || payload.status === "ready") {
      connected = true;
    } else if (payload.status === "disconnected") {
      connected = false;
    }
    emitStatus(payload);
    events.onStatus?.(payload);
  };

  // Extracted message handler — used both as onMessage callback in wa.create()
  // AND registered explicitly via client.onMessage() after create resolves.
  // OpenWA 4.x with eventMode:true may not fire the onMessage config callback.
  const messageHandler = (message: OpenWAIncomingMessageType) => {
    if (message.fromMe) return;
    app_log.debug({ chatId: message.chatId, type: message.type, from: message.from }, "[WA] onMessage fired");
    // Mark as connected on first incoming message (defensive: if onReady never fired)
    if (!connected) {
      connected = true;
      emitStatus({ status: "ready", message: "WhatsApp session ready (inferred from message)" });
      events.onStatus?.({ status: "ready", message: "WhatsApp bot session ready" });
    }

    const msgType = message.type as string;
    const baseMsg: WhatsAppIncomingMessage = {
      chatId: message.chatId,
      type: "text",
      text: message.body ?? "",
      caption: message.caption ?? undefined,
    };

    if (msgType === "chat" || msgType === "text") {
      baseMsg.type = "text";
      events.onMessage?.(baseMsg);
    } else if (msgType === "ptt" || msgType === "audio") {
      events.onMessage?.({
        ...baseMsg,
        type: "voice",
        mimeType: message.mimetype ?? "audio/ogg",
        duration: message.duration as number | undefined,
        rawMessage: message as unknown as Record<string, unknown>,
      });
    } else if (msgType === "image" || msgType === "document") {
      events.onMessage?.({
        ...baseMsg,
        type: msgType === "image" ? "photo" : "document",
        text: message.caption ?? message.body ?? "",
        mimeType: message.mimetype ?? undefined,
        fileName: message.filename ?? undefined,
        rawMessage: message as unknown as Record<string, unknown>,
      });
    }
  };

  wa.ev.on("qr.**", (qr: unknown) => {
    if (typeof qr === "string") {
      qrHandler(qr);
    } else if (typeof qr === "object" && qr !== null) {
      const qrStr = (qr as { data?: string }).data ?? JSON.stringify(qr);
      qrHandler(qrStr);
    }
  });

  wa.ev.on("**.session1", (_data: unknown, _sessionId: string, namespace: string) => {
    if (namespace === "qr") {
      lastStatus = "qr";
    }
  });

  wa.ev.on("statusChange", (data: unknown) => {
    const state = typeof data === "string" ? data : String(data);
    app_log.info({ state }, "[WA] ev statusChange fired");
    if (state === "CONFLICT" || state === "LOGOUT" || state === "UNPAIRED") {
      connected = false;
      activeClient = null;
      rawOpenWAClient = null;
      emitStatus({ status: "disconnected", message: `WhatsApp logged out (${state})` });
      statusHandler({ status: "disconnected", message: `State: ${state}` });
    } else if (state === "PAIRED") {
      connected = true;
      statusHandler({ status: "authenticated", message: "Device paired" });
    }
  });

  // OpenWA 4.x may emit the ready/authenticated signal via the event bus
  // instead of the onReady callback. Listen for a few common namespaces.
  wa.ev.on("ready.**", (_data: unknown, _sessionId: string, namespace: string) => {
    app_log.info({ namespace }, "[WA] ev ready.** fired");
    connected = true;
    emitStatus({ status: "ready", message: "WhatsApp bot session ready (ev: ready)" });
    events.onStatus?.({ status: "ready", message: "WhatsApp bot session ready" });
    void captureHostChatId(client as unknown as { getMe?: () => Promise<unknown> } | null, "ev ready.**");
  });

  wa.ev.on("**.ready", (_data: unknown, _sessionId: string, namespace: string) => {
    app_log.info({ namespace }, "[WA] ev **.ready fired");
    connected = true;
    emitStatus({ status: "ready", message: "WhatsApp bot session ready (ev: *.ready)" });
    events.onStatus?.({ status: "ready", message: "WhatsApp bot session ready" });
    void captureHostChatId(client as unknown as { getMe?: () => Promise<unknown> } | null, "ev **.ready");
  });

  // OpenWA also emits a generic 'all' or 'session*.ready' event in some setups.
  wa.ev.on("**", (_data: unknown, _sessionId: string, namespace: string) => {
    if (typeof namespace === "string" && namespace.includes("ready")) {
      app_log.info({ namespace }, "[WA] ev ** (ready-ish) fired");
      connected = true;
      emitStatus({ status: "ready", message: `WhatsApp bot session ready (${namespace})` });
      events.onStatus?.({ status: "ready", message: "WhatsApp bot session ready" });
    }
  });

  client = await wa.create({
    sessionId: "killa-assistant",
    multiDevice: true,
    useChrome: false,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
    qrTimeout: 60_000,
    authTimeout: 90_000,
    cacheEnabled: false,
    disableSpins: true,
    eventMode: true,
    qrLogSkip: true,
    inViewport: true,
    inDocker: true,
    customUserAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    blockCrashLogs: false,
    stopProxyOnQuit: true,
    screenshotOnInitializationBrowserError: true,
    logDebugInfoAsObject: true,
    ...(sessionPath ? { userDataDir: sessionPath, sessionDataPath: sessionPath } : {}),
    onStateChanged: (state: string) => {
      app_log.info({ state }, "[WA] onStateChanged fired");
      if (state === "CONFLICT" || state === "UNPAIRED" || state === "LOGOUT") {
        connected = false;
        activeClient = null;
        rawOpenWAClient = null;
        emitStatus({ status: "disconnected", message: `State: ${state}` });
        events.onStatus?.({ status: "disconnected", message: `State: ${state}` });
      } else if (state === "PAIRED") {
        connected = true;
        emitStatus({ status: "authenticated", message: "Device paired" });
        events.onStatus?.({ status: "authenticated", message: "Device paired" });
      }
    },
    onReady: () => {
      app_log.info("[WA] onReady callback fired");
      connected = true;
      emitStatus({ status: "ready", message: "WhatsApp bot session ready" });
      events.onStatus?.({ status: "ready", message: "WhatsApp bot session ready" });
      void captureHostChatId(client as unknown as { getMe?: () => Promise<unknown> } | null, "onReady");
    },
    // NOTE: onMessage in wa.create() config does NOT fire with eventMode:true
    // in OpenWA 4.76. The listener is registered explicitly after create below.
  });

  // After wa.create() resolves, OpenWA may have already authenticated (session
  // data persisted) without firing onReady or the ev bus in some 4.x versions.
  // Probe the client directly and force the status to "ready" if it's connected.
  rawOpenWAClient = client as unknown as { isConnected?: () => boolean };
  try {
    const isOpen = typeof client?.isConnected === "function" && client.isConnected();
    if (isOpen) {
      app_log.info("[WA] wa.create() resolved — client.isConnected()=true, forcing ready");
      connected = true;
      emitStatus({ status: "ready", message: "WhatsApp bot session ready (probed after create)" });
      events.onStatus?.({ status: "ready", message: "WhatsApp bot session ready" });
    } else {
      app_log.info("[WA] wa.create() resolved — client.isConnected()=false, waiting for events");
    }
  } catch (err) {
    app_log.warn({ err }, "[WA] post-create probe failed");
  }

  // Capture the host's chatId (the owner of the WhatsApp account) so we can
  // filter out messages from third parties. If the session was restored from
  // disk, getMe() works immediately; otherwise it may need a short delay.
  void captureHostChatId(client as unknown as { getMe?: () => Promise<unknown> } | null, "post-create");

  // OpenWA 4.x with eventMode:true does not fire the onMessage config callback.
  // Register the listener explicitly via client.onMessage() after create.
  // This is the SINGLE registration — no onAnyMessage, no config callback.
  if (client && typeof (client as unknown as { onMessage?: (cb: (msg: OpenWAIncomingMessageType) => void) => Promise<void> }).onMessage === "function") {
    app_log.debug("[WA] Registering client.onMessage() explicitly after create");
    try {
      await (client as unknown as { onMessage: (cb: (msg: OpenWAIncomingMessageType) => void) => Promise<void> }).onMessage(messageHandler);
      app_log.debug("[WA] client.onMessage() registered successfully");
    } catch (err) {
      app_log.error({ err }, "[WA] client.onMessage() registration FAILED");
    }
  } else {
    app_log.warn("[WA] client.onMessage() not available — messages will not be received");
  }

  return {
    async sendText(chatId: string, text: string): Promise<void> {
      if (!client) {
        throw new WhatsAppError("WhatsApp client not available", "server");
      }
      // Use the raw OpenWA client to send directly — the wrapper's `connected`
      // flag may be false even though the OpenWA client is actually connected.
      app_log.debug({ chatId, connected, textPreview: text.slice(0, 50) }, "[WA] wrapper.sendText: calling client.sendText");
      await client.sendText(chatId as never, text);
      app_log.debug({ chatId }, "[WA] wrapper.sendText: sent successfully");
    },
    isConnected(): boolean {
      return connected;
    },
    async disconnect(): Promise<void> {
      if (client) {
        try {
          await (client as unknown as { close: () => Promise<void> }).close();
        } catch {
          // ignore close errors
        }
        client = null;
      }
      connected = false;
    },
    async decryptMedia(message: Record<string, unknown>): Promise<{ buffer: Buffer; mimeType: string }> {
      if (!client) {
        throw new WhatsAppError("WhatsApp client not available", "server");
      }
      const dataUrl = await (client as unknown as {
        decryptMedia: (msg: unknown) => Promise<string>;
      }).decryptMedia(message);
      const mimeType = (message.mimetype as string) ?? "application/octet-stream";
      const base64 = dataUrl.split(",")[1] ?? "";
      return { buffer: Buffer.from(base64, "base64"), mimeType };
    },
  };
}

/**
 * Start the singleton WhatsApp bot (no userId — it is a shared account).
 * Safe to call multiple times: if already starting, returns the same promise.
 */
export async function startWhatsAppBot(): Promise<void> {
  if (activeClient || startingPromise) {
    return;
  }

  lastStatus = "connecting";
  emitStatus({ status: "connecting", message: "Starting WhatsApp bot session" });

  const events: WhatsAppClientEvents = {
    onQR: (qr: string) => {
      lastStatus = "qr";
      emitStatus({ status: "qr", message: "QR code generated" });
      emitQR({ qr, timestamp: Date.now() });
    },
    onStatus: (payload: WhatsAppStatusPayload) => emitStatus(payload),
    onMessage: (msg: WhatsAppIncomingMessage) => emitMessage(msg),
  };

  const factory = env.WHATSAPP_USE_MOCK === "true" ? createMockClient : createOpenWAClient;

  startingPromise = factory(events)
    .then((client) => {
      activeClient = client;
    })
    .catch((error) => {
      activeClient = null;
      const msg = error instanceof Error ? error.message : String(error);
      emitStatus({ status: "disconnected", message: `Failed: ${msg}` });
    })
    .finally(() => {
      startingPromise = null;
    });

  return startingPromise;
}

export async function stopWhatsApp(): Promise<void> {
  if (startingPromise) {
    try {
      await startingPromise;
    } catch {
      // ignore
    }
  }
  if (activeClient) {
    await activeClient.disconnect();
    activeClient = null;
    rawOpenWAClient = null;
  }
  hostChatId = null;
  emitStatus({ status: "disconnected", message: "Session stopped by server" });
}

export async function sendWhatsAppMessage(chatId: string, text: string): Promise<void> {
  if (!activeClient) {
    app_log.error({ chatId }, "[WA] sendWhatsAppMessage: no activeClient");
    throw new WhatsAppError("WhatsApp session not initialized", "auth");
  }
  app_log.debug({ chatId, textPreview: text.slice(0, 50) }, "[WA] sendWhatsAppMessage: sending");
  await activeClient.sendText(chatId, text);
  app_log.debug({ chatId }, "[WA] sendWhatsAppMessage: sent successfully");
}
