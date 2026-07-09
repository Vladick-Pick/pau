import {
  type ActiveParticipantDecision,
  type Brief,
  type Event,
  type EventFormat,
  type EventParticipant,
  type EventParticipantStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getOptionalEnv, isDatabaseConfigured } from "@/lib/env";
import { buildMatchingRunPlan } from "@/lib/matching/matching-settings";
import { buildMatchRunAudit } from "@/lib/matching/match-run-audit";
import {
  applySemanticRerank,
  finalizeProfileMatchResult,
  matchProfiles,
  type ActiveMatchCandidate,
  type ActiveMatchDossier,
  type MatchBusinessProfile,
  type MatchEnrichment,
  type PotentialMatchProfile,
  type ProfileMatchInput,
  type ProfileMatchResult,
} from "@/lib/matching/profile-matching";
import {
  requestSemanticRerank,
  type SemanticRerankInput,
} from "@/lib/matching/semantic-rerank";
import { rowToFacts, rulesToInputs } from "@/lib/pau/active-participants";
import { evaluateActive } from "@/lib/pau/active-rules";
import { getClubRules, roleIdsByProfile } from "@/lib/pau/active-store";
import { sortClubsForDefaultSelection } from "@/lib/pau/club-ordering";
import { buildEventMatchProfile } from "@/lib/pau/preparation";

const BITRIX_DEAL_CLUB_BRANCH_FIELD = "UF_CRM_DEAL_FILIAL_KLUBA__VYBOR_";
const BITRIX_DEAL_ENRICHMENT_FIELDS = {
  keyProjects: "UF_CRM_1766147164481",
  clubConnections: "UF_CRM_1766147207634",
} as const;
const BITRIX_DEAL_CLUB_BRANCH_LABELS: Record<string, string> = {
  "2": "Москва",
};

const eventMatchingInclude = {
  format: true,
  participants: {
    orderBy: [{ kind: "asc" }, { status: "asc" }, { fullName: "asc" }],
    include: {
      briefs: { orderBy: { createdAt: "desc" } },
    },
  },
} satisfies Prisma.EventInclude;

export type EventMatchingResult = {
  activeParticipants: Array<{
    id: string;
    fullName: string;
    score?: number | null;
    rationale?: string | null;
    profile?: unknown;
  }>;
  rationale: string;
};

export type RunEventMatchingInput = {
  eventId: string;
  actor?: unknown;
};

type EventForMatching = Event & {
  format: EventFormat;
  participants: Array<EventParticipant & { briefs: Brief[] }>;
};

type ProfileMatchingBuildResult = {
  clubId: string;
  input: ProfileMatchInput;
};

type SemanticRerankAudit = {
  status: "shadow" | "capped" | "skipped_no_key" | "skipped_empty" | "failed";
  model?: string;
  error?: string;
  skippedPairCount?: number;
  returnedPairCount?: number;
  appliedPairCount?: number;
};

type MemberProfileForMatching = Prisma.MemberProfileGetPayload<{
  include: {
    formatVisits: {
      select: {
        formatSlug: true;
        attendedAt: true;
      };
    };
  };
}>;

type EventMatchWriteClient = Pick<
  Prisma.TransactionClient,
  "eventMatchRun" | "eventParticipant"
>;

type SemanticRerankBuildResult = {
  input: SemanticRerankInput;
  skippedPairCount: number;
};

const SEMANTIC_EVIDENCE_FIELDS = new Set([
  "business_domain",
  "business_role",
  "request_fit",
  "scale",
  "personal_context",
]);

