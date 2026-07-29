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

// Completely remove the persisted Chromium/WhatsApp-Web profile. This is
// required after a genuine logout (UNPAIRED): re-scanning a QR against a
// leftover, half-dead profile makes WhatsApp reject the pairing with
// "Couldn't link device". A clean profile guarantees a fresh, scannable QR.
function wipeSessionProfile(): void {
  try {
    rmSync(SESSION_DIR, { recursive: true, force: true });
    mkdirSync(SESSION_DIR, { recursive: true });
    app_log.warn({ dir: SESSION_DIR }, "[WA] session profile wiped for a clean re-pair");
  } catch (err) {
    app_log.error({ err }, "[WA] failed to wipe session profile");
  }
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

// --- Session health watchdog state ---
// WhatsApp can silently log the linked device out (CONFLICT, UNPAIRED, a
// Terms-of-Service block, or the ~14-day linked-device expiry). When that
// happens OpenWA keeps a zombie Chromium session alive, so we must actively
// probe the REAL connection state (client.getConnectionState()) instead of
// trusting a stale lastStatus. Without this, /status reported "ready" for days
// while no messages were being delivered. See getWhatsAppConnectionStatus().
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownRealState: string | null = null;
let consecutiveUnhealthy = 0;
let everConnected = false;
let recovering = false;

let shuttingDown = false;

const WATCHDOG_INTERVAL_MS = 60_000;
const MAX_UNHEALTHY_TICKS = 3;
// States OpenWA may briefly report while (re)connecting — tolerated for a few
// ticks before we consider the session genuinely lost.
const TRANSIENT_STATES = new Set(["OPENING", "PAIRING", "TIMEOUT"]);
// States that mean the device was de-authenticated (manual logout, 14-day
// linked-device expiry, ToS/ban). Recovery MUST wipe the profile so the next
// QR pairs cleanly.
const LOGOUT_STATES = new Set(["UNPAIRED", "UNPAIRED_IDLE", "TOS_BLOCK", "SMB_TOS_BLOCK"]);

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
  if (payload.status === "ready" || payload.status === "authenticated") {
    everConnected = true;
  }
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

  // Source of truth: the watchdog's most recent REAL probe of the OpenWA
  // client (client.getConnectionState()). We deliberately do NOT trust a stale
  // lastStatus === "ready" here. WhatsApp can log the device out silently and
  // leave a zombie Chromium session — the previous implementation reported
  // "ready" for days in exactly that situation while no messages flowed.
  if (lastKnownRealState !== null) {
    const connected = lastKnownRealState === "CONNECTED";
    return {
      connected,
      status: connected ? "ready" : lastStatus === "qr" ? "qr" : "disconnected",
    };
  }

  // The watchdog has not completed its first probe yet — fall back to the
  // wrapper's own connected flag (set by OpenWA lifecycle callbacks).
  const wrapperConnected = activeClient.isConnected();
  return {
    connected: wrapperConnected,
    status: wrapperConnected ? "ready" : lastStatus === "qr" ? "qr" : "connecting",
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
    if (state === "CONFLICT" || state === "LOGOUT" || state === "UNPAIRED" || state === "UNPAIRED_IDLE") {
      connected = false;
      // Self-heal only if the session had actually connected; otherwise it is
      // just waiting for the operator to scan the initial QR.
      if (everConnected) {
        void recoverSession(state, state !== "CONFLICT");
      } else {
        emitStatus({ status: "disconnected", message: `State: ${state}` });
      }
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
    // Delete the stale session data file on logout so a subsequent restart
    // performs a clean login instead of resurrecting a dead session.
    deleteSessionDataOnLogout: true,
    ...(sessionPath ? { userDataDir: sessionPath, sessionDataPath: sessionPath } : {}),
    onStateChanged: (state: string) => {
      app_log.info({ state }, "[WA] onStateChanged fired");
      if (state === "CONFLICT" || state === "UNPAIRED" || state === "UNPAIRED_IDLE" || state === "LOGOUT") {
        connected = false;
        // CONFLICT/UNLAUNCHED can often be recovered by refocusing the tab
        // without a full restart (per OpenWA "Detecting Logouts" guidance).
        if (state === "CONFLICT") {
          const raw = rawOpenWAClient as unknown as { forceRefocus?: () => Promise<boolean> } | null;
          try {
            void raw?.forceRefocus?.();
          } catch {
            // best-effort
          }
        }
        if (everConnected) {
          void recoverSession(state, state !== "CONFLICT");
        } else {
          emitStatus({ status: "disconnected", message: `State: ${state}` });
          events.onStatus?.({ status: "disconnected", message: `State: ${state}` });
        }
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
    // NOTE: OpenWA's client.isConnected() is ASYNC (returns Promise<boolean>).
    // The previous code used it synchronously, so `isOpen` was always a truthy
    // Promise and the session was force-marked "ready" even when it wasn't.
    const isOpen =
      typeof client?.isConnected === "function" && (await client.isConnected());
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
 * Probe the REAL OpenWA connection state. Returns the STATE string
 * ("CONNECTED", "CONFLICT", "UNPAIRED", "TIMEOUT", ...) or null if the client
 * is unavailable / the probe throws.
 */
async function probeConnectionState(): Promise<string | null> {
  const raw = rawOpenWAClient as unknown as {
    getConnectionState?: () => Promise<string>;
  } | null;
  if (!raw || typeof raw.getConnectionState !== "function") return null;
  try {
    return await raw.getConnectionState();
  } catch (err) {
    app_log.warn({ err }, "[WA] watchdog: getConnectionState() probe failed");
    return null;
  }
}

/**
 * Tear down an unhealthy session and restart the bot. If the linked device is
 * still authorized, OpenWA reconnects automatically from the persisted
 * Chromium profile; otherwise it emits a fresh QR at the admin QR page so the
 * operator can re-scan. When `wipeProfile` is true (genuine logout) the
 * persisted profile is deleted first so the new QR pairs cleanly.
 * Guarded by `recovering` / `shuttingDown` to avoid concurrent restarts.
 */
async function recoverSession(reason: string, wipeProfile = false): Promise<void> {
  if (recovering || shuttingDown) return;
  recovering = true;
  app_log.error(
    { reason, wipeProfile },
    "[WA] recovering session — tearing down and restarting"
  );
  emitStatus({
    status: "disconnected",
    message: wipeProfile
      ? `WhatsApp logged out (${reason}) — restarting; scan the QR again to reconnect`
      : `WhatsApp session unhealthy (${reason}) — restarting; re-scan the QR if it does not reconnect`,
  });

  consecutiveUnhealthy = 0;
  lastKnownRealState = null;
  everConnected = false;
  const dying = activeClient;
  activeClient = null;
  rawOpenWAClient = null;
  hostChatId = null;

  // Close the browser BEFORE wiping the profile — the profile cannot be
  // safely removed while Chromium still holds it open.
  if (dying) {
    try {
      await dying.disconnect();
    } catch {
      // best-effort teardown
    }
  }

  if (wipeProfile) {
    wipeSessionProfile();
  }

  recovering = false;

  if (shuttingDown) return;
  startWhatsAppBot().catch((err) =>
    app_log.error({ err }, "[WA] restart after recovery failed")
  );
}

async function watchdogTick(): Promise<void> {
  if (recovering || startingPromise || !activeClient) return;

  const state = await probeConnectionState();
  if (state !== null) {
    lastKnownRealState = state;
  }

  if (state === "CONNECTED") {
    consecutiveUnhealthy = 0;
    everConnected = true;
    if (lastStatus !== "ready") {
      emitStatus({ status: "ready", message: "WhatsApp session healthy (watchdog)" });
    }
    // Keep the WhatsApp Web tab focused to reduce idle-driven disconnects.
    try {
      const raw = rawOpenWAClient as unknown as { forceRefocus?: () => Promise<boolean> } | null;
      if (raw && typeof raw.forceRefocus === "function") {
        await raw.forceRefocus();
      }
    } catch {
      // best-effort keepalive
    }
    return;
  }

  consecutiveUnhealthy += 1;
  app_log.warn(
    { state, consecutiveUnhealthy, everConnected },
    "[WA] watchdog: session not CONNECTED"
  );

  const isLogout = state !== null && LOGOUT_STATES.has(state);
  const isTransient = state !== null && TRANSIENT_STATES.has(state);
  const terminal = state !== null && !isTransient && !isLogout;

  // Only force a restart when a previously-working session dropped. A session
  // that has never connected is simply waiting for the operator to scan the
  // QR — restarting it in a loop would just churn Chromium and rotate the QR.
  // A confirmed logout wipes the profile so the fresh QR pairs cleanly.
  if (everConnected && (isLogout || terminal || consecutiveUnhealthy >= MAX_UNHEALTHY_TICKS)) {
    await recoverSession(state ?? "unknown", isLogout);
  }
}

function startWatchdog(): void {
  if (watchdogTimer) return;
  consecutiveUnhealthy = 0;
  watchdogTimer = setInterval(() => {
    void watchdogTick();
  }, WATCHDOG_INTERVAL_MS);
  if (typeof watchdogTimer.unref === "function") watchdogTimer.unref();
  app_log.info({ intervalMs: WATCHDOG_INTERVAL_MS }, "[WA] session health watchdog started");
}

function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  lastKnownRealState = null;
  consecutiveUnhealthy = 0;
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
      startWatchdog();
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
  stopWatchdog();
  everConnected = false;
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

/**
 * Gracefully shut down the WhatsApp session on process termination
 * (SIGTERM / SIGINT). Closing Chromium cleanly persists the session profile
 * correctly; a hard kill can leave a corrupt profile that later refuses to
 * re-pair ("Couldn't link device"). Best-effort with a hard timeout so it
 * never blocks container shutdown.
 */
export async function shutdownWhatsApp(timeoutMs = 8_000): Promise<void> {
  shuttingDown = true;
  stopWatchdog();
  await Promise.race([
    stopWhatsApp(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
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
