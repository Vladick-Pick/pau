import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  verifySessionToken,
} from "../src/lib/auth/session";

const secret = "test-secret-with-enough-length";
const issuedAt = new Date("2026-05-24T07:00:00.000Z");

describe("auth session tokens", () => {
  it("round-trips a signed role session", async () => {
    const token = await createSessionToken(
      { role: "MANAGER", userName: "Мария" },
      { secret, now: issuedAt, maxAgeSeconds: 3600 }
    );

    const session = await verifySessionToken(token, {
      secret,
      now: new Date("2026-05-24T07:30:00.000Z"),
    });

    expect(session).toEqual({
      role: "MANAGER",
      userName: "Мария",
      expiresAt: new Date("2026-05-24T08:00:00.000Z"),
    });
  });

  it("rejects expired or tampered sessions", async () => {
    const token = await createSessionToken(
      { role: "VIEWER", userName: "Гость" },
      { secret, now: issuedAt, maxAgeSeconds: 60 }
    );

    await expect(
      verifySessionToken(token, {
        secret,
        now: new Date("2026-05-24T07:02:00.000Z"),
      })
    ).resolves.toBeNull();

    await expect(
      verifySessionToken(`${token.slice(0, -1)}x`, {
        secret,
        now: new Date("2026-05-24T07:00:30.000Z"),
      })
    ).resolves.toBeNull();
  });
});