export async function runEventMatching(
  input: RunEventMatchingInput
): Promise<EventMatchingResult> {
  assertDatabase();
  const { eventId } = input;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: eventMatchingInclude,
  });
  if (!event) {
    throw new Error("Event not found");
  }

  const profile = buildEventMatchProfile({
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt?.toISOString() ?? null,
      formatSlug: event.formatSlug,
    },
    format: {
      slug: event.format.slug,
      name: event.format.name,
      matchingRules: event.format.matchingRules,
    },
    participants: event.participants.map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      status: participant.status,
      fullName: participant.fullName,
      company: participant.company,
      position: participant.position,
      city: participant.city,
      age: participant.age,
      gender: participant.gender,
      businessMain: participant.businessMain,
      businessExtra1: participant.businessExtra1,
      businessExtra2: participant.businessExtra2,
      businessExtra3: participant.businessExtra3,
      businessProfile: participant.businessProfile,
      enrichment: participant.enrichment,
    })),
  });
  const startedAt = new Date();
  const existingActiveParticipants = event.participants.filter(
    (participant) => participant.kind === "ACTIVE"
  );

  try {
    const matchingInput = await buildProfileMatchingInput(event);
    const runPlan = buildMatchingRunPlan(
      matchingInput.input.format.matchingRules
    );
    const deterministic = matchProfiles({
      ...matchingInput.input,
      limit: runPlan.semanticCandidateLimit,
    });
    const { result: matchedProfiles, semantic } = await maybeApplySemanticRerank(
      matchingInput.input,
      deterministic
    );
    const finalProfiles = finalizeProfileMatchResult(
      matchedProfiles,
      runPlan.activeParticipantLimit
    );
    const result = buildEventMatchResult({
      clubId: matchingInput.clubId,
      profileResult: finalProfiles,
      matchingInput: matchingInput.input,
      semantic,
      activeParticipantLimit: runPlan.activeParticipantLimit,
    });
    const audit = buildMatchRunAudit({
      startedAt,
      finishedAt: new Date(),
      settings: runPlan.settings,
      matcherInput: matchingInput.input,
      semanticStatus: semantic.status,
      semanticModel: semantic.model ?? null,
      semanticError: semantic.error ?? null,
      semanticSkippedPairCount: semantic.skippedPairCount ?? 0,
      candidates: matchingInput.input.candidates.map((candidate) => ({
        profileId: candidate.profileId,
        profileUpdatedAt: candidate.profileUpdatedAt ?? null,
        syncedAt: candidate.syncedAt ?? null,
      })),
      potentialIds: finalProfiles.coverage.targetPotentialIds,
      selectedPotentialIds: finalProfiles.matches.flatMap(
        (match) => match.coveredPotentialIds
      ),
      selectedCount: result.activeParticipants.length,
      excludedReasons: finalProfiles.excluded,
      actorRole: actorRole(input.actor),
      actorUserName: actorUserName(input.actor),
      operatorFeedback: existingActiveParticipants.map((participant) => ({
        eventParticipantId: participant.id,
        matchingProfileId: getMatchingProfileId(participant.sourcePayload),
        matchedPotentialId: getMatchingProfileField(
          participant.sourcePayload,
          "matchedPotentialId"
        ),
        pairId: getMatchingProfileField(participant.sourcePayload, "pairId"),
        activeDecision: participant.activeDecision,
        activeDecisionComment: participant.activeDecisionComment,
        statusUpdatedAt: participant.statusUpdatedAt?.toISOString() ?? null,
      })),
    });
    const existingActiveByProfileId = new Map(
      existingActiveParticipants.flatMap((participant) => {
        const profileId = getMatchingProfileId(participant.sourcePayload);
        return profileId ? [[profileId, participant] as const] : [];
      })
    );
    const matchedActiveProfileIds = new Set(
      result.activeParticipants.map((participant) => participant.id)
    );

    await prisma.$transaction(async (tx) => {
      await tx.eventMatchRun.create({
        data: {
          eventId,
          activeParticipantIds: result.activeParticipants.map(
            (participant) => participant.id
          ),
          activeParticipantCount: result.activeParticipants.length,
          rationale: result.rationale,
          requestPayload: {
            eventProfile: profile,
            clubId: matchingInput.clubId,
            matcher: {
              settings: matchedProfiles.settings,
              activeParticipantLimit: runPlan.activeParticipantLimit,
              semanticCandidateLimit: runPlan.semanticCandidateLimit,
              candidates: matchingInput.input.candidates.length,
              potentials: matchingInput.input.potentials.length,
            },
          } as Prisma.InputJsonValue,
          responsePayload: {
            ...result,
            profileMatching: finalProfiles,
            semantic,
            audit,
          } as Prisma.InputJsonValue,
        },
      });

      await reconcileStaleActiveParticipants({
        tx,
        participants: existingActiveParticipants,
        matchedActiveProfileIds,
      });

      const candidateIdsByName = buildCandidateIdsByName(
        matchingInput.input.candidates
      );

      for (const [index, active] of result.activeParticipants.entries()) {
        const matchOrder = index + 1;
        const existing =
          existingActiveByProfileId.get(active.id) ??
          (await findReusableExistingActive({
            tx,
            eventId,
            active,
            candidateIdsByName,
          }));
        const data = {
          kind: "ACTIVE" as const,
          status: existing?.activeDecision
            ? activeDecisionStatus(existing.activeDecision)
            : ("UNKNOWN" as const),
          fullName: active.fullName,
          ...extractMatchingProfileFields(active.profile),
          matchedScore: active.score ?? null,
          matchRationale: active.rationale ?? result.rationale,
          sourcePayload: {
            matchingProfileId: active.id,
            matchingProfile: active.profile ?? null,
            matchOrder,
          } as Prisma.InputJsonValue,
        };

        if (existing) {
          await tx.eventParticipant.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await tx.eventParticipant.create({
            data: {
              eventId,
              ...data,
            },
          });
        }
      }
    });

    return result;
  } catch (error) {
    try {
      const failedPlan = buildMatchingRunPlan(event.format.matchingRules);
      const failureAudit = buildMatchRunAudit({
        startedAt,
        finishedAt: new Date(),
        settings: failedPlan.settings,
        matcherInput: profile,
        semanticStatus: "skipped_empty",
        candidates: [],
        potentialIds: [],
        selectedPotentialIds: [],
        selectedCount: 0,
        excludedReasons: [],
        actorRole: actorRole(input.actor),
        actorUserName: actorUserName(input.actor),
        operatorFeedback: existingActiveParticipants.map((participant) => ({
          eventParticipantId: participant.id,
          matchingProfileId: getMatchingProfileId(participant.sourcePayload),
          matchedPotentialId: getMatchingProfileField(
            participant.sourcePayload,
            "matchedPotentialId"
          ),
          pairId: getMatchingProfileField(participant.sourcePayload, "pairId"),
          activeDecision: participant.activeDecision,
          activeDecisionComment: participant.activeDecisionComment,
          statusUpdatedAt: participant.statusUpdatedAt?.toISOString() ?? null,
        })),
        error: error instanceof Error ? error.message : "Unknown error",
      });
      await prisma.eventMatchRun.create({
        data: {
          eventId,
          activeParticipantCount: 0,
          requestPayload: {
            eventProfile: profile,
          } as Prisma.InputJsonValue,
          responsePayload: {
            audit: failureAudit,
          } as Prisma.InputJsonValue,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    } catch {
      // Keep the original matching failure visible to the caller.
    }
    throw error;
  }
}

async function reconcileStaleActiveParticipants(input: {
  tx: EventMatchWriteClient;
  participants: EventForMatching["participants"];
  matchedActiveProfileIds: Set<string>;
}) {
  for (const participant of input.participants) {
    const profileId = getMatchingProfileId(participant.sourcePayload);
    if (!profileId || input.matchedActiveProfileIds.has(profileId)) {
      continue;
    }

    if (hasOperatorArtifacts(participant)) {
      await input.tx.eventParticipant.update({
        where: { id: participant.id },
        data: {
          matchedScore: null,
          matchRationale: null,
          sourcePayload: clearStaleMatchOrder(participant.sourcePayload),
        },
      });
      continue;
    }

    await input.tx.eventParticipant.delete({
      where: { id: participant.id },
    });
  }
}

function hasOperatorArtifacts(participant: EventForMatching["participants"][number]) {
  return (
    participant.activeDecision !== null ||
    stringValue(participant.activeDecisionComment) !== null ||
    participant.attendanceMarked === true ||
    participant.briefs.length > 0
  );
}

function clearStaleMatchOrder(sourcePayload: Prisma.JsonValue | null) {
  if (!isPlainRecord(sourcePayload)) {
    return sourcePayload as Prisma.InputJsonValue;
  }

  const next: Record<string, unknown> = { ...sourcePayload };
  delete next.matchOrder;

  if (isPlainRecord(next.matchingProfile)) {
    const matchingProfile = { ...next.matchingProfile };
    delete matchingProfile.matchOrder;
    next.matchingProfile = matchingProfile;
  }

  return next as Prisma.InputJsonValue;
}

function buildCandidateIdsByName(candidates: ActiveMatchCandidate[]) {
  return candidates.reduce<Map<string, string[]>>((index, candidate) => {
    const name = stringValue(candidate.displayName);
    if (!name) {
      return index;
    }

    const existing = index.get(name) ?? [];
    existing.push(candidate.profileId);
    index.set(name, existing);
    return index;
  }, new Map());
}

async function findReusableExistingActive(input: {
  tx: EventMatchWriteClient;
  eventId: string;
  active: EventMatchingResult["activeParticipants"][number];
  candidateIdsByName: Map<string, string[]>;
}) {
  const candidateIds = input.candidateIdsByName.get(input.active.fullName) ?? [];
  if (candidateIds.length !== 1 || candidateIds[0] !== input.active.id) {
    return null;
  }

  const existing = await input.tx.eventParticipant.findFirst({
    where: {
      eventId: input.eventId,
      kind: "ACTIVE",
      fullName: input.active.fullName,
    },
  });

  if (!existing) {
    return null;
  }

  const existingProfileId = getMatchingProfileId(existing.sourcePayload);
  if (existingProfileId !== input.active.id) {
    return null;
  }

  return existing;
}

async function buildProfileMatchingInput(
  event: EventForMatching
): Promise<ProfileMatchingBuildResult> {
  const clubId = await resolveMatchingClubId();
  if (!clubId) {
    throw new Error("No club profiles configured for matching");
  }

  const [readinessRows, members, rules, roleMap] = await Promise.all([
    prisma.formatReadiness.findMany({
      where: {
        clubId,
        formatId: event.formatSlug,
      },
      select: {
        profileId: true,
        readiness: true,
      },
    }),
    prisma.memberProfile.findMany({
      where: {
        clubId,
        stateCode: "active",
      },
      include: {
        formatVisits: {
          select: {
            formatSlug: true,
            attendedAt: true,
          },
        },
      },
      orderBy: [{ displayName: "asc" }, { profileId: "asc" }],
    }),
    getClubRules(clubId).then(rulesToInputs),
    roleIdsByProfile(clubId),
  ]);
  const readinessByProfileId = new Map(
    readinessRows.map((row) => [row.profileId, row.readiness])
  );

  return {
    clubId,
    input: {
      event: {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt?.toISOString() ?? null,
        formatSlug: event.formatSlug,
      },
      format: {
        slug: event.format.slug,
        name: event.format.name,
        description: event.format.description,
        matchingRules: event.format.matchingRules,
      },
      potentials: event.participants
        .filter((participant) => participant.kind === "POTENTIAL")
        .map(mapPotentialForMatching),
      candidates: members.map((member) =>
        mapMemberForMatching({
          member,
          readiness: normalizeReadiness(readinessByProfileId.get(member.profileId)),
          rules,
          roleIds: roleMap.get(member.profileId) ?? [],
        })
      ),
    },
  };
}

async function resolveMatchingClubId() {
  const configured = getOptionalEnv("PAU_MATCHING_CLUB_ID");
  if (configured) {
    return configured;
  }

  const clubs = await prisma.club.findMany();
  return sortClubsForDefaultSelection(clubs)[0]?.id ?? null;
}

function mapPotentialForMatching(
  participant: EventParticipant & { briefs: Brief[] }
): PotentialMatchProfile {
  const businessProfile = normalizeParticipantBusinessProfile(participant);

  return {
    id: participant.id,
    fullName: participant.fullName,
    status: participant.status,
    position: participant.position ?? businessProfile?.main?.role ?? null,
    city: participant.city ?? getParticipantClubBranch(participant.sourcePayload),
    businessMain: participant.businessMain,
    businessExtra1: participant.businessExtra1,
    businessExtra2: participant.businessExtra2,
    businessExtra3: participant.businessExtra3,
    businessProfile,
    enrichment: normalizeParticipantEnrichment(participant),
  };
}

function mapMemberForMatching(input: {
  member: MemberProfileForMatching;
  readiness: ActiveMatchCandidate["readiness"];
  rules: ReturnType<typeof rulesToInputs>;
  roleIds: string[];
}): ActiveMatchCandidate {
  const facts = rowToFacts(input.member);
  const evaluation = evaluateActive(input.rules, facts, {
    hasRole: input.roleIds.length > 0,
  });

  return {
    profileId: input.member.profileId,
    displayName: input.member.displayName,
    stateCode: input.member.stateCode,
    readiness: input.readiness,
    profileUpdatedAt: input.member.profileUpdatedAt?.toISOString() ?? null,
    syncedAt: input.member.syncedAt.toISOString(),
    activeEvaluation: {
      passed: evaluation.total === 0 ? true : evaluation.passed,
      failedKeys: evaluation.failed.map((rule) => rule.key),
      missingKeys: evaluation.missing.map((rule) => rule.key),
      total: evaluation.total,
      roleIds: input.roleIds,
    },
    dossier: normalizeActiveDossier(input.member.dossier),
    formatVisits: input.member.formatVisits.map((visit) => ({
      formatSlug: visit.formatSlug,
      attendedAt: visit.attendedAt.toISOString(),
    })),
  };
}

function normalizeReadiness(
  value: string | null | undefined
): ActiveMatchCandidate["readiness"] {
  if (value === "READY" || value === "NOT_READY") {
    return value;
  }

  return "UNMARKED";
}

function normalizeActiveDossier(value: Prisma.JsonValue): ActiveMatchDossier {
  const dossier = isPlainRecord(value) ? value : {};

  return {
    company: getString(dossier.company),
    revenue: getString(dossier.revenue),
    industry: getString(dossier.industry),
    position: getString(dossier.position),
    city: getString(dossier.city),
    age: getInteger(dossier.age),
    interests: getString(dossier.interests),
    canBeUseful: getString(dossier.canBeUseful),
    clubGoals: getString(dossier.clubGoals),
    telegram: getString(dossier.telegram),
  };
}

async function maybeApplySemanticRerank(
  input: ProfileMatchInput,
  deterministic: ProfileMatchResult
): Promise<{ result: ProfileMatchResult; semantic: SemanticRerankAudit }> {
  if (deterministic.matches.length === 0) {
    return {
      result: deterministic,
      semantic: { status: "skipped_empty" },
    };
  }

  const apiKey = getOptionalEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    return {
      result: deterministic,
      semantic: { status: "skipped_no_key" },
    };
  }

  const model =
    getOptionalEnv("OPENROUTER_MATCHING_MODEL") ??
    getOptionalEnv("OPENROUTER_MODEL") ??
    "openai/gpt-5-mini";
  const appTitle = getOptionalEnv("OPENROUTER_APP_TITLE") ?? "ПАУ";
  const semanticInput = buildSemanticRerankInput(input, deterministic);
  if (semanticInput.input.pairs.length === 0) {
    return {
      result: deterministic,
      semantic: {
        status: "skipped_empty",
        model,
        skippedPairCount: semanticInput.skippedPairCount,
      },
    };
  }

  try {
    const semanticResult = await requestSemanticRerank({
      apiKey,
      appTitle,
      model,
      input: semanticInput.input,
    });
    const result = applySemanticRerank(deterministic, semanticResult);

    return {
      result,
      semantic: {
        status: deterministic.settings.semanticPolicy.mode,
        model,
        skippedPairCount: semanticInput.skippedPairCount,
        returnedPairCount: semanticResult.matches.length,
        appliedPairCount: result.pairs.filter(
          (pair) => typeof pair.semanticScore === "number"
        ).length,
      },
    };
  } catch (error) {
    return {
      result: deterministic,
      semantic: {
        status: "failed",
        model,
        error: error instanceof Error ? error.message : "Unknown error",
        skippedPairCount: semanticInput.skippedPairCount,
      },
    };
  }
}

function buildSemanticRerankInput(
  input: ProfileMatchInput,
  deterministic: ProfileMatchResult
): SemanticRerankBuildResult {
  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.profileId, candidate])
  );
  const potentialsById = new Map(
    input.potentials.map((potential) => [potential.id, potential])
  );
  const pairsById = new Map(
    deterministic.pairs.map((pair) => [pair.pairId, pair])
  );
  let skippedPairCount = 0;
  const seenPairIds = new Set<string>();
  const pairs = deterministic.matches.flatMap((match) =>
    match.relatedPotentialMatches.flatMap((relatedMatch) => {
      if (seenPairIds.has(relatedMatch.pairId)) {
        return [];
      }
      seenPairIds.add(relatedMatch.pairId);
      const pair = pairsById.get(relatedMatch.pairId);
      const candidate = candidatesById.get(match.activeProfileId);
      const potential = potentialsById.get(relatedMatch.potentialId);
      const hasSemanticEvidence = pair?.evidenceFields.some((field) =>
        SEMANTIC_EVIDENCE_FIELDS.has(field)
      );
      if (!pair || !candidate || !potential || !hasSemanticEvidence) {
        skippedPairCount += 1;
        return [];
      }

      return [
        {
          pairId: pair.pairId,
          activeProfileId: pair.activeProfileId,
          potentialId: pair.potentialId,
          displayName: pair.activeDisplayName,
          baseScore: pair.baseScore,
          businessContext: activeBusinessContext(candidate),
          usefulnessContext: activeUsefulnessContext(candidate),
          potentialContext: [
            ...potentialBusinessContext(potential),
            ...potentialRequestContext(potential),
          ],
          evidenceFields: pair.evidenceFields,
          risks: pair.risks,
        },
      ];
    })
  );
  const semanticPotentialIds = new Set(pairs.map((pair) => pair.potentialId));

  return {
    input: {
      event: {
        title: input.event.title,
        formatName: input.format.name,
      },
      formatDescription: input.format.description ?? "",
      potentials: input.potentials
        .filter((potential) => semanticPotentialIds.has(potential.id))
        .map((potential) => ({
          id: potential.id,
          businessContext: potentialBusinessContext(potential),
          requestContext: potentialRequestContext(potential),
        })),
      pairs,
    },
    skippedPairCount,
  };
}

