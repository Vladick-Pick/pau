import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  activeRoleAssignmentFindMany: vi.fn(),
  activeRuleFindMany: vi.fn(),
  clubFindMany: vi.fn(),
  eventFindUnique: vi.fn(),
  eventMatchRunCreate: vi.fn(),
  eventParticipantCreate: vi.fn(),
  eventParticipantDelete: vi.fn(),
  eventParticipantFindFirst: vi.fn(),
  eventParticipantUpdate: vi.fn(),
  formatReadinessFindMany: vi.fn(),
  memberProfileFindMany: vi.fn(),
  transaction: vi.fn(),
}));

const envMocks = vi.hoisted(() => ({
  getOptionalEnv: vi.fn((name: string): string | null =>
    name === "PAU_LOCAL_MATCHING" ? "1" : null
  ),
}));

const semanticMocks = vi.hoisted(() => ({
  requestSemanticRerank: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: prismaMocks.transaction,
    activeRoleAssignment: {
      findMany: prismaMocks.activeRoleAssignmentFindMany,
    },
    activeRule: {
      findMany: prismaMocks.activeRuleFindMany,
    },
    club: {
      findMany: prismaMocks.clubFindMany,
    },
    event: {
      findUnique: prismaMocks.eventFindUnique,
    },
    eventMatchRun: {
      create: prismaMocks.eventMatchRunCreate,
    },
    eventParticipant: {
      create: prismaMocks.eventParticipantCreate,
      delete: prismaMocks.eventParticipantDelete,
      findFirst: prismaMocks.eventParticipantFindFirst,
      update: prismaMocks.eventParticipantUpdate,
    },
    formatReadiness: {
      findMany: prismaMocks.formatReadinessFindMany,
    },
    memberProfile: {
      findMany: prismaMocks.memberProfileFindMany,
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
  getOptionalEnv: envMocks.getOptionalEnv,
  getRequiredEnv: vi.fn((name: string) => `${name}-value`),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/matching/semantic-rerank", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/lib/matching/semantic-rerank")>();
  return {
    ...original,
    requestSemanticRerank: semanticMocks.requestSemanticRerank,
  };
});

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

import { runEventMatching } from "../src/lib/pau/event-matching-run";

describe("PAU event matching", () => {
  beforeEach(() => {
    prismaMocks.activeRoleAssignmentFindMany.mockReset();
    prismaMocks.activeRuleFindMany.mockReset();
    prismaMocks.clubFindMany.mockReset();
    prismaMocks.eventFindUnique.mockReset();
    prismaMocks.eventMatchRunCreate.mockReset();
    prismaMocks.eventParticipantCreate.mockReset();
    prismaMocks.eventParticipantDelete.mockReset();
    prismaMocks.eventParticipantFindFirst.mockReset();
    prismaMocks.eventParticipantUpdate.mockReset();
    prismaMocks.formatReadinessFindMany.mockReset();
    prismaMocks.memberProfileFindMany.mockReset();
    prismaMocks.transaction.mockReset();
    envMocks.getOptionalEnv.mockReset();
    semanticMocks.requestSemanticRerank.mockReset();

    envMocks.getOptionalEnv.mockImplementation((name: string) =>
      name === "PAU_LOCAL_MATCHING" ? "1" : null
    );
    semanticMocks.requestSemanticRerank.mockResolvedValue({ matches: [] });

    prismaMocks.clubFindMany.mockResolvedValue([
      { id: "ws_cf1", name: "Club First One" },
    ]);
    prismaMocks.activeRoleAssignmentFindMany.mockResolvedValue([]);
    prismaMocks.activeRuleFindMany.mockResolvedValue([]);
    prismaMocks.formatReadinessFindMany.mockResolvedValue([
      { profileId: "active-profile-1", readiness: "READY" },
    ]);
    prismaMocks.memberProfileFindMany.mockResolvedValue([activeMemberProfile()]);
    prismaMocks.transaction.mockImplementation(async (callback) =>
      callback({
        eventMatchRun: {
          create: prismaMocks.eventMatchRunCreate,
        },
        eventParticipant: {
          create: prismaMocks.eventParticipantCreate,
          delete: prismaMocks.eventParticipantDelete,
          findFirst: prismaMocks.eventParticipantFindFirst,
          update: prismaMocks.eventParticipantUpdate,
        },
      })
    );
  });

  it("stores matched active participant profile fields for visual review", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(guestEvent());
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        fullName: "Алексей Морозов",
        status: "UNKNOWN",
        company: "Морозов Консалтинг",
        position: "Основатель",
        city: "Москва",
        businessMain: "B2B SaaS и продажи",
        businessExtra1: "помогаю с построением продаж и партнерствами",
        matchedScore: expect.any(Number),
        matchRationale: expect.stringContaining("Алексей Морозов"),
      }),
    });
  });

  it("keeps a saved active decision status when matching runs again", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [
          matchedActiveParticipant({
            id: "active-1",
            activeDecision: "DECLINED_BY_US",
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantUpdate).toHaveBeenCalledWith({
      where: { id: "active-1" },
      data: expect.objectContaining({
        fullName: "Алексей Морозов",
        status: "REFUSED",
      }),
    });
  });

  it("updates an already matched active participant on repeated matching runs", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [matchedActiveParticipant()],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantCreate).not.toHaveBeenCalled();
    expect(prismaMocks.eventParticipantDelete).not.toHaveBeenCalled();
    expect(prismaMocks.eventParticipantUpdate).toHaveBeenCalledWith({
      where: { id: "existing-active-1" },
      data: expect.objectContaining({
        fullName: "Алексей Морозов",
        sourcePayload: expect.objectContaining({
          matchingProfileId: "active-profile-1",
          matchOrder: 1,
        }),
      }),
    });
  });

  it("removes stale automatic active matches without manual decisions", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [
          matchedActiveParticipant({
            id: "stale-active-1",
            fullName: "Старый Авто Подбор",
            profileId: "stale-profile-1",
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantDelete).toHaveBeenCalledWith({
      where: { id: "stale-active-1" },
    });
    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledTimes(1);
  });

  it("preserves stale automatic active matches with generated briefs and clears live matching order", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [
          matchedActiveParticipant({
            id: "stale-active-with-brief",
            fullName: "Старый Авто Подбор",
            profileId: "stale-profile-1",
            briefs: [{ id: "brief-1" }],
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantDelete).not.toHaveBeenCalledWith({
      where: { id: "stale-active-with-brief" },
    });
    const updateCall = updateCallFor("stale-active-with-brief");
    expect(updateCall?.data).toMatchObject({
      matchedScore: null,
    });
    expect(updateCall?.data.sourcePayload).not.toHaveProperty("matchOrder");
  });

  it("preserves stale automatic active matches with attendance marks", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [
          matchedActiveParticipant({
            id: "stale-active-attended",
            fullName: "Посещал Раньше",
            profileId: "stale-profile-2",
            attendanceMarked: true,
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantDelete).not.toHaveBeenCalledWith({
      where: { id: "stale-active-attended" },
    });
    expect(updateCallFor("stale-active-attended")?.data).toMatchObject({
      matchedScore: null,
    });
  });

  it("preserves stale active matches with operator decisions and removes stale match order", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [
          matchedActiveParticipant({
            id: "stale-active-decision",
            fullName: "Решение Оператора",
            profileId: "stale-profile-3",
            activeDecision: "DECLINED_BY_US",
            activeDecisionComment: "Не зовем на этот формат",
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantDelete).not.toHaveBeenCalledWith({
      where: { id: "stale-active-decision" },
    });
    const updateCall = updateCallFor("stale-active-decision");
    expect(updateCall?.data).toMatchObject({
      matchedScore: null,
    });
    expect(updateCall?.data.sourcePayload).not.toHaveProperty("matchOrder");
  });

  it("does not overwrite an unrelated active row by full name when matching profile identity is missing", async () => {
    const manualParticipant = matchedActiveParticipant({
      id: "manual-same-name",
      fullName: "Алексей Морозов",
      profileId: null,
      sourcePayload: null,
    });
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [manualParticipant],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(manualParticipant);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "manual-same-name" },
      })
    );
    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event-1",
        fullName: "Алексей Морозов",
        sourcePayload: expect.objectContaining({
          matchingProfileId: "active-profile-1",
        }),
      }),
    });
  });

  it("writes successful audit and participant mutations through one transaction", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(guestEvent());
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    expect(prismaMocks.eventMatchRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeParticipantCount: 1,
      }),
    });
    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledTimes(1);
  });

  it("does not write a successful audit outside the transaction when participant mutation fails", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(guestEvent());
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);
    prismaMocks.eventParticipantCreate.mockRejectedValueOnce(
      new Error("participant write failed")
    );

    await expect(runEventMatching({ eventId: "event-1" })).rejects.toThrow(
      "participant write failed"
    );

    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    const successAuditOrder =
      prismaMocks.eventMatchRunCreate.mock.invocationCallOrder[0];
    const transactionOrder = prismaMocks.transaction.mock.invocationCallOrder[0];
    expect(successAuditOrder).toBeGreaterThan(transactionOrder);
    expect(
      prismaMocks.eventMatchRunCreate.mock.calls.filter(
        ([call]) => call.data.activeParticipantCount > 0
      )
    ).toHaveLength(1);
    expect(prismaMocks.eventMatchRunCreate).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        activeParticipantCount: 0,
        error: "participant write failed",
      }),
    });
  });

  it("stores target plus buffer active participants from format settings", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        matchingRules: {
          activeInvitePlan: {
            targetCount: 2,
            bufferCount: 3,
          },
        },
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);
    prismaMocks.formatReadinessFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        profileId: `active-profile-${index + 1}`,
        readiness: "READY",
      }))
    );
    prismaMocks.memberProfileFindMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        activeMemberProfile({
          profileId: `active-profile-${index + 1}`,
          displayName: `Активный ${index + 1}`,
        })
      )
    );

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledTimes(5);
    expect(
      prismaMocks.eventParticipantCreate.mock.calls.map(
        ([call]) => call.data.sourcePayload.matchOrder
      )
    ).toEqual([1, 2, 3, 4, 5]);
    expect(prismaMocks.eventMatchRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeParticipantCount: 5,
        activeParticipantIds: expect.arrayContaining([
          "active-profile-1",
          "active-profile-2",
          "active-profile-3",
          "active-profile-4",
          "active-profile-5",
        ]),
      }),
    });
  });

  it("excludes refused potentials from event-composition matching audit", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        matchingRules: {
          activeInvitePlan: {
            targetCount: 2,
            bufferCount: 0,
          },
        },
        participants: [
          potentialParticipant({
            id: "refused-potential",
            fullName: "Отказавшийся гость",
            status: "REFUSED",
            businessMain: "медицина сеть клиник",
            businessProfile: {
              main: {
                sphere: "медицина",
                specifics: "сеть клиник",
                role: "Владелец",
                revenue: "200000000",
              },
            },
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);
    prismaMocks.formatReadinessFindMany.mockResolvedValue([
      { profileId: "medical-fit", readiness: "READY" },
      { profileId: "saas-fit", readiness: "READY" },
    ]);
    prismaMocks.memberProfileFindMany.mockResolvedValue([
      activeMemberProfile({
        profileId: "medical-fit",
        displayName: "Медицинский активный",
        dossier: {
          industry: "медицина сеть клиник",
          canBeUseful: "медицинский бизнес и клиники",
        },
      }),
      activeMemberProfile({
        profileId: "saas-fit",
        displayName: "SaaS активный",
      }),
    ]);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventMatchRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        responsePayload: expect.objectContaining({
          profileMatching: expect.objectContaining({
            excludedPotentials: expect.arrayContaining([
              {
                potentialId: "refused-potential",
                reason: "non_participating_status",
                status: "REFUSED",
              },
            ]),
            matches: expect.arrayContaining([
              expect.objectContaining({
                matchedPotentialId: "potential-1",
                coveredPotentialIds: ["potential-1"],
              }),
            ]),
          }),
        }),
      }),
    });
    const profileMatching =
      prismaMocks.eventMatchRunCreate.mock.calls[0][0].data.responsePayload
        .profileMatching;
    expect(
      profileMatching.matches.map(
        (match: { matchedPotentialId: string }) => match.matchedPotentialId
      )
    ).not.toContain("refused-potential");
  });

  it("does not send excluded potentials to semantic rerank", async () => {
    envMocks.getOptionalEnv.mockImplementation((name: string) => {
      if (name === "PAU_LOCAL_MATCHING") {
        return "1";
      }
      if (name === "OPENROUTER_API_KEY") {
        return "openrouter-key";
      }
      return null;
    });
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        participants: [
          potentialParticipant({
            id: "refused-potential",
            fullName: "Отказавшийся гость",
            status: "REFUSED",
            businessMain: "медицина сеть клиник",
            businessProfile: {
              main: {
                sphere: "медицина",
                specifics: "сеть клиник",
                role: "Владелец",
                revenue: "200000000",
              },
            },
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(semanticMocks.requestSemanticRerank).toHaveBeenCalledTimes(1);
    const semanticInput =
      semanticMocks.requestSemanticRerank.mock.calls[0][0].input;
    expect(
      semanticInput.potentials.map((potential: { id: string }) => potential.id)
    ).toEqual(["potential-1"]);
    expect(
      semanticInput.pairs.map((pair: { potentialId: string }) => pair.potentialId)
    ).toEqual(["potential-1"]);
  });

  it("sends related many-to-many pair candidates to semantic rerank", async () => {
    envMocks.getOptionalEnv.mockImplementation((name: string) => {
      if (name === "PAU_LOCAL_MATCHING") {
        return "1";
      }
      if (name === "OPENROUTER_API_KEY") {
        return "openrouter-key";
      }
      return null;
    });
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        matchingRules: {
          activeInvitePlan: {
            targetCount: 1,
            bufferCount: 0,
          },
          semanticPolicy: {
            candidateMultiplier: 3,
          },
        },
        participants: [
          potentialParticipant({
            id: "factory-potential",
            fullName: "Производственный гость",
            businessMain: "Производство и автоматизация",
            businessProfile: {
              main: {
                sphere: "производство",
                specifics: "автоматизация завода",
                role: "Владелец",
              },
            },
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);
    prismaMocks.formatReadinessFindMany.mockResolvedValue([
      { profileId: "bridge-active", readiness: "READY" },
    ]);
    prismaMocks.memberProfileFindMany.mockResolvedValue([
      activeMemberProfile({
        profileId: "bridge-active",
        displayName: "Активный мост",
        dossier: {
          industry: "B2B SaaS автоматизация производства",
          canBeUseful: "помогаю с продажами SaaS и автоматизацией заводов",
          clubGoals: "партнерства в производстве",
          interests: "автоматизация",
        },
      }),
    ]);
    semanticMocks.requestSemanticRerank.mockResolvedValue({ matches: [] });

    await runEventMatching({ eventId: "event-1" });

    const semanticInput =
      semanticMocks.requestSemanticRerank.mock.calls[0][0].input;
    expect(
      semanticInput.pairs.map((pair: { pairId: string }) => pair.pairId)
    ).toEqual(
      expect.arrayContaining([
        "bridge-active::potential-1",
        "bridge-active::factory-potential",
      ])
    );
  });

  it("stores semantic reasons and many-to-many potential fits on active rows", async () => {
    envMocks.getOptionalEnv.mockImplementation((name: string) => {
      if (name === "PAU_LOCAL_MATCHING") {
        return "1";
      }
      if (name === "OPENROUTER_API_KEY") {
        return "openrouter-key";
      }
      return null;
    });
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        matchingRules: {
          activeInvitePlan: {
            targetCount: 1,
            bufferCount: 0,
          },
        },
        participants: [
          potentialParticipant({
            id: "factory-potential",
            fullName: "Производственный гость",
            businessMain: "Производство и автоматизация",
            businessProfile: {
              main: {
                sphere: "производство",
                specifics: "автоматизация завода",
                role: "Владелец",
              },
            },
          }),
        ],
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);
    semanticMocks.requestSemanticRerank.mockResolvedValue({
      matches: [
        {
          pairId: "active-profile-1::potential-1",
          activeProfileId: "active-profile-1",
          potentialId: "potential-1",
          semanticScore: 0.83,
          reason: "Сильная SaaS связка по продажам.",
          introTopic: "Обсудить B2B продажи",
          risks: [],
          evidenceFields: ["business_domain"],
        },
        {
          pairId: "active-profile-1::factory-potential",
          activeProfileId: "active-profile-1",
          potentialId: "factory-potential",
          semanticScore: 0.74,
          reason: "Активный полезен производственному гостю по автоматизации.",
          introTopic: "Обсудить автоматизацию",
          risks: [],
          evidenceFields: ["business_role"],
        },
      ],
    });

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourcePayload: expect.objectContaining({
          matchingProfile: expect.objectContaining({
            semanticReason:
              "Активный полезен производственному гостю по автоматизации.",
            relatedPotentialMatches: expect.arrayContaining([
              expect.objectContaining({
                potentialId: "potential-1",
                semanticReason: "Сильная SaaS связка по продажам.",
              }),
              expect.objectContaining({
                potentialId: "factory-potential",
                semanticReason:
                  "Активный полезен производственному гостю по автоматизации.",
              }),
            ]),
          }),
        }),
      }),
    });
  });

  it("stores structured audit metadata for successful matching runs", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(guestEvent());
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventMatchRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        responsePayload: expect.objectContaining({
          audit: expect.objectContaining({
            status: "SUCCESS",
            semanticStatus: "skipped_no_key",
            settingsHash: expect.any(String),
            inputHash: expect.any(String),
            selectedCount: 1,
            excludedCount: 0,
            coveredPotentialCount: 1,
            uncoveredPotentialCount: 0,
            sourceFreshness: expect.objectContaining({
              enabled: false,
              staleAfterDays: 30,
              staleCount: 0,
            }),
          }),
        }),
      }),
    });
  });

  it("marks the run as degraded when candidate profile freshness is stale but keeps the candidate", async () => {
    prismaMocks.eventFindUnique.mockResolvedValue(
      guestEvent({
        matchingRules: {
          sourceFreshness: {
            enabled: true,
            staleAfterDays: 30,
          },
        },
      })
    );
    prismaMocks.eventParticipantFindFirst.mockResolvedValue(null);
    prismaMocks.memberProfileFindMany.mockResolvedValue([
      activeMemberProfile({
        profileUpdatedAt: new Date("2026-05-01T00:00:00.000Z"),
        syncedAt: new Date("2026-05-20T00:00:00.000Z"),
      }),
    ]);

    await runEventMatching({ eventId: "event-1" });

    expect(prismaMocks.eventParticipantCreate).toHaveBeenCalledTimes(1);
    expect(prismaMocks.eventMatchRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        responsePayload: expect.objectContaining({
          audit: expect.objectContaining({
            status: "DEGRADED",
            degradedReasons: expect.arrayContaining(["stale_source_data"]),
            sourceFreshness: expect.objectContaining({
              enabled: true,
              staleAfterDays: 30,
              staleCount: 1,
              oldestSyncedAt: "2026-05-20T00:00:00.000Z",
            }),
          }),
        }),
      }),
    });
  });
});

