import { describe, expect, it, vi } from "vitest";

import { resolveSessionCredentials } from "../src/lib/auth/credentials";

describe("auth credentials", () => {
  it("authenticates an active database user without selecting a role", async () => {
    const findActiveUserByCredentials = vi.fn(async () => ({
      role: "MANAGER" as const,
      userName: "Мария",
    }));

    await expect(
      resolveSessionCredentials(
        { login: "maria", password: "correct-password" },
        { findActiveUserByCredentials }
      )
    ).resolves.toEqual({
      role: "MANAGER",
      userName: "Мария",
    });
    expect(findActiveUserByCredentials).toHaveBeenCalledWith({
      login: "maria",
      password: "correct-password",
    });
  });

  it("uses the user's stored role instead of a role submitted by the form", async () => {
    const findActiveUserByCredentials = vi.fn(async () => ({
      role: "ADMIN" as const,
      userName: "Администратор",
    }));

    await expect(
      resolveSessionCredentials(
        { login: "admin", password: "correct-password", role: "MANAGER" },
        { findActiveUserByCredentials }
      )
    ).resolves.toEqual({
      role: "ADMIN",
      userName: "Администратор",
    });
  });

  it("does not fall back to role passwords after a failed login-based attempt", async () => {
    const findActiveUserByCredentials = vi.fn(async () => null);

    await expect(
      resolveSessionCredentials(
        { login: "unknown", password: "admin", role: "ADMIN" },
        { findActiveUserByCredentials }
      )
    ).resolves.toBeNull();
  });

  it("rejects blank-login role-password fallback", async () => {
    await expect(
      resolveSessionCredentials({ login: "", password: "manager", role: "MANAGER" })
    ).resolves.toBeNull();
  });
});