function buildEventMatchResult(input: {
  clubId: string;
  profileResult: ProfileMatchResult;
  matchingInput: ProfileMatchInput;
  semantic: SemanticRerankAudit;
  activeParticipantLimit: number;
}): EventMatchingResult {
  const candidatesById = new Map(
    input.matchingInput.candidates.map((candidate) => [
      candidate.profileId,
      candidate,
    ])
  );

  return {
    activeParticipants: input.profileResult.matches
      .slice(0, input.activeParticipantLimit)
      .map((match) => {
        const candidate = candidatesById.get(match.activeProfileId);
        const profile = buildMatchedActiveProfile({
          clubId: input.clubId,
          match,
          candidate,
        });

        return {
          id: match.activeProfileId,
          fullName:
            match.activeDisplayName ??
            candidate?.displayName ??
            match.activeProfileId,
          score: match.finalScore,
          rationale: match.rationale,
          profile,
        };
      }),
    rationale: buildProfileMatchRationale(input.profileResult, input.semantic),
  };
}

function buildMatchedActiveProfile(input: {
  clubId: string;
  match: ProfileMatchResult["matches"][number];
  candidate?: ActiveMatchCandidate;
}) {
  const dossier = input.candidate?.dossier;

  return {
    id: input.match.activeProfileId,
    profileId: input.match.activeProfileId,
    clubId: input.clubId,
    company: dossier?.company ?? null,
    position: dossier?.position ?? null,
    city: dossier?.city ?? null,
    age: dossier?.age ?? null,
    businessMain: dossier?.industry ?? null,
    businessExtra1: dossier?.canBeUseful ?? null,
    businessExtra2: dossier?.clubGoals ?? null,
    businessExtra3: dossier?.interests ?? null,
    matchedPotentialId: input.match.matchedPotentialId,
    matchedPotentialName: input.match.matchedPotentialName,
    coveredPotentialIds: input.match.coveredPotentialIds,
    coveredPotentialNames: input.match.coveredPotentialNames,
    pairId: input.match.pairId,
    readiness: input.match.readiness,
    confidence: input.match.confidence,
    evidenceFields: input.match.evidenceFields,
    risks: input.match.risks,
    breakdown: input.match.breakdown,
    semanticScore: input.match.semanticScore ?? null,
    semanticReason: input.match.semanticReason ?? null,
    relatedPotentialMatches: input.match.relatedPotentialMatches,
    introTopic: input.match.introTopic,
  };
}

