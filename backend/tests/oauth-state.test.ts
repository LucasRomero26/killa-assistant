import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signState, verifyState } from "../src/utils/oauth-state.js";

describe("OAuth state signing (CSRF protection)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should sign and verify a valid state", () => {
    const state = signState("user-42");
    expect(verifyState(state)).toBe("user-42");
  });

  it("should reject a tampered userId in state", () => {
    const state = signState("user-42");
    const parts = state.split(".");
    parts[0] = "user-99";
    expect(verifyState(parts.join("."))).toBeNull();
  });

  it("should reject a tampered MAC", () => {
    const state = signState("user-42");
    const parts = state.split(".");
    parts[2] = "0".repeat(64);
    expect(verifyState(parts.join("."))).toBeNull();
  });

  it("should reject state older than 10 minutes", () => {
    const state = signState("user-42");
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(verifyState(state)).toBeNull();
  });

  it("should accept state within the 10-minute window", () => {
    const state = signState("user-42");
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(verifyState(state)).toBe("user-42");
  });

  it("should reject malformed state", () => {
    expect(verifyState("garbage")).toBeNull();
    expect(verifyState("a.b")).toBeNull();
    expect(verifyState("")).toBeNull();
  });
});
