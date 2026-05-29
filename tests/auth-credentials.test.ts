import { describe, expect, it, vi } from "vitest";

import { resolveSessionCredentials } from "../src/lib/auth/credentials";

describe("auth credentials", () => {
  it("authenticates an active database user when a login is provided", async () => {
    const findActiveUserByCredentials = vi.fn(async () => ({
      role: "MANAGER" as const,
      userName: "Мария",
    }));

    await expect(
      resolveSessionCredentials(
        { login: "maria", password: "correct-password", role: "ADMIN" },
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

  it("does not fall back to role passwords after a failed login-based attempt", async () => {
    const findActiveUserByCredentials = vi.fn(async () => null);

    await expect(
      resolveSessionCredentials(
        { login: "unknown", password: "admin", role: "ADMIN" },
        { findActiveUserByCredentials }
      )
    ).resolves.toBeNull();
  });

  it("keeps role-password fallback for development access when login is blank", async () => {
    await expect(
      resolveSessionCredentials({ login: "", password: "manager", role: "MANAGER" })
    ).resolves.toEqual({
      role: "MANAGER",
      userName: "Менеджер",
    });
  });
});
