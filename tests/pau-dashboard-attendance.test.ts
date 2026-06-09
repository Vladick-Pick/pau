import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  briefCount: vi.fn(),
  briefCreate: vi.fn(),
  eventFindUnique: vi.fn(),
  eventParticipantFindFirst: vi.fn(),
  eventParticipantUpdate: vi.fn(),
}));

const openRouterMocks = vi.hoisted(() => ({
  generateReportWithOpenRouter: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    brief: {
      count: prismaMocks.briefCount,
      create: prismaMocks.briefCreate,
    },
    event: {
      findUnique: prismaMocks.eventFindUnique,
    },
    eventParticipant: {
      findFirst: prismaMocks.eventParticipantFindFirst,
      update: prismaMocks.eventParticipantUpdate,
    },
  },
}));

vi.mock("@/lib/bitrix/client", () => ({
  BitrixClient: class BitrixClient {},
}));

vi.mock("@/lib/bitrix/contact-profile", () => ({
  buildReadableBitrixContactProfiles: vi.fn(async () => []),
}));

vi.mock("@/lib/bitrix/mapping", () => ({
  BITRIX_EVENT_LINK_FIELD: "UF_CRM_EVENT",
  mapBitrixDealToEventParticipant: vi.fn(),
  normalizeAliases: vi.fn(() => ({})),
}));

vi.mock("@/lib/briefs/openrouter", () => ({
  generateBriefWithOpenRouter: vi.fn(),
  generateReportWithOpenRouter: openRouterMocks.generateReportWithOpenRouter,
}));

vi.mock("@/lib/env", () => ({
  getCsvEnv: vi.fn(() => []),
  getOptionalEnv: vi.fn(() => null),
  getRequiredEnv: vi.fn((name: string) => `${name}-value`),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/matching/client", () => ({
  requestEventMatch: vi.fn(),
}));

vi.mock("@/lib/matching/local-event-matching", () => ({
  buildLocalEventMatchResult: vi.fn(),
}));

vi.mock("@/lib/pau/auto-sync", () => ({
  BITRIX_AUTO_SYNC_INTERVAL_MS: 60 * 60 * 1000,
  BITRIX_AUTO_SYNC_LOCK_KEY: "BITRIX24_EVENTS",
  buildBitrixAutoSyncSearchPlan: vi.fn(() => []),
  collectBitrixAutoSyncCandidatesSequentially: vi.fn(async () => []),
  getBitrixAutoSyncLeaseExpiresAt: vi.fn((date: Date) => date),
  groupBitrixAutoSyncEventIdsByVisitCursor: vi.fn(() => []),
  shouldResetBitrixAutoSyncCursor: vi.fn(() => false),
  shouldRunBitrixAutoSync: vi.fn(() => false),
}));

vi.mock("@/lib/pau/demo-data", () => ({
  demoSnapshot: {},
}));

vi.mock("@/lib/pau/demo-fallback", () => ({
  shouldUseDemoWorkspaceFallback: vi.fn(() => false),
}));

vi.mock("@/lib/pau/events", () => ({
  resolvePauFormatForBitrixEvent: vi.fn(() => "guest-meeting"),
}));

vi.mock("@/lib/pau/preparation", () => ({
  buildEventBriefPlan: vi.fn(() => []),
  buildEventMatchProfile: vi.fn(() => ({})),
  buildTranscriptReportInput: vi.fn(() => ({
    eventTitle: "event",
    formatName: "format",
    prompt: "prompt",
    transcript: "transcript",
  })),
  selectDefaultExportBriefs: vi.fn((briefs: unknown[]) => briefs),
}));

import {
  generateEventReportFromTranscript,
  updateEventParticipantActiveDecision,
  updateEventParticipantAttendance,
} from "../src/lib/pau/dashboard";