function buildProfileMatchRationale(
  result: ProfileMatchResult,
  semantic: SemanticRerankAudit
) {
  const excluded = result.excluded.reduce<Record<string, number>>((counts, item) => {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
    return counts;
  }, {});
  const exclusionText = Object.entries(excluded)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ");
  const semanticText =
    semantic.status === "shadow"
      ? "LLM-реранк записан в shadow-аудит, порядок оставлен deterministic"
      : semantic.status === "capped"
        ? "LLM-реранк применен"
      : semantic.status === "failed"
        ? "LLM-реранк не применен, оставлен deterministic score"
        : "LLM-реранк пропущен";

  return [
    `Подобрано ${result.matches.length} активных участников.`,
    exclusionText ? `Исключения: ${exclusionText}.` : null,
    semanticText,
  ]
    .filter(Boolean)
    .join(" ");
}

function potentialBusinessContext(potential: PotentialMatchProfile) {
  return compactMatchingTexts([
    potential.businessMain,
    potential.businessExtra1,
    potential.businessExtra2,
    potential.businessExtra3,
    potential.position,
    potential.city,
    potential.businessProfile?.main?.sphere,
    potential.businessProfile?.main?.specifics,
    potential.businessProfile?.main?.role,
    potential.businessProfile?.main?.revenue,
  ]);
}