function guestEvent({
  matchingRules = null,
  participants = [],
}: {
  matchingRules?: unknown;
  participants?: Array<Record<string, unknown>>;
} = {}) {
  return {
    id: "event-1",
    title: "Гостевая встреча",
    startsAt: new Date("2026-07-30T12:00:00.000Z"),
    formatSlug: "guest-meeting",
    format: {
      slug: "guest-meeting",
      name: "Гостевая встреча",
      description: "Знакомство потенциальных участников с клубом.",
      matchingRules,
    },
    participants: [
      {
        id: "potential-1",
        kind: "POTENTIAL",
        status: "CONFIRMED",
        fullName: "Потенциал",
        participantId: null,
        bitrixVisitId: null,
        bitrixDealId: null,
        bitrixContactId: null,
        email: null,
        phone: null,
        telegram: null,
        company: "SaaSCo",
        position: "Владелец",
        city: "Москва",
        age: 39,
        gender: null,
        businessMain: "B2B SaaS для продаж",
        businessExtra1: null,
        businessExtra2: null,
        businessExtra3: null,
        businessProfile: {
          main: {
            sphere: "IT | разработка ПО",
            specifics: "B2B SaaS для продаж",
            role: "Владелец",
            experience: null,
            okved: null,
            sharePercent: null,
            revenue: "120000000",
          },
          extra1: null,
          extra2: null,
          extra3: null,
        },
        enrichment: {
          clubGoals: "найти партнеров и обсудить enterprise продажи",
          additionalInfo: "интересен опыт построения отдела продаж",
        },
        matchedScore: null,
        matchRationale: null,
        attendanceMarked: false,
        activeDecision: null,
        activeDecisionComment: null,
        sourcePayload: null,
        statusUpdatedAt: null,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        briefs: [],
      },
      ...participants,
    ],
  };
}

