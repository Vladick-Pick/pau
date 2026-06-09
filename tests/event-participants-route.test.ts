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

  it("updates an active participant invitation decision", async () => {
    vi.resetModules();
    const updateEventParticipantActiveDecision = vi.fn(async () => ({
      id: "active-1",
      activeDecision: "DECLINED_BY_US",
      activeDecisionComment: "Не подходит по индустрии.",
    }));

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/pau/dashboard", () => ({
      updateEventParticipantActiveDecision,
      updateEventParticipantAttendance: vi.fn(),
    }));

    const { PATCH } = await import(
      "../src/app/api/events/[eventId]/participants/[participantId]/route"
    );
    const response = await PATCH(
      new Request("http://local.test", {
        method: "PATCH",
        body: JSON.stringify({
          activeDecision: "DECLINED_BY_US",
          activeDecisionComment: "Не подходит по индустрии.",
        }),
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
        activeDecision: "DECLINED_BY_US",
        activeDecisionComment: "Не подходит по индустрии.",
      },
    });
    expect(updateEventParticipantActiveDecision).toHaveBeenCalledWith({
      eventId: "event-1",
      participantId: "active-1",
      decision: "DECLINED_BY_US",
      comment: "Не подходит по индустрии.",
    });
  });

  it("rejects ambiguous participant patch payloads", async () => {
    vi.resetModules();
    const updateEventParticipantActiveDecision = vi.fn();
    const updateEventParticipantAttendance = vi.fn();

    vi.doMock("@/lib/api/auth", () => ({
      requireApiRole: vi.fn(async () => ({
        session: { role: "MANAGER" },
        response: null,
      })),
    }));
    vi.doMock("@/lib/pau/dashboard", () => ({
      updateEventParticipantActiveDecision,
      updateEventParticipantAttendance,
    }));

    const { PATCH } = await import(
      "../src/app/api/events/[eventId]/participants/[participantId]/route"
    );
    const response = await PATCH(
      new Request("http://local.test", {
        method: "PATCH",
        body: JSON.stringify({
          attendanceMarked: true,
          activeDecision: "INVITED_ATTENDED",
        }),
      }),
      {
        params: Promise.resolve({
          eventId: "event-1",
          participantId: "active-1",
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(updateEventParticipantActiveDecision).not.toHaveBeenCalled();
    expect(updateEventParticipantAttendance).not.toHaveBeenCalled();
  });
});
