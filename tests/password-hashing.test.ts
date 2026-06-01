import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../src/lib/auth/passwords";

describe("password hashing", () => {
  it("stores new user passwords with scrypt", async () => {
    const storedHash = await hashPassword("correct-password");

    expect(storedHash.startsWith("scrypt:")).toBe(true);
    await expect(verifyPassword("correct-password", storedHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", storedHash)).resolves.toBe(false);
  });

  it("keeps verifying legacy salted sha256 hashes", async () => {
    const legacyHash =
      "salt:" +
      "291e247d155354e48fec2b579637782446821935fc96a5a08a0b7885179c408b";

    await expect(verifyPassword("password", legacyHash)).resolves.toBe(true);
  });
});
