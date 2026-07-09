import { describe, expect, it } from "vitest";

import {
  applySemanticRerank,
  matchProfiles,
  type ActiveMatchCandidate,
  type ActiveMatchDossier,
  type PotentialMatchProfile,
} from "../src/lib/matching/profile-matching";

const potential: PotentialMatchProfile = {
  id: "potential-1",
  fullName: "Потенциал",
  status: "CONFIRMED",
  businessProfile: {
    main: {
      sphere: "IT | разработка ПО",
      specifics: "B2B SaaS для продаж",
      role: "Владелец",
      revenue: "120000000",
    },
  },
  enrichment: {
    clubGoals: "найти партнеров и обсудить enterprise продажи",
    additionalInfo: "интересен опыт построения отдела продаж",
  },
};

function potentialProfile(
  patch: Partial<PotentialMatchProfile> = {}
): PotentialMatchProfile {
  return {
    ...potential,
    ...patch,
    businessProfile: patch.businessProfile ?? potential.businessProfile,
    enrichment: patch.enrichment ?? potential.enrichment,
  };
}

type CandidatePatch = Partial<Omit<ActiveMatchCandidate, "dossier">> & {
  dossier?: Partial<ActiveMatchDossier>;
};

function candidate(patch: CandidatePatch = {}): ActiveMatchCandidate {
  return {
    profileId: "active-1",
    displayName: "Активный",
    stateCode: "active",
    readiness: "READY",
    formatVisits: [],
    ...patch,
    dossier: {
      company: "B2B Software",
      industry: "разработка B2B SaaS для продаж",
      position: "Владелец",
      revenue: "150000000",
      city: "Москва",
      age: 41,
      interests: "enterprise продажи, партнерства",
      canBeUseful: "помогаю с построением продаж и B2B партнерствами",
      clubGoals: "нетворкинг и партнеры",
      telegram: null,
      ...patch.dossier,
    },
  };
}

