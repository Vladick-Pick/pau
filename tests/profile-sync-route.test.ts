import { describe, expect, it, vi } from "vitest";

describe("POST /api/profile/sync", () => {
  it("returns 401 when not authenticated", async () => {
    vi.resetModules();

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      })),
    }));
    vi.doMock("@/lib/profile/sync", () => ({
      syncAllClubs: vi.fn(),
    }));

    const { POST } = await import("../src/app/api/profile/sync/route");
    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when authenticated but not MANAGER", async () => {
    vi.resetModules();

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: null,
        response: Response.json({ error: "Forbidden" }, { status: 403 }),
      })),
    }));
    vi.doMock("@/lib/profile/sync", () => ({
      syncAllClubs: vi.fn(),
    }));

    const { POST } = await import("../src/app/api/profile/sync/route");
    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("calls syncAllClubs and returns results when MANAGER", async () => {
    vi.resetModules();

    const syncAllClubs = vi.fn(async () => [
      { clubId: "ws_test_1", synced: 5, failed: 0 },
      { clubId: "ws_test_2", synced: 3, failed: 1 },
    ]);

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/profile/sync", () => ({
      syncAllClubs,
    }));

    const { POST } = await import("../src/app/api/profile/sync/route");
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        { clubId: "ws_test_1", synced: 5, failed: 0 },
        { clubId: "ws_test_2", synced: 3, failed: 1 },
      ],
    });
    expect(syncAllClubs).toHaveBeenCalledTimes(1);
  });

  it("returns 400 with an error message when syncAllClubs throws", async () => {
    vi.resetModules();

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/profile/sync", () => ({
      syncAllClubs: vi.fn(async () => {
        throw new Error("Profile API unavailable");
      }),
    }));

    const { POST } = await import("../src/app/api/profile/sync/route");
    const response = await POST();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Profile API unavailable",
    });
  });
});
