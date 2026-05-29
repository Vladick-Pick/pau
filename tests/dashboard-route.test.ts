import { describe, expect, it, vi } from "vitest";

describe("dashboard API route", () => {
  it("requires at least viewer access before returning the workspace snapshot", async () => {
    vi.resetModules();
    const getPauWorkspaceSnapshot = vi.fn(async () => ({
      demoMode: true,
      integrationStatus: {
        database: false,
        bitrix: false,
        matching: false,
        openrouter: false,
      },
      summary: {
        upcomingEvents: 0,
        pastEvents: 0,
        invitedParticipants: 0,
        confirmedParticipants: 0,
        activeParticipants: 0,
        briefs: 0,
      },
      upcomingEvents: [],
      pastEvents: [],
      formats: [],
      briefs: [],
      users: [],
    }));

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      })),
    }));
    vi.doMock("@/lib/pau/dashboard", () => ({
      getPauWorkspaceSnapshot,
    }));

    const { GET } = await import("../src/app/api/dashboard/route");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getPauWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