describe("profile matching", () => {
  it("excludes candidates marked not ready for the format", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [candidate({ readiness: "NOT_READY" })],
    });

    expect(result.matches).toHaveLength(0);
    expect(result.excluded).toContainEqual({
      profileId: "active-1",
      reason: "not_ready_for_format",
    });
  });

  it("excludes candidates who already visited the format in the configured month", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          recentVisitExclusion: {
            enabled: true,
            mode: "calendar_month",
            months: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({
          formatVisits: [
            {
              formatSlug: "guest-meeting",
              attendedAt: "2026-07-10T12:00:00.000Z",
            },
          ],
        }),
      ],
    });

    expect(result.matches).toHaveLength(0);
    expect(result.excluded).toContainEqual({
      profileId: "active-1",
      reason: "recent_format_visit",
    });
  });

  it("excludes candidates who already visited another PAU format in the configured month", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          recentVisitExclusion: {
            enabled: true,
            mode: "calendar_month",
            months: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({
          formatVisits: [
            {
              formatSlug: "expert-dialogue",
              attendedAt: "2026-07-10T12:00:00.000Z",
            },
          ],
        }),
      ],
    });

    expect(result.matches).toHaveLength(0);
    expect(result.excluded).toContainEqual({
      profileId: "active-1",
      reason: "recent_format_visit",
    });
  });

  it("scores business profile and request fit with explainable evidence", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [candidate()],
    });

    expect(result.matches[0]).toMatchObject({
      activeProfileId: "active-1",
      matchedPotentialId: "potential-1",
      readiness: "READY",
    });
    expect(result.matches[0].baseScore).toBeGreaterThan(0.65);
    expect(result.matches[0].confidence).toBeGreaterThan(0.7);
    expect(result.matches[0].evidenceFields).toEqual(
      expect.arrayContaining(["business_domain", "business_role", "request_fit"])
    );
  });

  it("keeps unmarked candidates as fallback with lower confidence", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [candidate({ readiness: "UNMARKED" })],
    });

    expect(result.matches[0].readiness).toBe("UNMARKED");
    expect(result.matches[0].confidence).toBeLessThan(
      matchProfiles({
        event: {
          id: "event-1",
          title: "Гостевая встреча",
          startsAt: "2026-07-30T12:00:00.000Z",
          formatSlug: "guest-meeting",
        },
        format: {
          slug: "guest-meeting",
          name: "Гостевая встреча",
          matchingRules: {},
        },
        potentials: [potential],
        candidates: [candidate({ readiness: "READY" })],
      }).matches[0].confidence
    );
  });

  it("uses ready status as a bonus when business fit is comparable", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [
        candidate({
          profileId: "ready-fit",
          readiness: "READY",
        }),
        candidate({
          profileId: "unmarked-fit",
          readiness: "UNMARKED",
        }),
      ],
    });

    expect(result.matches[0]).toMatchObject({
      activeProfileId: "ready-fit",
      readiness: "READY",
    });
    expect(result.matches[1]).toMatchObject({
      activeProfileId: "unmarked-fit",
      readiness: "UNMARKED",
    });
    expect(result.matches[0].baseScore).toBeGreaterThan(result.matches[1].baseScore);
  });

  it("uses unmarked candidates only after ready candidates are excluded by recent visits", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          recentVisitExclusion: {
            enabled: true,
            mode: "calendar_month",
            months: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({
          profileId: "ready-recent",
          readiness: "READY",
          formatVisits: [
            {
              formatSlug: "guest-meeting",
              attendedAt: "2026-07-10T12:00:00.000Z",
            },
          ],
        }),
        candidate({
          profileId: "unmarked-fallback",
          readiness: "UNMARKED",
        }),
      ],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      activeProfileId: "unmarked-fallback",
      readiness: "UNMARKED",
    });
    expect(result.excluded).toContainEqual({
      profileId: "ready-recent",
      reason: "recent_format_visit",
    });
  });

  it("excludes refused and missed potentials before pair scoring", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [
        potentialProfile({
          id: "refused-potential",
          fullName: "Отказался",
          status: "REFUSED",
          businessProfile: {
            main: {
              sphere: "медицина",
              specifics: "сеть клиник",
              role: "Владелец",
              revenue: "200000000",
            },
          },
        }),
        potentialProfile({
          id: "confirmed-potential",
          fullName: "Подтвержден",
          status: "CONFIRMED",
        }),
      ],
      candidates: [
        candidate({
          profileId: "medical-perfect",
          dossier: {
            industry: "медицина сеть клиник",
            canBeUseful: "медицинский бизнес",
          },
        }),
        candidate({ profileId: "saas-fit" }),
      ],
    });

    expect(result.excludedPotentials).toContainEqual({
      potentialId: "refused-potential",
      reason: "non_participating_status",
      status: "REFUSED",
    });
    expect(result.matches.map((match) => match.matchedPotentialId)).toEqual([
      "confirmed-potential",
      "confirmed-potential",
    ]);
  });

  it("allows matching rules to opt out invited potentials", () => {
    const excluded = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          potentialStatusPolicy: {
            includeInvited: false,
          },
        },
      },
      potentials: [potentialProfile({ status: "INVITED" })],
      candidates: [candidate()],
    });
    const included = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potentialProfile({ status: "INVITED" })],
      candidates: [candidate()],
    });

    expect(excluded.matches).toHaveLength(0);
    expect(excluded.excludedPotentials[0]).toMatchObject({
      potentialId: "potential-1",
      reason: "not_confirmed",
      status: "INVITED",
    });
    expect(included.matches).toHaveLength(1);
    expect(included.matches[0].confidence).toBeLessThan(1);
    expect(included.matches[0].risks).toContain(
      "Гость еще не подтвержден: INVITED"
    );
  });

  it("excludes business-perfect active candidates that fail required active rules", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [
        candidate({
          profileId: "perfect-but-ineligible",
          activeEvaluation: {
            passed: false,
            failedKeys: ["retention_min"],
            missingKeys: [],
            total: 1,
            roleIds: ["owner"],
          },
        }),
        candidate({ profileId: "eligible", displayName: "Eligible" }),
      ],
    });

    expect(result.matches.map((match) => match.activeProfileId)).toEqual([
      "eligible",
    ]);
    expect(result.excluded).toContainEqual({
      profileId: "perfect-but-ineligible",
      reason: "active_rules_failed",
    });
  });

  it("selects an event composition that covers multiple confirmed potentials", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          activeInvitePlan: {
            targetCount: 2,
            bufferCount: 0,
          },
        },
      },
      potentials: [
        potentialProfile({
          id: "saas-guest",
          fullName: "SaaS-гость",
          businessProfile: {
            main: {
              sphere: "IT | разработка ПО",
              specifics: "B2B SaaS продажи",
              role: "Владелец",
              revenue: "120000000",
            },
          },
        }),
        potentialProfile({
          id: "restaurant-guest",
          fullName: "Ресторанный гость",
          businessProfile: {
            main: {
              sphere: "рестораны",
              specifics: "сеть ресторанов и франшиза",
              role: "Владелец",
              revenue: "90000000",
            },
          },
          enrichment: {
            clubGoals: "обсудить операционку ресторанной сети",
          },
        }),
      ],
      candidates: [
        candidate({
          profileId: "saas-fit-1",
          dossier: {
            industry: "B2B SaaS продажи",
            canBeUseful: "продажи и партнерства для SaaS",
          },
        }),
        candidate({
          profileId: "saas-fit-2",
          dossier: {
            industry: "B2B SaaS enterprise продажи",
            canBeUseful: "масштабирование SaaS продаж",
          },
        }),
        candidate({
          profileId: "restaurant-fit",
          dossier: {
            industry: "рестораны франшиза",
            canBeUseful: "операционка ресторанной сети",
          },
        }),
      ],
    });

    expect(result.matches).toHaveLength(2);
    expect(result.coverage.coveredPotentialIds.sort()).toEqual([
      "restaurant-guest",
      "saas-guest",
    ]);
    expect(result.matches.map((match) => match.activeProfileId)).toContain(
      "restaurant-fit"
    );
    expect(result.matches.every((match) => match.coveredPotentialIds.length > 0))
      .toBe(true);
  });

  it("covers confirmed and invited potentials by default before adding duplicate coverage", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          activeInvitePlan: {
            targetCount: 5,
            bufferCount: 0,
          },
        },
      },
      potentials: [
        potentialProfile({
          id: "real-estate-guest",
          fullName: "Евгений Саяпин",
          status: "CONFIRMED",
          businessProfile: {
            main: {
              sphere: "недвижимость",
              specifics: "инжиниринг и девелопмент",
              role: "Собственник",
            },
          },
        }),
        potentialProfile({
          id: "chemical-guest",
          fullName: "Владимир Матюхин",
          status: "INVITED",
          businessProfile: {
            main: {
              sphere: "химическая промышленность",
              specifics: "производство",
              role: "Собственник",
            },
          },
        }),
        potentialProfile({
          id: "industrial-guest",
          fullName: "Артем Шамков",
          status: "INVITED",
          businessProfile: {
            main: {
              sphere: "промышленные товары",
              specifics: "производство",
              role: "Собственник",
            },
          },
        }),
        potentialProfile({
          id: "metal-guest",
          fullName: "Карачевцев Вениамин",
          status: "INVITED",
          businessProfile: {
            main: {
              sphere: "металлургия",
              specifics: "производство",
              role: "Собственник",
            },
          },
        }),
        potentialProfile({
          id: "restaurant-guest",
          fullName: "Ресторанный гость",
          status: "INVITED",
          businessProfile: {
            main: {
              sphere: "рестораны",
              specifics: "сеть ресторанов",
              role: "Собственник",
            },
          },
        }),
      ],
      candidates: [
        candidate({
          profileId: "real-estate-fit",
          dossier: {
            industry: "недвижимость девелопмент инжиниринг",
            canBeUseful: "проектирование и строительство объектов",
          },
        }),
        candidate({
          profileId: "chemical-fit",
          dossier: {
            industry: "химическая промышленность производство",
            canBeUseful: "производственные процессы",
          },
        }),
        candidate({
          profileId: "industrial-fit",
          dossier: {
            industry: "промышленные товары производство",
            canBeUseful: "B2B производство",
          },
        }),
        candidate({
          profileId: "metal-fit",
          dossier: {
            industry: "металлургия производство",
            canBeUseful: "металлургический бизнес",
          },
        }),
        candidate({
          profileId: "restaurant-fit",
          dossier: {
            industry: "рестораны сеть ресторанов",
            canBeUseful: "операционка ресторанной сети",
          },
        }),
      ],
    });

    expect(result.excludedPotentials).toEqual([]);
    expect(result.matches).toHaveLength(5);
    expect(result.coverage.coveredPotentialIds.sort()).toEqual([
      "chemical-guest",
      "industrial-guest",
      "metal-guest",
      "real-estate-guest",
      "restaurant-guest",
    ]);
    expect(new Set(result.matches.map((match) => match.matchedPotentialName)).size)
      .toBe(5);
  });

  it("does not duplicate active participants and respects target plus buffer", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          activeInvitePlan: {
            targetCount: 1,
            bufferCount: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({ profileId: "active-1" }),
        candidate({ profileId: "active-2" }),
        candidate({ profileId: "active-3" }),
      ],
    });

    expect(result.matches).toHaveLength(2);
    expect(new Set(result.matches.map((match) => match.activeProfileId)).size).toBe(
      2
    );
  });

  it("allows high-confidence unmarked candidates to outrank weak ready candidates in soft readiness mode", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          readinessPolicy: {
            mode: "soft",
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({
          profileId: "ready-weak",
          readiness: "READY",
          dossier: {
            industry: "юридические услуги",
            position: "Операционный директор",
            revenue: null,
            interests: null,
            canBeUseful: null,
            clubGoals: null,
          },
        }),
        candidate({
          profileId: "unmarked-strong",
          readiness: "UNMARKED",
        }),
      ],
    });

    expect(result.matches[0]).toMatchObject({
      activeProfileId: "unmarked-strong",
      readiness: "UNMARKED",
    });
    expect(result.matches[0].risks).toContain(
      "Готовность к формату не размечена"
    );
  });

  it("downranks recent attendees from other PAU formats without hard excluding them", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          recentVisitExclusion: {
            enabled: false,
          },
          crossFormatCooldown: {
            enabled: true,
            days: 30,
            mode: "penalty",
            penalty: 0.2,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({
          profileId: "recent-other-format",
          formatVisits: [
            {
              formatSlug: "expert-dialogue",
              attendedAt: "2026-07-20T12:00:00.000Z",
            },
          ],
        }),
        candidate({ profileId: "available-now" }),
      ],
    });

    expect(result.matches[0].activeProfileId).toBe("available-now");
    expect(result.matches.map((match) => match.activeProfileId)).toContain(
      "recent-other-format"
    );
    expect(
      result.pairs.find((pair) => pair.activeProfileId === "recent-other-format")
        ?.loadPenalty
    ).toBeGreaterThan(0);
  });

  it("lets format strategy weights change pair order without bypassing hard exclusions", () => {
    const baseInput = {
      event: {
        id: "event-1",
        title: "Экспертный диалог",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "expert-dialogue",
      },
      potentials: [potential],
      candidates: [
        candidate({
          profileId: "domain-fit",
          dossier: {
            industry: "разработка B2B SaaS для продаж",
            canBeUseful: null,
            clubGoals: null,
            interests: null,
          },
        }),
        candidate({
          profileId: "request-fit",
          dossier: {
            industry: "строительство",
            canBeUseful: "помогаю найти партнеров и обсудить enterprise продажи",
          },
        }),
        candidate({
          profileId: "not-ready",
          readiness: "NOT_READY",
          dossier: {
            industry: "разработка B2B SaaS для продаж",
          },
        }),
      ],
    };

    const guest = matchProfiles({
      ...baseInput,
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
    });
    const expert = matchProfiles({
      ...baseInput,
      format: {
        slug: "expert-dialogue",
        name: "Экспертный диалог",
        matchingRules: {
          formatStrategy: {
            kind: "expert_dialogue",
          },
        },
      },
    });

    expect(guest.matches[0].activeProfileId).toBe("request-fit");
    expect(expert.matches[0].activeProfileId).toBe("domain-fit");
    expect(expert.matches.map((match) => match.activeProfileId)).not.toContain(
      "not-ready"
    );
  });

  it("combines deterministic score with semantic rerank and ignores unknown ids", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [
        candidate({ profileId: "active-1" }),
        candidate({
          profileId: "active-2",
          dossier: {
            ...candidate().dossier,
            industry: "строительство складов",
            canBeUseful: "строительство и девелопмент",
          },
        }),
      ],
    });

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "active-2::potential-1",
          activeProfileId: "active-2",
          potentialId: "potential-1",
          semanticScore: 0.95,
          reason: "Смысловая связка сильнее по задаче гостя.",
          introTopic: "Сравнить опыт продаж и партнерств",
          risks: ["часть бизнес-полей заполнена слабо"],
          evidenceFields: ["request_fit"],
        },
        {
          pairId: "missing::potential-1",
          activeProfileId: "missing",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "unknown",
          introTopic: "unknown",
          risks: [],
          evidenceFields: [],
        },
      ],
    });

    expect(reranked.matches[0]).toMatchObject({
      activeProfileId: "active-2",
      semanticScore: 0.95,
    });
    expect(reranked.pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activeProfileId: "active-2",
          semanticScore: 0.95,
          semanticReason: "Смысловая связка сильнее по задаче гостя.",
        }),
      ])
    );
    expect(reranked.audit.semanticMode).toBe("capped");
    expect(reranked.audit.semanticStatus).toBe("capped");
    expect(reranked.matches.map((match) => match.activeProfileId)).not.toContain(
      "missing"
    );
  });

  it("applies semantic rerank by default instead of leaving it in shadow mode", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [
        candidate({ profileId: "active-1" }),
        candidate({ profileId: "active-2" }),
      ],
    });

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "active-1::potential-1",
          activeProfileId: "active-1",
          potentialId: "potential-1",
          semanticScore: 0,
          reason: "LLM считает связку слабой.",
          introTopic: "Проверить вручную",
          risks: [],
          evidenceFields: ["business_domain"],
        },
        {
          pairId: "active-2::potential-1",
          activeProfileId: "active-2",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "LLM считает связку сильной.",
          introTopic: "Обсудить продажи",
          risks: [],
          evidenceFields: ["business_domain"],
        },
      ],
    });

    expect(reranked.audit.semanticMode).toBe("capped");
    expect(reranked.audit.semanticStatus).toBe("capped");
    expect(reranked.matches[0]).toMatchObject({
      activeProfileId: "active-2",
      semanticScore: 1,
    });
  });

  it("ignores semantic pair ids when active or potential ids do not match the deterministic pair", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          semanticPolicy: {
            mode: "capped",
            maxMovement: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [candidate({ profileId: "active-1" })],
    });

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "active-1::potential-1",
          activeProfileId: "other-active",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "Подмена active id.",
          introTopic: "Подмена",
          risks: [],
          evidenceFields: ["semantic"],
        },
      ],
    });

    expect(reranked.matches[0].activeProfileId).toBe("active-1");
    expect(reranked.matches[0].semanticScore).toBeUndefined();
  });

  it("accepts semantic score but does not copy model-invented evidence fields or risks", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          semanticPolicy: {
            mode: "capped",
            maxMovement: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [candidate({ profileId: "active-1" })],
    });
    const deterministicRationale = base.matches[0].rationale;
    const deterministicIntroTopic = base.matches[0].introTopic;

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "active-1::potential-1",
          activeProfileId: "active-1",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "Модель выдумала новое основание.",
          introTopic: "Новая тема от модели",
          risks: ["модельный риск"],
          evidenceFields: ["semantic"],
        },
      ],
    });

    expect(reranked.matches[0]).toMatchObject({
      semanticScore: 1,
      semanticReason: "Модель выдумала новое основание.",
    });
    expect(reranked.matches[0].evidenceFields).not.toContain("semantic");
    expect(reranked.matches[0].rationale).toBe(deterministicRationale);
    expect(reranked.matches[0].introTopic).toBe(deterministicIntroTopic);
    expect(reranked.matches[0].risks).not.toContain("модельный риск");
  });

  it("keeps deterministic explanation even when semantic output cites existing evidence", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          semanticPolicy: {
            mode: "capped",
            maxMovement: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [candidate({ profileId: "active-1" })],
    });
    const deterministicRationale = base.matches[0].rationale;
    const deterministicIntroTopic = base.matches[0].introTopic;

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "active-1::potential-1",
          activeProfileId: "active-1",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "Модель придумала неподтвержденную причину.",
          introTopic: "Неподтвержденная тема",
          risks: ["модельный риск"],
          evidenceFields: ["business_domain"],
        },
      ],
    });

    expect(reranked.matches[0]).toMatchObject({
      semanticScore: 1,
      semanticReason: "Модель придумала неподтвержденную причину.",
      rationale: deterministicRationale,
      introTopic: deterministicIntroTopic,
    });
    expect(reranked.matches[0].risks).not.toContain("модельный риск");
  });

  it("lets a materially stronger semantic unmarked candidate outrank a weak ready candidate", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {},
      },
      potentials: [potential],
      candidates: [
        candidate({
          profileId: "ready-weaker",
          readiness: "READY",
          dossier: {
            ...candidate().dossier,
            company: "Юридическое бюро",
            industry: "юридические услуги",
            position: "Операционный директор",
            revenue: null,
            interests: null,
            canBeUseful: null,
            clubGoals: null,
          },
        }),
        candidate({
          profileId: "unmarked-stronger",
          readiness: "UNMARKED",
        }),
      ],
    });

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "unmarked-stronger::potential-1",
          activeProfileId: "unmarked-stronger",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "LLM считает это сильной связкой.",
          introTopic: "Обсудить продажи",
          risks: [],
          evidenceFields: ["business_domain"],
        },
      ],
    });

    expect(reranked.matches[0]).toMatchObject({
      activeProfileId: "unmarked-stronger",
      readiness: "UNMARKED",
    });
  });

  it("does not let unevaluated pairs displace evaluated pairs in capped semantic selection", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          activeInvitePlan: {
            targetCount: 3,
            bufferCount: 0,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({ profileId: "evaluated-low" }),
        candidate({ profileId: "evaluated-high" }),
        candidate({ profileId: "not-sent-to-llm" }),
      ],
    });

    expect(base.matches.map((match) => match.activeProfileId)).toEqual([
      "evaluated-high",
      "evaluated-low",
      "not-sent-to-llm",
    ]);

    const reranked = applySemanticRerank(
      {
        ...base,
        audit: {
          ...base.audit,
          selectionLimit: 2,
        },
      },
      {
        matches: [
          {
            pairId: "evaluated-low::potential-1",
            activeProfileId: "evaluated-low",
            potentialId: "potential-1",
            semanticScore: 0.2,
            reason: "LLM оценил как слабую связку.",
            introTopic: "Проверить вручную",
            risks: [],
            evidenceFields: ["semantic"],
          },
          {
            pairId: "evaluated-high::potential-1",
            activeProfileId: "evaluated-high",
            potentialId: "potential-1",
            semanticScore: 0.9,
            reason: "LLM оценил как сильную связку.",
            introTopic: "Обсудить продажи",
            risks: [],
            evidenceFields: ["semantic"],
          },
        ],
      }
    );

    expect(reranked.matches.slice(0, 2).map((match) => match.activeProfileId))
      .toEqual(["evaluated-high", "evaluated-low"]);
    expect(reranked.matches.slice(0, 2).map((match) => match.semanticScore))
      .toEqual([0.9, 0.2]);
  });

  it("keeps many-to-many potential fits for a selected active participant", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          activeInvitePlan: {
            targetCount: 1,
            bufferCount: 0,
          },
        },
      },
      potentials: [
        potentialProfile({
          id: "saas-guest",
          fullName: "SaaS-гость",
          businessProfile: {
            main: {
              sphere: "IT | разработка ПО",
              specifics: "B2B SaaS продажи",
              role: "Владелец",
            },
          },
        }),
        potentialProfile({
          id: "factory-guest",
          fullName: "Производственный гость",
          businessProfile: {
            main: {
              sphere: "производство",
              specifics: "автоматизация завода",
              role: "Собственник",
            },
          },
        }),
      ],
      candidates: [
        candidate({
          profileId: "bridge-active",
          dossier: {
            industry: "B2B SaaS автоматизация производства",
            canBeUseful: "помогаю с продажами SaaS и автоматизацией заводов",
          },
        }),
      ],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.coverage.coveredPotentialIds.sort()).toEqual([
      "factory-guest",
      "saas-guest",
    ]);
    expect(result.matches[0].relatedPotentialMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          potentialId: "saas-guest",
          potentialName: "SaaS-гость",
        }),
        expect.objectContaining({
          potentialId: "factory-guest",
          potentialName: "Производственный гость",
        }),
      ])
    );
  });

  it("does not attach weak unrelated potentials as many-to-many fits", () => {
    const result = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          activeInvitePlan: {
            targetCount: 1,
            bufferCount: 0,
          },
        },
      },
      potentials: [
        potentialProfile({
          id: "saas-guest",
          fullName: "SaaS-гость",
          businessProfile: {
            main: {
              sphere: "IT | разработка ПО",
              specifics: "B2B SaaS продажи",
              role: "Владелец",
            },
          },
        }),
        potentialProfile({
          id: "theater-guest",
          fullName: "Театральный гость",
          businessProfile: {
            main: {
              sphere: "театр",
              specifics: "постановки и актерская школа",
              role: "Режиссер",
            },
          },
          enrichment: {
            clubGoals: "творческие коллаборации",
          },
        }),
      ],
      candidates: [
        candidate({
          profileId: "saas-active",
          dossier: {
            industry: "B2B SaaS продажи",
            canBeUseful: "помогаю с продажами SaaS",
            clubGoals: "партнерства в IT",
            interests: "enterprise software",
          },
        }),
      ],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].relatedPotentialMatches.map((match) => match.potentialId))
      .toEqual(["saas-guest"]);
    expect(result.coverage.coveredPotentialIds).toEqual(["saas-guest"]);
  });

  it("reselects capped semantic matches within the configured movement cap", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          semanticPolicy: {
            mode: "capped",
            maxMovement: 1,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({ profileId: "active-1" }),
        candidate({ profileId: "active-2" }),
      ],
    });

    expect(base.matches[0].activeProfileId).toBe("active-1");

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "active-1::potential-1",
          activeProfileId: "active-1",
          potentialId: "potential-1",
          semanticScore: 0,
          reason: "Слабая смысловая связка.",
          introTopic: "Проверить вручную",
          risks: [],
          evidenceFields: ["business_domain"],
        },
        {
          pairId: "active-2::potential-1",
          activeProfileId: "active-2",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "Сильная смысловая связка.",
          introTopic: "Обсудить продажи",
          risks: [],
          evidenceFields: ["business_domain"],
        },
      ],
    });

    expect(reranked.matches[0]).toMatchObject({
      activeProfileId: "active-2",
      semanticScore: 1,
    });
    expect(reranked.audit.semanticMode).toBe("capped");
    expect(reranked.audit.semanticStatus).toBe("capped");
    expect(reranked.coverage.selectedCount).toBe(reranked.matches.length);
  });

  it("keeps deterministic order when capped semantic movement is zero", () => {
    const base = matchProfiles({
      event: {
        id: "event-1",
        title: "Гостевая встреча",
        startsAt: "2026-07-30T12:00:00.000Z",
        formatSlug: "guest-meeting",
      },
      format: {
        slug: "guest-meeting",
        name: "Гостевая встреча",
        matchingRules: {
          semanticPolicy: {
            mode: "capped",
            maxMovement: 0,
          },
        },
      },
      potentials: [potential],
      candidates: [
        candidate({ profileId: "active-1" }),
        candidate({ profileId: "active-2" }),
      ],
    });

    const reranked = applySemanticRerank(base, {
      matches: [
        {
          pairId: "active-2::potential-1",
          activeProfileId: "active-2",
          potentialId: "potential-1",
          semanticScore: 1,
          reason: "Сильная смысловая связка.",
          introTopic: "Обсудить продажи",
          risks: [],
          evidenceFields: ["business_domain"],
        },
      ],
    });

    expect(reranked.matches[0].activeProfileId).toBe("active-1");
    expect(
      reranked.pairs.find((pair) => pair.activeProfileId === "active-2")
        ?.semanticScore
    ).toBe(1);
  });
});
