import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/server/config/env", () => ({
  env: { ADMIN_TOKEN: "super-secret-admin-token" },
}));

import { getSessionUserId, requireAdmin } from "@/server/http/auth";

describe("getSessionUserId", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns the user id when the session cookie is valid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    expect(await getSessionUserId()).toBe("user-1");
  });

  it("returns null when Supabase rejects the session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect(await getSessionUserId()).toBeNull();
  });

  it("returns null when the client throws", async () => {
    mockGetUser.mockRejectedValue(new Error("network"));
    expect(await getSessionUserId()).toBeNull();
  });
});

describe("requireAdmin", () => {
  function req(headers: Record<string, string> = {}, query = "") {
    return new Request(`http://localhost/api/telegram/setup-webhook${query}`, { headers });
  }

  it("allows a matching x-admin-token header", () => {
    expect(requireAdmin(req({ "x-admin-token": "super-secret-admin-token" }))).toBeNull();
  });

  it("allows a matching adminToken query param", () => {
    expect(requireAdmin(req({}, "?adminToken=super-secret-admin-token"))).toBeNull();
  });

  it("rejects a wrong token with 403", async () => {
    const res = requireAdmin(req({ "x-admin-token": "nope" }));
    expect(res?.status).toBe(403);
  });

  it("rejects a missing token with 403", () => {
    expect(requireAdmin(req())?.status).toBe(403);
  });
});