function potentialRequestContext(potential: PotentialMatchProfile) {
  return compactMatchingTexts([
    potential.enrichment?.clubGoals,
    potential.enrichment?.additionalInfo,
    potential.enrichment?.usefulForClub,
    potential.enrichment?.keyProjects,
    potential.enrichment?.clubConnections,
    potential.enrichment?.newProjects,
    potential.enrichment?.hobbies,
  ]);
}

function activeBusinessContext(candidate: ActiveMatchCandidate) {
  return compactMatchingTexts([
    candidate.dossier.company,
    candidate.dossier.industry,
    candidate.dossier.position,
    candidate.dossier.revenue,
    candidate.dossier.city,
  ]);
}

function activeUsefulnessContext(candidate: ActiveMatchCandidate) {
  return compactMatchingTexts([
    candidate.dossier.canBeUseful,
    candidate.dossier.clubGoals,
    candidate.dossier.interests,
  ]);
}

function compactMatchingTexts(values: Array<string | null | undefined>) {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function normalizeParticipantBusinessProfile(
  participant: EventParticipant
): MatchBusinessProfile | null {
  if (isPlainRecord(participant.businessProfile)) {
    const profile = participant.businessProfile as MatchBusinessProfile;
    return Object.values(profile).some(Boolean) ? profile : null;
  }

  const profile: MatchBusinessProfile = {
    main: participant.businessMain
      ? buildLegacyBusinessBlock(participant.businessMain)
      : null,
    extra1: participant.businessExtra1
      ? buildLegacyBusinessBlock(participant.businessExtra1)
      : null,
    extra2: participant.businessExtra2
      ? buildLegacyBusinessBlock(participant.businessExtra2)
      : null,
    extra3: participant.businessExtra3
      ? buildLegacyBusinessBlock(participant.businessExtra3)
      : null,
  };

  return Object.values(profile).some(Boolean) ? profile : null;
}

function buildLegacyBusinessBlock(sphere: string) {
  return {
    sphere,
    specifics: null,
    role: null,
    experience: null,
    okved: null,
    sharePercent: null,
    revenue: null,
  };
}

function normalizeParticipantEnrichment(
  participant: EventParticipant
): MatchEnrichment | null {
  return mergeParticipantEnrichment(
    getParticipantDealEnrichment(participant.sourcePayload),
    normalizeEnrichmentRecord(participant.enrichment)
  );
}

function normalizeEnrichmentRecord(
  value: Prisma.JsonValue | null
): Record<string, string> | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const enrichment = Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const text = getString(item);
      return text ? [[key, text]] : [];
    })
  );

  return Object.keys(enrichment).length > 0 ? enrichment : null;
}

