import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "../src/config/supabase.js";
import {
  createWhatsAppLinkToken,
  consumeWhatsAppLinkToken,
  getUserIdByWhatsAppChatId,
  getWhatsAppLinkStatus,
  unlinkWhatsApp,
} from "../src/services/whatsapp-link.js";

/**
 * Build a single query chain that records its terminal method calls.
 * Each chain method returns `this` so chained filters work, and terminal
 * methods (.single / .maybeSingle / await-thenable) resolve to `resolved`.
 */
function buildChain(resolved: {
  error: unknown;
  data: unknown;
  count?: number | null;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.insert = vi.fn(() => {
    const thenable = Promise.resolve(resolved);
    Object.assign(thenable, chain);
    return thenable;
  });

  chain.update = vi.fn(() => {
    const thenable = Promise.resolve(resolved);
    Object.assign(thenable, chain);
    return thenable;
  });

  chain.select = vi.fn(() => {
    Object.assign(chain, { single: vi.fn(() => Promise.resolve(resolved)) });
    Object.assign(chain, { maybeSingle: vi.fn(() => Promise.resolve(resolved)) });
    return chain;
  });

  chain.eq = vi.fn(() => {
    Object.assign(chain, { single: vi.fn(() => Promise.resolve(resolved)) });
    Object.assign(chain, { maybeSingle: vi.fn(() => Promise.resolve(resolved)) });
    const thenable = Promise.resolve(resolved);
    Object.assign(thenable, chain);
    // Allow .gt().select().single() / .gt().select().maybeSingle() chains
    (thenable as unknown as Record<string, unknown>).gt = vi.fn(() => {
      Object.assign(chain, { single: vi.fn(() => Promise.resolve(resolved)) });
      Object.assign(chain, { maybeSingle: vi.fn(() => Promise.resolve(resolved)) });
      return chain;
    });
    return thenable;
  });

  chain.delete = vi.fn(() => Promise.resolve(resolved));

  chain.gt = vi.fn(() => {
    Object.assign(chain, { single: vi.fn(() => Promise.resolve(resolved)) });
    Object.assign(chain, { maybeSingle: vi.fn(() => Promise.resolve(resolved)) });
    return chain;
  });

  chain.single = vi.fn(() => Promise.resolve(resolved));
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolved));

  return chain;
}

/**
 * Queue multiple chain responses in order.  Each `.from()` call pops the
 * next response from the front of the array.  If exhausted, returns the
 * last response again.
 */
function mockFromSequence(responses: Array<{
  error: unknown;
  data: unknown;
  count?: number | null;
}>) {
  const queue = [...responses];
  vi.mocked(supabaseAdmin.from).mockImplementation(() => {
    const next = queue.length > 0 ? queue.shift()! : responses[responses.length - 1];
    return buildChain(next) as never;
  });
}

