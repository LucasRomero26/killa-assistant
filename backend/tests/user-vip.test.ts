import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSingle = vi.fn();

vi.mock("../src/config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  },
}));

import { isUserVip } from "../src/services/user-vip.js";

describe("user-vip service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when the database row has is_vip=true", async () => {
    mockSingle.mockResolvedValueOnce({ data: { is_vip: true }, error: null });

    const result = await isUserVip("user-vip-id");
    expect(result).toBe(true);
  });

  it("should return false when the database row has is_vip=false", async () => {
    mockSingle.mockResolvedValueOnce({ data: { is_vip: false }, error: null });

    const result = await isUserVip("user-regular-id");
    expect(result).toBe(false);
  });

  it("should return false when the user row does not exist", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } });

    const result = await isUserVip("user-missing");
    expect(result).toBe(false);
  });
});