function potentialParticipant(
  patch: Partial<{
    id: string;
    fullName: string;
    status: string;
    businessMain: string | null;
    businessProfile: Record<string, unknown>;
  }> = {}
) {
  return {
    id: patch.id ?? "potential-extra",
    kind: "POTENTIAL",
    status: patch.status ?? "CONFIRMED",
    fullName: patch.fullName ?? "Дополнительный потенциал",
    participantId: null,
    bitrixVisitId: null,
    bitrixDealId: null,
    bitrixContactId: null,
    email: null,
    phone: null,
    telegram: null,
    company: null,
    position: "Владелец",
    city: "Москва",
    age: null,
    gender: null,
    businessMain: patch.businessMain ?? null,
    businessExtra1: null,
    businessExtra2: null,
    businessExtra3: null,
    businessProfile: patch.businessProfile ?? null,
    enrichment: null,
    matchedScore: null,
    matchRationale: null,
    attendanceMarked: false,
    activeDecision: null,
    activeDecisionComment: null,
    sourcePayload: null,
    statusUpdatedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    briefs: [],
  };
}

function matchedActiveParticipant(
  patch: Partial<{
    id: string;
    fullName: string;
    profileId: string | null;
    attendanceMarked: boolean;
    activeDecision: string | null;
    activeDecisionComment: string | null;
    sourcePayload: Record<string, unknown> | null;
    briefs: Array<Record<string, unknown>>;
  }> = {}
) {
  const profileId = Object.hasOwn(patch, "profileId")
    ? patch.profileId
    : "active-profile-1";
  const sourcePayload = Object.hasOwn(patch, "sourcePayload")
    ? patch.sourcePayload
    : profileId
      ? {
          matchingProfileId: profileId,
          matchOrder: 1,
        }
      : null;

  return {
    id: patch.id ?? "existing-active-1",
    kind: "ACTIVE",
    status: "UNKNOWN",
    fullName: patch.fullName ?? "Алексей Морозов",
    participantId: null,
    bitrixVisitId: null,
    bitrixDealId: null,
    bitrixContactId: null,
    email: null,
    phone: null,
    telegram: null,
    company: "Морозов Консалтинг",
    position: "Основатель",
    city: "Москва",
    age: 42,
    gender: null,
    businessMain: "B2B SaaS и продажи",
    businessExtra1: null,
    businessExtra2: null,
    businessExtra3: null,
    businessProfile: null,
    enrichment: null,
    matchedScore: 0.7,
    matchRationale: "Старый подбор",
    attendanceMarked: patch.attendanceMarked ?? false,
    activeDecision: patch.activeDecision ?? null,
    activeDecisionComment: patch.activeDecisionComment ?? null,
    sourcePayload,
    statusUpdatedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    briefs: patch.briefs ?? [],
  };
}