function getParticipantClubBranch(
  sourcePayload: Prisma.JsonValue | null
): string | null {
  const deal = getParticipantSourceDeal(sourcePayload);
  const rawValue = getString(deal?.[BITRIX_DEAL_CLUB_BRANCH_FIELD]);
  if (!rawValue) {
    return null;
  }

  return BITRIX_DEAL_CLUB_BRANCH_LABELS[rawValue] ?? rawValue;
}

function getParticipantSourceDeal(
  sourcePayload: Prisma.JsonValue | null
): Record<string, unknown> | null {
  if (!isPlainRecord(sourcePayload)) {
    return null;
  }

  const profile = sourcePayload.profile;
  if (!isPlainRecord(profile) || !isPlainRecord(profile.deal)) {
    return null;
  }

  return profile.deal;
}

function getParticipantDealEnrichment(
  sourcePayload: Prisma.JsonValue | null
): Record<string, string> | null {
  const deal = getParticipantSourceDeal(sourcePayload);
  if (!deal) {
    return null;
  }

  const enrichment = Object.fromEntries(
    Object.entries(BITRIX_DEAL_ENRICHMENT_FIELDS).flatMap(([key, field]) => {
      const text = getString(deal[field]);
      return text ? [[key, text]] : [];
    })
  );

  return Object.keys(enrichment).length > 0 ? enrichment : null;
}

