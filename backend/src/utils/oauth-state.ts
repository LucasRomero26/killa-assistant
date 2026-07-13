import crypto from "crypto";
import { env } from "../config/env.js";

const KEY = Buffer.from(env.ENCRYPTION_KEY, "hex");

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const mac = crypto.createHmac("sha256", KEY).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifyState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const userId = parts[0];
  const timestamp = Number(parts[1]);
  const mac = parts[2];

  if (!userId || !Number.isFinite(timestamp)) return null;

  const expectedMac = crypto
    .createHmac("sha256", KEY)
    .update(`${userId}.${timestamp}`)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectedMac))) {
    return null;
  }

  const ageMs = Date.now() - timestamp;
  const MAX_AGE_MS = 10 * 60 * 1000;
  if (ageMs > MAX_AGE_MS || ageMs < -60_000) return null;

  return userId;
}
