import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolvePasswordRole,
  resolveSessionCredentials,
} from "../src/lib/auth/credentials";

describe("auth credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates an active database user when the selected role matches", async () => {
    const findActiveUserByCredentials = vi.fn(async () => ({
      role: "MANAGER" as const,
      userName: "Мария",
    }));

    await expect(
      resolveSessionCredentials(
        { login: "maria", password: "correct-password", role: "MANAGER" },
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

  it("rejects a database user when the selected role does not match", async () => {
    const findActiveUserByCredentials = vi.fn(async () => ({
      role: "ADMIN" as const,
      userName: "Администратор",
    }));

    await expect(
      resolveSessionCredentials(
        { login: "admin", password: "correct-password", role: "MANAGER" },
        { findActiveUserByCredentials }
      )
    ).resolves.toBeNull();
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

  it("rejects short role fallback passwords in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAU_ADMIN_PASSWORD", "short");

    expect(() => resolvePasswordRole("ADMIN", "short")).toThrow(
      "PAU_ADMIN_PASSWORD must be at least 16 characters in production"
    );
  });
});