function mergeParticipantEnrichment(
  ...profiles: Array<Record<string, string> | null>
): MatchEnrichment | null {
  const merged = Object.assign({}, ...profiles.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : null;
}

function activeDecisionStatus(
  decision: ActiveParticipantDecision
): EventParticipantStatus {
  if (decision === "INVITED_ATTENDED") {
    return "ATTENDED";
  }

  return "REFUSED";
}

function actorRole(actor: unknown) {
  if (!isPlainRecord(actor)) {
    return null;
  }

  return stringValue(actor.role);
}

function actorUserName(actor: unknown) {
  if (!isPlainRecord(actor)) {
    return null;
  }

  return stringValue(actor.userName);
}

function getMatchingProfileId(sourcePayload: Prisma.JsonValue | null): string | null {
  if (!isPlainRecord(sourcePayload)) {
    return null;
  }

  const direct = stringValue(sourcePayload.matchingProfileId);
  if (direct) {
    return direct;
  }

  const profile = sourcePayload.matchingProfile;
  if (!isPlainRecord(profile)) {
    return null;
  }

  return (
    stringValue(profile.id) ??
    stringValue(profile.profileId) ??
    stringValue(profile.profile_id)
  );
}

function getMatchingProfileField(
  sourcePayload: Prisma.JsonValue | null,
  field: string
): string | null {
  if (!isPlainRecord(sourcePayload)) {
    return null;
  }

  const direct = stringValue(sourcePayload[field]);
  if (direct) {
    return direct;
  }

  return isPlainRecord(sourcePayload.matchingProfile)
    ? stringValue(sourcePayload.matchingProfile[field])
    : null;
}

function extractMatchingProfileFields(profile: unknown) {
  if (!isPlainRecord(profile)) {
    return {};
  }

  return {
    ...stringField("company", profile.company),
    ...stringField("position", profile.position),
    ...stringField("city", profile.city),
    ...stringField("gender", profile.gender),
    ...stringField("businessMain", profile.businessMain),
    ...stringField("businessExtra1", profile.businessExtra1),
    ...stringField("businessExtra2", profile.businessExtra2),
    ...stringField("businessExtra3", profile.businessExtra3),
    ...numberField("age", profile.age),
  };
}

function stringField(field: string, value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  const trimmed = value.trim();
  return trimmed ? { [field]: trimmed } : {};
}

function numberField(field: string, value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return {};
  }

  return { [field]: value };
}

function getString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isInteger(numeric) ? numeric : null;
  }

  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertDatabase() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }
}
