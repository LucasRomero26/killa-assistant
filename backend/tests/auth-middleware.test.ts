import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/supabase.js", () => {
  const mockGetUser = vi.fn();
  return {
    supabaseAnon: {
      auth: {
        getUser: mockGetUser,
      },
    },
    supabaseAdmin: {},
    __mockGetUser: mockGetUser,
  };
});

import { extractUserIdFromRequest, extractUserIdOptional } from "../src/utils/auth-middleware.js";

const supabaseMock = await import("../src/config/supabase.js") as unknown as { __mockGetUser: ReturnType<typeof vi.fn> };
const mockGetUser = supabaseMock.__mockGetUser;

function mockRequest(overrides: { headers?: Record<string, string>; body?: unknown; query?: Record<string, string> } = {}) {
  return {
    headers: { ...(overrides.headers ?? {}) },
    body: overrides.body,
    query: overrides.query,
  } as never;
}

function mockReply() {
  const calls: Array<{ code: number; payload: unknown }> = [];
  return {
    code(c: number) {
      calls.push({ code: c, payload: undefined });
      return this;
    },
    send(payload: unknown) {
      const last = calls[calls.length - 1];
      if (last) last.payload = payload;
      return this;
    },
    calls,
  } as unknown as { code: (n: number) => unknown; send: (p: unknown) => unknown };
}

describe("auth-middleware — extractUserIdFromRequest", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("extracts userId from a valid JWT", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "uuid-from-jwt-123" } },
      error: null,
    });

    const req = mockRequest({ headers: { authorization: "Bearer some.jwt.token" } });
    const reply = mockReply();

    const userId = await extractUserIdFromRequest(req, reply);
    expect(userId).toBe("uuid-from-jwt-123");
    expect(mockGetUser).toHaveBeenCalledWith("some.jwt.token");
  });

  it("returns 401 when JWT is invalid or expired", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "invalid token" },
    });

    const req = mockRequest({ headers: { authorization: "Bearer bad.token" } });
    const reply = mockReply();

    const userId = await extractUserIdFromRequest(req, reply);
    expect(userId).toBeNull();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const req = mockRequest({ headers: { "x-killa-user-id": "user-42" } });
    const reply = mockReply();

    const userId = await extractUserIdFromRequest(req, reply);
    expect(userId).toBeNull();
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    const req = mockRequest({ headers: { authorization: "Basic xyz" } });
    const reply = mockReply();

    const userId = await extractUserIdFromRequest(req, reply);
    expect(userId).toBeNull();
  });

  it("does NOT fall back to x-killa-user-id header (security: no legacy fallback)", async () => {
    const req = mockRequest({ headers: { "x-killa-user-id": "attacker-uuid" } });
    const reply = mockReply();

    const userId = await extractUserIdFromRequest(req, reply);
    expect(userId).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("does NOT fall back to body.userId (security: no legacy fallback)", async () => {
    const req = mockRequest({ body: { userId: "attacker-uuid" } });
    const reply = mockReply();

    const userId = await extractUserIdFromRequest(req, reply);
    expect(userId).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("does NOT fall back to query.userId (security: no legacy fallback)", async () => {
    const req = mockRequest({ query: { userId: "attacker-uuid" } });
    const reply = mockReply();

    const userId = await extractUserIdFromRequest(req, reply);
    expect(userId).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

describe("auth-middleware — extractUserIdOptional", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns userId when JWT is valid", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "uuid-optional-123" } },
      error: null,
    });

    const req = mockRequest({ headers: { authorization: "Bearer valid.jwt.token" } });
    const userId = await extractUserIdOptional(req);
    expect(userId).toBe("uuid-optional-123");
  });

  it("returns null when no JWT is present (does not send 401)", async () => {
    const req = mockRequest({ headers: {} });
    const userId = await extractUserIdOptional(req);
    expect(userId).toBeNull();
  });

  it("returns null when JWT is invalid (does not send 401)", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "expired" },
    });

    const req = mockRequest({ headers: { authorization: "Bearer expired.token" } });
    const userId = await extractUserIdOptional(req);
    expect(userId).toBeNull();
  });
});
