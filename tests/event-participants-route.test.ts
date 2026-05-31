import { describe, expect, it, vi } from "vitest";

describe("event participant API route", () => {
  it("updates a manual active attendance mark", async () => {
    vi.resetModules();
    const updateEventParticipantAttendance = vi.fn(async () => ({
      id: "active-1",
      attendanceMarked: true,
    }));

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/pau/dashboard", () => ({
      updateEventParticipantAttendance,
    }));

    const { PATCH } = await import(
      "../src/app/api/events/[eventId]/participants/[participantId]/route"
    );
    const response = await PATCH(
      new Request("http://local.test", {
        method: "PATCH",
        body: JSON.stringify({ attendanceMarked: true }),
      }),
      {
        params: Promise.resolve({
          eventId: "event-1",
          participantId: "active-1",
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      participant: {
        id: "active-1",
        attendanceMarked: true,
      },
    });
    expect(updateEventParticipantAttendance).toHaveBeenCalledWith({
      eventId: "event-1",
      participantId: "active-1",
      attendanceMarked: true,
    });
  });
});