describe("WhatsApp Link Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createWhatsAppLinkToken", () => {
    it("should generate a token with the KILLA- prefix", async () => {
      mockFromSequence([{ error: null, data: null }]);

      const result = await createWhatsAppLinkToken("user-abc");

      expect(result.token).toMatch(/^KILLA-[A-Z2-9]{6}$/);
      expect(result.botCommand).toBe(`/start ${result.token}`);
    });

    it("should throw when the DB insert fails", async () => {
      mockFromSequence([{ error: { message: "duplicate token" }, data: null }]);

      await expect(createWhatsAppLinkToken("user-abc")).rejects.toThrow("duplicate token");
    });
  });

  describe("consumeWhatsAppLinkToken", () => {
    it("should link successfully when the atomic claim matches a pending token", async () => {
      // 1st .from(): atomic UPDATE claim → success (count=1, returns id+user_id)
      // 2nd .from(): UPDATE conexiones_mensajeria → success
      mockFromSequence([
        { error: null, data: { id: "tok-1", user_id: "u1" }, count: 1 },
        { error: null, data: null },
      ]);

      const result = await consumeWhatsAppLinkToken("KILLA-ABC123", "555@c.us");

      expect(result.success).toBe(true);
      expect(result.userId).toBe("u1");
    });

    it("should return invalid_token when the token does not exist", async () => {
      // 1st .from(): atomic claim returns 0 rows (count=0, error/empty)
      // 2nd .from(): SELECT to classify → no row found (maybeSingle → null)
      mockFromSequence([
        { error: { code: "PGRST116" }, data: null, count: 0 },
        { error: null, data: null },
      ]);

      const result = await consumeWhatsAppLinkToken("KILLA-NOPE", "555@c.us");

      expect(result.success).toBe(false);
      expect(result.error).toBe("invalid_token");
    });

    it("should return already_used when the token status is not pending", async () => {
      // 1st .from(): atomic claim fails because status !== 'pending' (count=0)
      // 2nd .from(): SELECT classify → status = 'linked'
      mockFromSequence([
        { error: { code: "PGRST116" }, data: null, count: 0 },
        { error: null, data: { status: "linked", expires_at: new Date(Date.now() + 600_000).toISOString() } },
      ]);

      const result = await consumeWhatsAppLinkToken("KILLA-LINK", "555@c.us");

      expect(result.success).toBe(false);
      expect(result.error).toBe("already_used");
    });

    it("should return expired when the token has expired", async () => {
      // 1st .from(): atomic claim fails because .gt("expires_at", now) excludes it (count=0)
      // 2nd .from(): SELECT classify → status='pending' but expires_at in past
      mockFromSequence([
        { error: { code: "PGRST116" }, data: null, count: 0 },
        { error: null, data: { status: "pending", expires_at: new Date(Date.now() - 1000).toISOString() } },
      ]);

      const result = await consumeWhatsAppLinkToken("KILLA-OLD", "555@c.us");

      expect(result.success).toBe(false);
      expect(result.error).toBe("expired");
    });

    it("should return db_error when the messaging connection update fails", async () => {
      // 1st .from(): atomic claim succeeds (count=1)
      // 2nd .from(): UPDATE conexiones_mensajeria → error
      mockFromSequence([
        { error: null, data: { id: "tok-2", user_id: "u2" }, count: 1 },
        { error: { message: "connection update failed" }, data: null },
      ]);

      const result = await consumeWhatsAppLinkToken("KILLA-OK", "555@c.us");

      expect(result.success).toBe(false);
      expect(result.error).toBe("db_error");
    });
  });

  describe("getUserIdByWhatsAppChatId", () => {
    it("should return userId when a connected row exists", async () => {
      mockFromSequence([{ error: null, data: { user_id: "user-xyz" } }]);

      const result = await getUserIdByWhatsAppChatId("555@c.us");

      expect(result).toBe("user-xyz");
    });

    it("should return null when no row matches", async () => {
      mockFromSequence([{ error: { message: "no row" }, data: null }]);

      const result = await getUserIdByWhatsAppChatId("999@c.us");

      expect(result).toBeNull();
    });
  });

  describe("getWhatsAppLinkStatus", () => {
    it("should return linked:true when status is connected and chat_id present", async () => {
      mockFromSequence([{ error: null, data: { chat_id: "555@c.us", status: "connected" } }]);

      const result = await getWhatsAppLinkStatus("user-1");

      expect(result.linked).toBe(true);
      expect(result.chatId).toBe("555@c.us");
    });

    it("should return linked:false when status is disconnected", async () => {
      mockFromSequence([{ error: null, data: { chat_id: null, status: "disconnected" } }]);

      const result = await getWhatsAppLinkStatus("user-2");

      expect(result.linked).toBe(false);
      expect(result.chatId).toBeNull();
    });

    it("should return linked:false when the row does not exist", async () => {
      mockFromSequence([{ error: { message: "no row" }, data: null }]);

      const result = await getWhatsAppLinkStatus("user-3");

      expect(result.linked).toBe(false);
    });
  });

  describe("unlinkWhatsApp", () => {
    it("should resolve when the update succeeds", async () => {
      mockFromSequence([{ error: null, data: null }]);

      await expect(unlinkWhatsApp("user-1")).resolves.toBeUndefined();
    });

    it("should reject when the DB update fails", async () => {
      mockFromSequence([{ error: { message: "constraint violation" }, data: null }]);

      await expect(unlinkWhatsApp("user-1")).rejects.toThrow("constraint violation");
    });
  });
});