function activeMemberProfile(
  patch: Partial<{
    profileId: string;
    displayName: string;
    profileUpdatedAt: Date | null;
    syncedAt: Date;
    dossier: Partial<ReturnType<typeof baseActiveDossier>>;
  }> = {}
) {
  return {
    id: "member-1",
    clubId: "ws_cf1",
    profileId: patch.profileId ?? "active-profile-1",
    displayName: patch.displayName ?? "Алексей Морозов",
    stateCode: "active",
    tenureYear: 4,
    paymentPhase: "mid",
    businessBand: 2,
    retention: 80,
    attendance: 75,
    dossier: {
      ...baseActiveDossier(),
      ...patch.dossier,
    },
    participation: [],
    profileUpdatedAt: patch.profileUpdatedAt ?? null,
    syncedAt: patch.syncedAt ?? new Date("2026-07-01T00:00:00.000Z"),
    formatVisits: [],
  };
}

function baseActiveDossier() {
  return {
    company: "Морозов Консалтинг",
    revenue: "150000000",
    industry: "B2B SaaS и продажи",
    position: "Основатель",
    city: "Москва",
    age: 42,
    interests: "enterprise продажи, партнерства",
    canBeUseful: "помогаю с построением продаж и партнерствами",
    clubGoals: "нетворкинг и партнеры",
    telegram: null,
  };
}

function updateCallFor(id: string) {
  return prismaMocks.eventParticipantUpdate.mock.calls.find(
    ([call]) => call.where.id === id
  )?.[0];
}
