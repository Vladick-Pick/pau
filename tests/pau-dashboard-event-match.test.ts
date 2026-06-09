import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventMatchRunCreate: vi.fn(),
  eventParticipantCreate: vi.fn(),
  eventParticipantFindFirst: vi.fn(),
  eventParticipantUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    event: {
      findUnique: prismaMocks.eventFindUnique,
    },
    eventMatchRun: {
      create: prismaMocks.eventMatchRunCreate,
    },
    eventParticipant: {
      create: prismaMocks.eventParticipantCreate,
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
  generateReportWithOpenRouter: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getCsvEnv: vi.fn(() => []),
  getOptionalEnv: vi.fn((name: string) =>
    name === "PAU_LOCAL_MATCHING" ? "1" : null
  ),
  getRequiredEnv: vi.fn((name: string) => `${name}-value`),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/matching/client", () => ({
  requestEventMatch: vi.fn(),
}));

vi.mock("@/lib/matching/local-event-matching", () => ({
  buildLocalEventMatchResult: vi.fn(() => ({
    activeParticipants: [
      {
        id: "local-active-1",
        fullName: "Алексей Морозов",
        score: 0.92,
        rationale: "Локальный шаблон",
        profile: {
          company: "Морозов Консалтинг",
          position: "Основатель",
          city: "Москва",
          businessMain: "B2B консалтинг и продажи",
        },
      },
    ],
    rationale: "Локальный шаблон matching",
  })),
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
  buildEventMatchProfile: vi.fn(() => ({
    event: {
      id: "event-1",
      title: "Гостевая встреча",
      startsAt: null,
      formatSlug: "guest-meeting",
    },
    format: {
      slug: "guest-meeting",
      name: "Гостевая встреча",
    },
    participants: [],
  })),
  buildTranscriptReportInput: vi.fn(),
  selectDefaultExportBriefs: vi.fn((briefs: unknown[]) => briefs),
}));

import { runEventMatch } from "../src/lib/pau/dashboard";

describe("PAU event matching", () => {
  beforeEach(() => {
    prismaMocks.eventFindUnique.mockReset();
    prismaMocks.eventMatchRunCreate.mockReset();
    prismaMocks.eventParticipantCreate.mockReset();
    prismaMocks.eventParticipantFindFirst.mockReset();
    prismaMocks.eventParticipantUpdate.mockReset();
  });

  it("stores local active participant profile fields for visual review", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue({
      id: "event-1",
      title: "Гостевая встреча",
      startsAt: null,
      formatSlug: "guest-meeting",
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: null,
      },
      participants: [],
    });
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatch("event-1");

    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        fullName: "Алексей Морозов",
        status: "UNKNOWN",
        company: "Морозов Консалтинг",
        position: "Основатель",
        city: "Москва",
        businessMain: "B2B консалтинг и продажи",
        matchedScore: 0.92,
        matchRationale: "Локальный шаблон",
      }),
    });
  });

  it("keeps a saved active decision status when matching runs again", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue({
      id: "event-1",
      title: "Гостевая встреча",
      startsAt: null,
      formatSlug: "guest-meeting",
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: null,
      },
      participants: [],
    });
    prismaMocks.eventParticipantFindFirst.mockResolvedValue({
      id: "active-1",
      activeDecision: "DECLINED_BY_US",
      status: "REFUSED",
    });

    await runEventMatch("event-1");

    expect(prismaMocks.eventParticipantUpdate).toHaveBeenCalledWith({
      where: { id: "active-1" },
      data: expect.objectContaining({
        fullName: "Алексей Морозов",
        status: "REFUSED",
      }),
    });
  });
});