describe("PAU dashboard attendance updates", () => {
  beforeEach(() => {
    prismaMocks.briefCount.mockReset();
    prismaMocks.briefCreate.mockReset();
    prismaMocks.eventFindUnique.mockReset();
    prismaMocks.eventParticipantFindFirst.mockReset();
    prismaMocks.eventParticipantUpdate.mockReset();
    openRouterMocks.generateReportWithOpenRouter.mockReset();
  });

  it("marks active participants for past events", async () => {
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(
      eventParticipant({ event: { status: "PAST" } })
    );
    prismaMocks.eventParticipantUpdate.mockResolvedValue(
      eventParticipant({ attendanceMarked: true })
    );

    const result = await updateEventParticipantAttendance({
      eventId: "event-1",
      participantId: "active-1",
      attendanceMarked: true,
    });

    expect(prismaMocks.eventParticipantFindFirst).toHaveBeenCalledWith({
      where: {
        id: "active-1",
        eventId: "event-1",
      },
      include: {
        event: { select: { status: true } },
        briefs: { orderBy: { createdAt: "desc" } },
      },
    });
    expect(prismaMocks.eventParticipantUpdate).toHaveBeenCalledWith({
      where: { id: "active-1" },
      data: { attendanceMarked: true },
      include: {
        briefs: { orderBy: { createdAt: "desc" } },
      },
    });
    expect(result.attendanceMarked).toBe(true);
  });

  it("requires a comment when the team decides not to invite an active participant", async () => {
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(eventParticipant());

    await expect(
      updateEventParticipantActiveDecision({
        eventId: "event-1",
        participantId: "active-1",
        decision: "DECLINED_BY_US",
        comment: " ",
      })
    ).rejects.toThrow("Comment is required when declining an active participant");
    expect(prismaMocks.eventParticipantUpdate).not.toHaveBeenCalled();
  });

  it("stores active participant decisions with an optional comment", async () => {
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(eventParticipant());
    prismaMocks.eventParticipantUpdate.mockResolvedValue(
      eventParticipant({
        activeDecision: "DECLINED_BY_US",
        activeDecisionComment: "Не подходит по индустрии.",
      })
    );

    const result = await updateEventParticipantActiveDecision({
      eventId: "event-1",
      participantId: "active-1",
      decision: "DECLINED_BY_US",
      comment: " Не подходит по индустрии. ",
    });

    expect(prismaMocks.eventParticipantUpdate).toHaveBeenCalledWith({
      where: { id: "active-1" },
      data: {
        activeDecision: "DECLINED_BY_US",
        activeDecisionComment: "Не подходит по индустрии.",
        attendanceMarked: false,
        status: "REFUSED",
        statusUpdatedAt: expect.any(Date),
      },
      include: {
        briefs: { orderBy: { createdAt: "desc" } },
      },
    });
    expect(result.activeDecision).toBe("DECLINED_BY_US");
    expect(result.activeDecisionComment).toBe("Не подходит по индустрии.");
  });

  it("clears decline comments when the active decision changes to an invitation outcome", async () => {
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(
      eventParticipant({
        activeDecision: "DECLINED_BY_US",
        activeDecisionComment: "Не подходит по индустрии.",
      })
    );
    prismaMocks.eventParticipantUpdate.mockResolvedValue(
      eventParticipant({
        activeDecision: "INVITED_ATTENDED",
        activeDecisionComment: null,
        attendanceMarked: true,
        status: "ATTENDED",
      })
    );

    const result = await updateEventParticipantActiveDecision({
      eventId: "event-1",
      participantId: "active-1",
      decision: "INVITED_ATTENDED",
      comment: "Не подходит по индустрии.",
    });

    expect(prismaMocks.eventParticipantUpdate).toHaveBeenCalledWith({
      where: { id: "active-1" },
      data: {
        activeDecision: "INVITED_ATTENDED",
        activeDecisionComment: null,
        attendanceMarked: true,
        status: "ATTENDED",
        statusUpdatedAt: expect.any(Date),
      },
      include: {
        briefs: { orderBy: { createdAt: "desc" } },
      },
    });
    expect(result.activeDecisionComment).toBeNull();
  });

  it("rejects manual attendance marks before the event is past", async () => {
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(
      eventParticipant({ event: { status: "UPCOMING" } })
    );

    await expect(
      updateEventParticipantAttendance({
        eventId: "event-1",
        participantId: "active-1",
        attendanceMarked: true,
      })
    ).rejects.toThrow("Attendance can only be marked for past events");
    expect(prismaMocks.eventParticipantUpdate).not.toHaveBeenCalled();
  });

  it("rejects transcript report generation before the event is past", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue({
      id: "event-1",
      title: "Будущая встреча",
      status: "UPCOMING",
      formatSlug: "guest-meeting",
      format: {
        name: "Гостевая встреча",
        promptReport: "Сформируй отчет",
      },
    });

    await expect(
      generateEventReportFromTranscript({
        eventId: "event-1",
        transcript: "Текст записи встречи",
        createdByRole: "MANAGER",
      })
    ).rejects.toThrow("Reports can only be generated for past events");
    expect(openRouterMocks.generateReportWithOpenRouter).not.toHaveBeenCalled();
    expect(prismaMocks.briefCreate).not.toHaveBeenCalled();
  });
});

function eventParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: "active-1",
    eventId: "event-1",
    participantId: null,
    kind: "ACTIVE",
    status: "INVITED",
    bitrixVisitId: null,
    bitrixDealId: "deal-1",
    bitrixContactId: null,
    fullName: "Активный участник",
    email: null,
    phone: null,
    telegram: null,
    company: null,
    position: null,
    city: null,
    age: null,
    gender: null,
    businessMain: null,
    businessExtra1: null,
    businessExtra2: null,
    businessExtra3: null,
    businessProfile: null,
    enrichment: null,
    matchedScore: null,
    matchRationale: null,
    attendanceMarked: false,
    activeDecision: null,
    activeDecisionComment: null,
    sourcePayload: null,
    statusUpdatedAt: null,
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    briefs: [],
    ...overrides,
  };
}
