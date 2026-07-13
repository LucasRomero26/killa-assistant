import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../src/utils/crypto.js";

describe("AES-256-GCM crypto", () => {
  it("should round-trip encrypt then decrypt", () => {
    const plaintext = "ya29.a0ARrdaM...refresh_token_secret_value";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("should produce base64 output", () => {
    const ciphertext = encrypt("hello");
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("should produce different ciphertexts for same plaintext (random IV)", () => {
    const a = encrypt("same-secret");
    const b = encrypt("same-secret");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same-secret");
    expect(decrypt(b)).toBe("same-secret");
  });

  it("should handle unicode and long strings", () => {
    const plaintext = "Token con ñ y acentos áéíóú — ".repeat(50);
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("should fail to decrypt tampered ciphertext (auth tag verification)", () => {
    const ciphertext = encrypt("sensitive-refresh-token");
    const buf = Buffer.from(ciphertext, "base64");
    buf[buf.length - 1] ^= 0x01;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("should fail to decrypt if the auth tag is corrupted", () => {
    const ciphertext = encrypt("sensitive-refresh-token");
    const buf = Buffer.from(ciphertext, "base64");
    const TAG_OFFSET = 12;
    buf[TAG_OFFSET] ^= 0xff;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("should fail to decrypt if the IV is corrupted", () => {
    const ciphertext = encrypt("sensitive-refresh-token");
    const buf = Buffer.from(ciphertext, "base64");
    buf[0] ^= 0x80;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("should not leak plaintext into ciphertext", () => {
    const plaintext = "very-secretive-token-value-123456";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    const decoded = Buffer.from(ciphertext, "base64").toString("utf8");
    expect(decoded).not.toContain(plaintext);
  });
});
