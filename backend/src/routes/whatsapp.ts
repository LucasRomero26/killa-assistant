import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  startWhatsAppBot,
  stopWhatsApp,
  getWhatsAppConnectionStatus,
  getLastWhatsAppQR,
  clearLastWhatsAppQR,
  onWhatsAppQR,
  onWhatsAppStatus,
} from "../services/whatsapp.js";
import {
  createWhatsAppLinkToken,
  getWhatsAppLinkStatus,
  unlinkWhatsApp,
} from "../services/whatsapp-link.js";
import { logActivity } from "../utils/activity-log.js";
import { extractUserIdFromRequest } from "../utils/auth-middleware.js";
import { requireAdmin } from "../utils/admin-auth.js";

export async function whatsappAdminRoutes(app: FastifyInstance) {
  app.get("/admin/qr-page", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>KillaAssistant — WhatsApp Bot QR</title>
<style>
  body { margin:0; background:#1a1a1a; color:#eee; font-family: system-ui, -apple-system, sans-serif;
         display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; padding:16px }
  h1 { font-weight:600; margin:0 0 8px }
  p.subtle { color:#999; margin:0 0 24px; text-align:center; max-width:520px; line-height:1.5 }
  .card { background:#222; border-radius:16px; padding:24px; box-shadow:0 8px 32px rgba(0,0,0,.4) }
  img { width:340px; height:340px; image-rendering:pixelated; background:#fff; border-radius:12px; display:block }
  #status { text-align:center; margin-top:16px; color:#999; font-size:14px }
  .ok { color:#22c55e }
  .err { color:#ef4444 }
  button { margin-top:16px; background:#3b82f6; color:#fff; border:none; padding:10px 18px;
           border-radius:8px; font-size:14px; cursor:pointer }
  button:hover { background:#2563eb }
</style>
</head>
<body>
  <h1>KillaAssistant</h1>
  <p class="subtle">Scan this QR with the <b>dedicated WhatsApp number</b> that will act as the bot. Refresh the page if the QR expires (every ~5 min).</p>
  <div class="card">
    <img id="qr" alt="QR loading..."/>
    <div id="status">Connecting...</div>
  </div>
  <button onclick="location.reload()">Refresh QR</button>

<script>
const adminToken = new URLSearchParams(location.search).get('adminToken') || location.hash.slice(1);
if (!adminToken) {
  document.getElementById('status').textContent = 'Missing adminToken query param';
  throw new Error('no token');
}
const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws/whatsapp/qr?adminToken=' + encodeURIComponent(adminToken);
let ws = null;
let lastQr = null;

function connect() {
  ws = new WebSocket(wsUrl);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'qr') {
      lastQr = msg.payload.qr;
      document.getElementById('qr').src = lastQr;
      document.getElementById('status').textContent = 'QR ready — scan with WhatsApp';
      document.getElementById('status').className = 'ok';
    } else if (msg.type === 'status') {
      const s = msg.payload.status;
      if (s === 'ready' || s === 'authenticated') {
        document.getElementById('status').textContent = 'WhatsApp connected successfully!';
        document.getElementById('status').className = 'ok';
        document.getElementById('qr').style.display = 'none';
      } else if (s === 'qr') {
        document.getElementById('status').textContent = 'QR ready — scan with WhatsApp';
        document.getElementById('status').className = 'ok';
      } else if (s === 'connecting') {
        document.getElementById('status').textContent = 'Bot starting...';
      } else {
        document.getElementById('status').textContent = 'Status: ' + s;
      }
    }
  };
  ws.onerror = () => {
    document.getElementById('status').textContent = 'WebSocket error — check server logs';
    document.getElementById('status').className = 'err';
  };
  ws.onclose = () => {
    document.getElementById('status').textContent = 'Connection closed. Refreshing in 5s...';
    setTimeout(connect, 5000);
  };
}
connect();
</script>
</body>
</html>`;

    reply.type("text/html").send(html);
  });

  app.post("/admin/start", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireAdmin(request, reply)) return;

    try {
      await startWhatsAppBot();
      return reply.code(202).send({ ok: true, message: "WhatsApp bot session starting" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      app.log.error({ err: error }, "Failed to start WhatsApp bot session");
      return reply.code(500).send({ error: msg });
    }
  });

  app.post("/stop", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    try {
      await stopWhatsApp();
      return reply.code(200).send({ ok: true, message: "WhatsApp session stopped" });
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.get("/status", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  }, async (_request, reply) => {
    const status = getWhatsAppConnectionStatus();
    return reply.code(200).send(status);
  });

  app.post("/link-token", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdFromRequest(request, reply);
    if (!userId) return;

    try {
      const result = await createWhatsAppLinkToken(userId);
      return reply.code(200).send(result);
    } catch (error) {
      app.log.error({ err: error }, "Failed to create WhatsApp link token");
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.get("/link-status", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdFromRequest(request, reply);
    if (!userId) return;

    try {
      const status = await getWhatsAppLinkStatus(userId);
      return reply.code(200).send(status);
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.delete("/unlink", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await extractUserIdFromRequest(request, reply);
    if (!userId) return;

    try {
      await unlinkWhatsApp(userId);
      await logActivity({
        userId,
        source: "whatsapp",
        level: "success",
        message: "WhatsApp account unlinked",
      });
      return reply.code(200).send({ ok: true, message: "WhatsApp unlinked" });
    } catch (error) {
      app.log.error({ err: error }, "Failed to unlink WhatsApp");
      return reply.code(500).send({ error: (error as Error).message });
    }
  });
}

export async function whatsappWebSocketRoutes(app: FastifyInstance) {
  app.get("/ws/whatsapp/qr", { websocket: true }, (socket, request) => {
    if (!requireAdmin(request, socket as unknown as FastifyReply)) {
      try {
        socket.close();
      } catch {
        // ignore
      }
      return;
    }

    app.log.info("Admin WebSocket client connected for WhatsApp QR stream");

    const currentStatus = getWhatsAppConnectionStatus();
    socket.send(
      JSON.stringify({
        type: "status",
        payload: currentStatus,
      })
    );

    // Send the last cached QR (if any) immediately, so the admin doesn't have
    // to wait for OpenWA to generate the next one (~10-20s).
    const lastQR = getLastWhatsAppQR();
    if (lastQR && currentStatus.status === "qr") {
      try {
        socket.send(
          JSON.stringify({
            type: "qr",
            payload: lastQR,
          })
        );
      } catch {
        // socket may be closed
      }
    }

    const removeQR = onWhatsAppQR((payload) => {
      try {
        socket.send(
          JSON.stringify({
            type: "qr",
            payload,
          })
        );
      } catch {
        // socket may be closed
      }
    });

    const removeStatus = onWhatsAppStatus((payload) => {
      try {
        socket.send(
          JSON.stringify({
            type: "status",
            payload,
          })
        );
        // Clear cached QR once the session is authenticated/ready.
        if (payload.status === "ready" || payload.status === "authenticated") {
          clearLastWhatsAppQR();
        }
      } catch {
        // socket may be closed
      }
    });

    socket.on("close", () => {
      removeQR();
      removeStatus();
      app.log.info("WebSocket client disconnected from WhatsApp QR stream");
    });

    socket.on("error", (err: Error) => {
      app.log.error({ err }, "WhatsApp WebSocket error");
      removeQR();
      removeStatus();
    });
  });
}
