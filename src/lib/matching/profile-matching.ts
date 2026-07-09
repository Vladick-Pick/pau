import {
  getRecentVisitExclusionWindow,
  parseMatchingSettings,
  type MatchingComponentKey,
  type MatchingSettings,
} from "./matching-settings";
import type { SemanticRerankResult } from "./semantic-rerank";

export type ReadinessState = "READY" | "NOT_READY" | "UNMARKED";

export type PotentialParticipationStatus =
  | "INVITED"
  | "CONFIRMED"
  | "REFUSED"
  | "ATTENDED"
  | "MISSED"
  | "UNKNOWN";

export type MatchBusinessBlock = {
  sphere?: string | null;
  specifics?: string | null;
  role?: string | null;
  experience?: string | null;
  okved?: string | null;
  sharePercent?: string | null;
  revenue?: string | null;
};

export type MatchBusinessProfile = {
  main?: MatchBusinessBlock | null;
  extra1?: MatchBusinessBlock | null;
  extra2?: MatchBusinessBlock | null;
  extra3?: MatchBusinessBlock | null;
};

export type MatchEnrichment = Record<string, string | null | undefined>;

export type PotentialMatchProfile = {
  id: string;
  fullName: string;
  status?: PotentialParticipationStatus;
  position?: string | null;
  city?: string | null;
  businessMain?: string | null;
  businessExtra1?: string | null;
  businessExtra2?: string | null;
  businessExtra3?: string | null;
  businessProfile?: MatchBusinessProfile | null;
  enrichment?: MatchEnrichment | null;
};

export type ActiveMatchDossier = {
  company: string | null;
  revenue: string | null;
  industry: string | null;
  position: string | null;
  city: string | null;
  age: number | null;
  interests: string | null;
  canBeUseful: string | null;
  clubGoals: string | null;
  telegram: string | null;
};

export type ActiveRuleEvaluationForMatching = {
  passed: boolean;
  failedKeys: string[];
  missingKeys: string[];
  total: number;
  roleIds?: string[];
};

export type ActiveMatchCandidate = {
  profileId: string;
  displayName: string | null;
  stateCode: string | null;
  readiness: ReadinessState;
  profileUpdatedAt?: string | null;
  syncedAt?: string | null;
  dossier: ActiveMatchDossier;
  formatVisits: Array<{
    formatSlug: string;
    attendedAt: string;
  }>;
  activeEvaluation?: ActiveRuleEvaluationForMatching;
};

export type ProfileMatchEvent = {
  id: string;
  title: string;
  startsAt: string | null;
  formatSlug: string;
};

export type ProfileMatchFormat = {
  slug: string;
  name: string;
  description?: string | null;
  matchingRules?: unknown;
};

export type ProfilePairMatch = {
  pairId: string;
  activeProfileId: string;
  activeDisplayName: string | null;
  potentialId: string;
  potentialName: string;
  potentialStatus: PotentialParticipationStatus;
  readiness: ReadinessState;
  baseScore: number;
  finalScore: number;
  selectionScore: number;
  confidence: number;
  loadPenalty: number;
  rationale: string;
  introTopic: string;
  risks: string[];
  evidenceFields: string[];
  breakdown: Record<MatchingComponentKey, number | null>;
  semanticScore?: number;
  semanticReason?: string;
};

export type EventCompositionMatch = Omit<
  ProfilePairMatch,
  "potentialId" | "potentialName" | "potentialStatus"
> & {
  matchedPotentialId: string;
  matchedPotentialName: string;
  coveredPotentialIds: string[];
  coveredPotentialNames: string[];
  relatedPotentialMatches: RelatedPotentialMatch[];
};

export type ProfileMatch = EventCompositionMatch;

export type RelatedPotentialMatch = {
  pairId: string;
  potentialId: string;
  potentialName: string;
  potentialStatus: PotentialParticipationStatus;
  finalScore: number;
  semanticScore?: number;
  semanticReason?: string;
  confidence: number;
  readiness: ReadinessState;
  evidenceFields: string[];
  risks: string[];
  rationale: string;
  introTopic: string;
};

export type ProfileMatchResult = {
  matches: ProfileMatch[];
  pairs: ProfilePairMatch[];
  excluded: Array<{
    profileId: string;
    reason:
      | "inactive"
      | "active_rules_failed"
      | "not_ready_for_format"
      | "recent_format_visit"
      | "recent_pau_cooldown"
      | "empty_profile";
  }>;
  excludedPotentials: Array<{
    potentialId: string;
    reason: "not_confirmed" | "non_participating_status";
    status: PotentialParticipationStatus;
  }>;
  settings: MatchingSettings;
  coverage: {
    targetPotentialIds: string[];
    coveredPotentialIds: string[];
    uncoveredPotentialIds: string[];
    selectedCount: number;
    targetCount: number;
    bufferCount: number;
  };
  audit: {
    selector: "deterministic_greedy_event_composition";
    readinessPolicy: MatchingSettings["readinessPolicy"];
    semanticMode: MatchingSettings["semanticPolicy"]["mode"];
    semanticStatus: "not_requested" | "shadow" | "capped";
    readinessDistribution: Record<ReadinessState, number>;
    pairCount: number;
    selectionLimit: number;
    notes: string[];
  };
};

export type ProfileMatchInput = {
  event: ProfileMatchEvent;
  format: ProfileMatchFormat;
  potentials: PotentialMatchProfile[];
  candidates: ActiveMatchCandidate[];
  limit?: number;
};

type ComponentScore = {
  key: MatchingComponentKey;
  weight: number;
  score: number | null;
};

type EligiblePotential = {
  profile: PotentialMatchProfile;
  status: PotentialParticipationStatus;
  confidenceMultiplier: number;
  risks: string[];
};

const STOP_WORDS = new Set([
  "для",
  "или",
  "это",
  "как",
  "что",
  "при",
  "над",
  "под",
  "без",
  "уже",
  "the",
  "and",
  "with",
]);

const SEMANTIC_EVIDENCE_COMPONENTS: ReadonlySet<string> = new Set([
  "business_domain",
  "business_role",
  "request_fit",
  "scale",
  "personal_context",
]);

export function matchProfiles(input: ProfileMatchInput): ProfileMatchResult {
  const settings = parseMatchingSettings(input.format.matchingRules);
  const eventDate = parseDate(input.event.startsAt) ?? new Date();
  const recentVisitWindow = getRecentVisitExclusionWindow(
    settings.recentVisitExclusion,
    eventDate
  );
  const selectionLimit = Math.max(
    0,
    input.limit ?? settings.activeInvitePlan.totalCount
  );
  const excluded: ProfileMatchResult["excluded"] = [];
  const excludedPotentials: ProfileMatchResult["excludedPotentials"] = [];
  const eligiblePotentials = input.potentials.flatMap((potential) => {
    const eligibility = getPotentialEligibility(potential, settings);
    if (!eligibility.included) {
      excludedPotentials.push({
        potentialId: potential.id,
        reason: eligibility.reason,
        status: eligibility.status,
      });
      return [];
    }
    return [
      {
        profile: potential,
        status: eligibility.status,
        confidenceMultiplier: eligibility.confidenceMultiplier,
        risks: eligibility.risks,
      },
    ];
  });
  const eligibleCandidates = input.candidates.flatMap((candidate) => {
    const cooldown = getCooldownSignal({
      candidate,
      eventDate,
      settings,
    });
    const reason = getExclusionReason({
      candidate,
      recentVisitWindow,
      cooldown,
    });
    if (reason) {
      excluded.push({ profileId: candidate.profileId, reason });
      return [];
    }
    return [
      {
        candidate,
        loadPenalty: cooldown.mode === "penalty" ? cooldown.penalty : 0,
        cooldownRisks: cooldown.risks,
      },
    ];
  });
  const pairs = eligibleCandidates
    .flatMap((candidate) =>
      eligiblePotentials.map((potential) =>
        scoreCandidateForPotential({
          candidate: candidate.candidate,
          potential,
          settings,
          loadPenalty: candidate.loadPenalty,
          cooldownRisks: candidate.cooldownRisks,
        })
      )
    )
    .sort(comparePairOrder);
  const targetPotentialIds = eligiblePotentials.map(
    (potential) => potential.profile.id
  );
  const matches = selectEventComposition({
    pairs,
    targetPotentialIds,
    settings,
    limit: selectionLimit,
  });
  const matchesWithRelatedPotentials = attachRelatedPotentialMatches({
    matches,
    pairs,
    targetPotentialIds,
    settings,
  });

  return buildResult({
    matches: matchesWithRelatedPotentials,
    pairs,
    excluded,
    excludedPotentials,
    settings,
    selectionLimit,
    candidates: input.candidates,
    targetPotentialIds,
    notes: ["active_decision_history_cooldown_not_queryable_yet"],
  });
}

export function finalizeProfileMatchResult(
  result: ProfileMatchResult,
  limit: number
): ProfileMatchResult {
  const matches = result.matches.slice(0, Math.max(0, limit));

  return {
    ...result,
    matches,
    coverage: buildCoverage({
      matches,
      targetPotentialIds: result.coverage.targetPotentialIds,
      settings: result.settings,
    }),
  };
}

export function applySemanticRerank(
  base: ProfileMatchResult,
  semantic: SemanticRerankResult
): ProfileMatchResult {
  const semanticByPairId = new Map(
    semantic.matches.map((match) => [match.pairId, match])
  );
  const pairs = base.pairs.map((pair) => {
    const semanticMatch = semanticByPairId.get(pair.pairId);
    if (
      !semanticMatch ||
      semanticMatch.activeProfileId !== pair.activeProfileId ||
      semanticMatch.potentialId !== pair.potentialId
    ) {
      return pair;
    }
    if (!hasSemanticEvidence(pair)) {
      return pair;
    }
    const semanticScore = clamp(semanticMatch.semanticScore, 0, 1);
    if (base.settings.semanticPolicy.mode === "shadow") {
      return {
        ...pair,
        semanticScore,
        semanticReason: semanticMatch.reason,
        risks: pair.risks,
        evidenceFields: pair.evidenceFields,
      };
    }

    const finalScore = roundScore(pair.finalScore * 0.4 + semanticScore * 0.6);
    return {
      ...pair,
      finalScore,
      selectionScore: finalScore,
      semanticScore,
      semanticReason: semanticMatch.reason,
      rationale: pair.rationale,
      introTopic: pair.introTopic,
      risks: pair.risks,
      evidenceFields: pair.evidenceFields,
    };
  });
  const sortedPairs = [...pairs].sort(comparePairOrder);
  const byPairId = new Map(sortedPairs.map((pair) => [pair.pairId, pair]));
  const currentMatches = base.matches.map((match) => {
    const pair = byPairId.get(match.pairId);
    return pair ? toCompositionMatch(pair) : match;
  });
  const evaluatedPairs = sortedPairs.filter(
    (pair) => typeof pair.semanticScore === "number"
  );
  const proposedPairs =
    evaluatedPairs.length > 0
      ? [
          ...evaluatedPairs,
          ...sortedPairs.filter((pair) => typeof pair.semanticScore !== "number"),
        ]
      : sortedPairs;
  const rawMatches =
    base.settings.semanticPolicy.mode === "shadow"
      ? currentMatches
      : capCompositionMovement({
          currentMatches,
          proposedMatches: selectEventComposition({
            pairs: proposedPairs,
            targetPotentialIds: base.coverage.targetPotentialIds,
            settings: base.settings,
            limit: base.audit.selectionLimit,
          }),
          maxMovement: base.settings.semanticPolicy.maxMovement,
        });
  const matches = attachRelatedPotentialMatches({
    matches: rawMatches,
    pairs: sortedPairs,
    targetPotentialIds: base.coverage.targetPotentialIds,
    settings: base.settings,
  });

  return {
    ...base,
    pairs: sortedPairs,
    matches,
    coverage: buildCoverage({
      matches,
      targetPotentialIds: base.coverage.targetPotentialIds,
      settings: base.settings,
    }),
    audit: {
      ...base.audit,
      semanticStatus: base.settings.semanticPolicy.mode,
      semanticMode: base.settings.semanticPolicy.mode,
    },
  };
}

function buildResult(input: {
  matches: ProfileMatch[];
  pairs: ProfilePairMatch[];
  excluded: ProfileMatchResult["excluded"];
  excludedPotentials: ProfileMatchResult["excludedPotentials"];
  settings: MatchingSettings;
  selectionLimit: number;
  candidates: ActiveMatchCandidate[];
  targetPotentialIds: string[];
  notes: string[];
}): ProfileMatchResult {
  const coverage = buildCoverage({
    matches: input.matches,
    targetPotentialIds: input.targetPotentialIds,
    settings: input.settings,
  });

  return {
    matches: input.matches,
    pairs: input.pairs,
    excluded: input.excluded,
    excludedPotentials: input.excludedPotentials,
    settings: input.settings,
    coverage,
    audit: {
      selector: "deterministic_greedy_event_composition",
      readinessPolicy: input.settings.readinessPolicy,
      semanticMode: input.settings.semanticPolicy.mode,
      semanticStatus: "not_requested",
      readinessDistribution: readinessDistribution(input.candidates),
      pairCount: input.pairs.length,
      selectionLimit: input.selectionLimit,
      notes: input.notes,
    },
  };
}

function selectEventComposition(input: {
  pairs: ProfilePairMatch[];
  targetPotentialIds: string[];
  settings: MatchingSettings;
  limit: number;
}) {
  if (input.limit <= 0 || input.pairs.length === 0) {
    return [];
  }

  const matches: ProfileMatch[] = [];
  const selectedActiveIds = new Set<string>();
  const selectedPerPotential = new Map<string, number>();
  const targetPotentialIds = input.targetPotentialIds;
  const maxPerPotential =
    targetPotentialIds.length <= 1
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.ceil(input.limit / targetPotentialIds.length));

  const canSelect = (pair: ProfilePairMatch) =>
    !selectedActiveIds.has(pair.activeProfileId) &&
    (selectedPerPotential.get(pair.potentialId) ?? 0) < maxPerPotential;
  const addPair = (pair: ProfilePairMatch) => {
    selectedActiveIds.add(pair.activeProfileId);
    selectedPerPotential.set(
      pair.potentialId,
      (selectedPerPotential.get(pair.potentialId) ?? 0) + 1
    );
    matches.push(toCompositionMatch(pair));
  };

  while (matches.length < input.limit) {
    const uncovered = targetPotentialIds
      .filter((potentialId) => (selectedPerPotential.get(potentialId) ?? 0) === 0)
      .filter((potentialId) =>
        input.pairs.some((pair) => pair.potentialId === potentialId && canSelect(pair))
      )
      .sort((left, right) => {
        const leftOptions = input.pairs.filter(
          (pair) => pair.potentialId === left && canSelect(pair)
        ).length;
        const rightOptions = input.pairs.filter(
          (pair) => pair.potentialId === right && canSelect(pair)
        ).length;
        return leftOptions - rightOptions || left.localeCompare(right);
      });
    if (uncovered.length === 0) {
      break;
    }
    const pair = input.pairs.find(
      (candidate) => candidate.potentialId === uncovered[0] && canSelect(candidate)
    );
    if (!pair) {
      break;
    }
    addPair(pair);
  }

  for (const pair of input.pairs) {
    if (matches.length >= input.limit) {
      break;
    }
    if (canSelect(pair)) {
      addPair(pair);
    }
  }

  return matches;
}

function capCompositionMovement(input: {
  currentMatches: ProfileMatch[];
  proposedMatches: ProfileMatch[];
  maxMovement: number;
}) {
  if (input.maxMovement <= 0) {
    return input.currentMatches;
  }

  const currentIndexByActiveId = new Map(
    input.currentMatches.map((match, index) => [match.activeProfileId, index])
  );
  const usedActiveIds = new Set<string>();
  const capped: ProfileMatch[] = [];

  for (let index = 0; index < input.currentMatches.length; index += 1) {
    const proposed = input.proposedMatches.find((match) => {
      if (usedActiveIds.has(match.activeProfileId)) {
        return false;
      }
      const currentIndex = currentIndexByActiveId.get(match.activeProfileId);
      return (
        currentIndex !== undefined &&
        Math.abs(currentIndex - index) <= input.maxMovement
      );
    });

    if (proposed) {
      capped.push(proposed);
      usedActiveIds.add(proposed.activeProfileId);
      continue;
    }

    const fallback = input.currentMatches.find(
      (match) => !usedActiveIds.has(match.activeProfileId)
    );
    if (!fallback) {
      break;
    }
    capped.push(fallback);
    usedActiveIds.add(fallback.activeProfileId);
  }

  return capped;
}

function buildCoverage(input: {
  matches: ProfileMatch[];
  targetPotentialIds: string[];
  settings: MatchingSettings;
}) {
  const targetPotentialIds = [...new Set(input.targetPotentialIds)];
  const coveredPotentialIds = [
    ...new Set(input.matches.flatMap((match) => match.coveredPotentialIds)),
  ];
  const uncoveredPotentialIds = targetPotentialIds.filter(
    (potentialId) => !coveredPotentialIds.includes(potentialId)
  );

  return {
    targetPotentialIds,
    coveredPotentialIds,
    uncoveredPotentialIds,
    selectedCount: input.matches.length,
    targetCount: input.settings.activeInvitePlan.targetCount,
    bufferCount: input.settings.activeInvitePlan.bufferCount,
  };
}

function toCompositionMatch(pair: ProfilePairMatch): ProfileMatch {
  const { potentialId, potentialName, ...rest } = pair;

  return {
    ...rest,
    matchedPotentialId: potentialId,
    matchedPotentialName: potentialName,
    coveredPotentialIds: [potentialId],
    coveredPotentialNames: [potentialName],
    relatedPotentialMatches: [toRelatedPotentialMatch(pair)],
  };
}

function attachRelatedPotentialMatches(input: {
  matches: ProfileMatch[];
  pairs: ProfilePairMatch[];
  targetPotentialIds: string[];
  settings: MatchingSettings;
}): ProfileMatch[] {
  const targetPotentialIds = new Set(input.targetPotentialIds);

  return input.matches.map((match) => {
    const related = input.pairs
      .filter(
        (pair) =>
          pair.activeProfileId === match.activeProfileId &&
          targetPotentialIds.has(pair.potentialId) &&
          (pair.pairId === match.pairId || isRelatedPotentialFit(pair))
      )
      .sort(comparePairOrder)
      .slice(0, Math.max(1, input.targetPotentialIds.length))
      .map(toRelatedPotentialMatch);
    const coveredPotentialIds = [
      ...new Set(related.map((relatedMatch) => relatedMatch.potentialId)),
    ];
    const coveredPotentialNames = [
      ...new Set(related.map((relatedMatch) => relatedMatch.potentialName)),
    ];

    return {
      ...match,
      coveredPotentialIds,
      coveredPotentialNames,
      relatedPotentialMatches: related,
    };
  });
}

function isRelatedPotentialFit(pair: ProfilePairMatch) {
  return (
    pair.finalScore >= 0.45 ||
    (typeof pair.semanticScore === "number" && pair.semanticScore >= 0.55)
  );
}

function hasSemanticEvidence(pair: ProfilePairMatch) {
  return pair.evidenceFields.some((field) =>
    SEMANTIC_EVIDENCE_COMPONENTS.has(field)
  );
}

function toRelatedPotentialMatch(pair: ProfilePairMatch): RelatedPotentialMatch {
  return {
    pairId: pair.pairId,
    potentialId: pair.potentialId,
    potentialName: pair.potentialName,
    potentialStatus: pair.potentialStatus,
    finalScore: pair.finalScore,
    semanticScore: pair.semanticScore,
    semanticReason: pair.semanticReason,
    confidence: pair.confidence,
    readiness: pair.readiness,
    evidenceFields: pair.evidenceFields,
    risks: pair.risks,
    rationale: pair.rationale,
    introTopic: pair.introTopic,
  };
}

function getPotentialEligibility(
  potential: PotentialMatchProfile,
  settings: MatchingSettings
):
  | {
      included: true;
      status: PotentialParticipationStatus;
      confidenceMultiplier: number;
      risks: string[];
    }
  | {
      included: false;
      status: PotentialParticipationStatus;
      reason: "not_confirmed" | "non_participating_status";
    } {
  const status = potential.status ?? "CONFIRMED";
  if (status === "CONFIRMED" || status === "ATTENDED") {
    return {
      included: true,
      status,
      confidenceMultiplier: 1,
      risks: [],
    };
  }
  if (status === "INVITED") {
    if (!settings.potentialStatusPolicy.includeInvited) {
      return { included: false, status, reason: "not_confirmed" };
    }
    return {
      included: true,
      status,
      confidenceMultiplier: 0.72,
      risks: [`Гость еще не подтвержден: ${status}`],
    };
  }
  if (status === "UNKNOWN") {
    if (!settings.potentialStatusPolicy.includeUnknown) {
      return { included: false, status, reason: "not_confirmed" };
    }
    return {
      included: true,
      status,
      confidenceMultiplier: 0.55,
      risks: [`Статус гостя не подтвержден: ${status}`],
    };
  }

  return { included: false, status, reason: "non_participating_status" };
}

function getExclusionReason({
  candidate,
  recentVisitWindow,
  cooldown,
}: {
  candidate: ActiveMatchCandidate;
  recentVisitWindow: { from: Date; to: Date } | null;
  cooldown: CooldownSignal;
}): ProfileMatchResult["excluded"][number]["reason"] | null {
  if (candidate.stateCode !== "active") {
    return "inactive";
  }
  if (
    candidate.activeEvaluation &&
    candidate.activeEvaluation.total > 0 &&
    !candidate.activeEvaluation.passed
  ) {
    return "active_rules_failed";
  }
  if (candidate.readiness === "NOT_READY") {
    return "not_ready_for_format";
  }
  if (isEmptyDossier(candidate.dossier)) {
    return "empty_profile";
  }
  if (
    recentVisitWindow &&
    candidate.formatVisits.some((visit) => {
      const attendedAt = parseDate(visit.attendedAt);
      return (
        attendedAt !== null &&
        attendedAt >= recentVisitWindow.from &&
        attendedAt < recentVisitWindow.to
      );
    })
  ) {
    return "recent_format_visit";
  }
  if (cooldown.mode === "exclude") {
    return "recent_pau_cooldown";
  }

  return null;
}

type CooldownSignal = {
  mode: "none" | "penalty" | "exclude";
  penalty: number;
  risks: string[];
};

function getCooldownSignal({
  candidate,
  eventDate,
  settings,
}: {
  candidate: ActiveMatchCandidate;
  eventDate: Date;
  settings: MatchingSettings;
}): CooldownSignal {
  if (!settings.crossFormatCooldown.enabled) {
    return { mode: "none", penalty: 0, risks: [] };
  }
  const from = new Date(eventDate);
  from.setUTCDate(from.getUTCDate() - settings.crossFormatCooldown.days);
  const hasRecentPauVisit = candidate.formatVisits.some((visit) => {
    const attendedAt = parseDate(visit.attendedAt);
    return attendedAt !== null && attendedAt >= from && attendedAt < eventDate;
  });
  if (!hasRecentPauVisit) {
    return { mode: "none", penalty: 0, risks: [] };
  }
  if (settings.crossFormatCooldown.mode === "exclude") {
    return {
      mode: "exclude",
      penalty: 1,
      risks: ["Недавнее участие в другом формате ПАУ"],
    };
  }

  return {
    mode: "penalty",
    penalty: settings.crossFormatCooldown.penalty,
    risks: ["Недавнее участие в другом формате ПАУ снижает приоритет"],
  };
}

function scoreCandidateForPotential({
  candidate,
  potential,
  settings,
  loadPenalty,
  cooldownRisks,
}: {
  candidate: ActiveMatchCandidate;
  potential: EligiblePotential;
  settings: MatchingSettings;
  loadPenalty: number;
  cooldownRisks: string[];
}): ProfilePairMatch {
  const components: ComponentScore[] = [
    {
      key: "business_domain",
      weight: settings.formatStrategy.weights.business_domain,
      score: textSimilarity(
        potentialDomainTexts(potential.profile),
        activeDomainTexts(candidate)
      ),
    },
    {
      key: "business_role",
      weight: settings.formatStrategy.weights.business_role,
      score: roleSimilarity(potentialRoleTexts(potential.profile), [
        candidate.dossier.position,
      ]),
    },
    {
      key: "request_fit",
      weight: settings.formatStrategy.weights.request_fit,
      score: textSimilarity(
        potentialRequestTexts(potential.profile),
        activeUsefulnessTexts(candidate)
      ),
    },
    {
      key: "scale",
      weight: settings.formatStrategy.weights.scale,
      score: scaleSimilarity(
        potentialRevenue(potential.profile),
        candidate.dossier.revenue
      ),
    },
    {
      key: "personal_context",
      weight: settings.formatStrategy.weights.personal_context,
      score: textSimilarity(
        [potential.profile.city, potential.profile.enrichment?.hobbies],
        [candidate.dossier.city, candidate.dossier.interests]
      ),
    },
    {
      key: "readiness_history",
      weight: settings.formatStrategy.weights.readiness_history,
      score: candidate.readiness === "READY" ? 1 : 0.45,
    },
  ];
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const availableWeight = components.reduce(
    (sum, component) => sum + (component.score === null ? 0 : component.weight),
    0
  );
  const weighted = components.reduce(
    (sum, component) =>
      sum + component.weight * (component.score === null ? 0.25 : component.score),
    0
  );
  const baseScore = roundScore(weighted / totalWeight);
  const finalScore = roundScore(baseScore - loadPenalty);
  const readinessConfidence = candidate.readiness === "READY" ? 1 : 0.72;
  const activeRuleConfidence =
    candidate.activeEvaluation && candidate.activeEvaluation.missingKeys.length > 0
      ? 0.86
      : 1;
  const confidence = roundScore(
    (availableWeight / totalWeight) *
      readinessConfidence *
      activeRuleConfidence *
      potential.confidenceMultiplier
  );
  const breakdown = Object.fromEntries(
    components.map((component) => [component.key, component.score])
  ) as Record<MatchingComponentKey, number | null>;
  const evidenceFields = components
    .filter((component) => component.score !== null && component.score > 0.25)
    .map((component) => component.key);
  const missingDataRisks = components
    .filter((component) => component.score === null)
    .map((component) => `Недостаточно данных: ${component.key}`);
  const readinessRisks =
    candidate.readiness === "UNMARKED" && settings.readinessPolicy.mode === "soft"
      ? ["Готовность к формату не размечена"]
      : [];
  const activeRuleRisks =
    candidate.activeEvaluation && candidate.activeEvaluation.missingKeys.length > 0
      ? [
          `Не хватает optional active-rule фактов: ${candidate.activeEvaluation.missingKeys.join(", ")}`,
        ]
      : [];

  return {
    pairId: `${candidate.profileId}::${potential.profile.id}`,
    activeProfileId: candidate.profileId,
    activeDisplayName: candidate.displayName,
    potentialId: potential.profile.id,
    potentialName: potential.profile.fullName,
    potentialStatus: potential.status,
    readiness: candidate.readiness,
    baseScore,
    finalScore,
    selectionScore: finalScore,
    confidence,
    loadPenalty,
    rationale: buildRationale({
      candidate,
      potential: potential.profile,
      evidenceFields,
    }),
    introTopic: buildIntroTopic(candidate, potential.profile),
    risks: mergeUnique([
      ...missingDataRisks,
      ...potential.risks,
      ...cooldownRisks,
      ...readinessRisks,
      ...activeRuleRisks,
    ], []),
    evidenceFields,
    breakdown,
  };
}

function comparePairOrder(left: ProfilePairMatch, right: ProfilePairMatch) {
  return (
    right.selectionScore - left.selectionScore ||
    right.confidence - left.confidence ||
    readinessRank(right.readiness) - readinessRank(left.readiness) ||
    left.activeProfileId.localeCompare(right.activeProfileId) ||
    left.potentialId.localeCompare(right.potentialId)
  );
}

function readinessRank(readiness: ReadinessState) {
  if (readiness === "READY") {
    return 2;
  }
  if (readiness === "UNMARKED") {
    return 1;
  }
  return 0;
}

function readinessDistribution(candidates: ActiveMatchCandidate[]) {
  return candidates.reduce<Record<ReadinessState, number>>(
    (counts, candidate) => {
      counts[candidate.readiness] += 1;
      return counts;
    },
    { READY: 0, NOT_READY: 0, UNMARKED: 0 }
  );
}

function potentialDomainTexts(
  potential: PotentialMatchProfile
): Array<string | null | undefined> {
  return [
    potential.businessProfile?.main?.sphere,
    potential.businessProfile?.main?.specifics,
    potential.businessProfile?.main?.okved,
    potential.businessMain,
    potential.businessExtra1,
  ];
}

function activeDomainTexts(
  candidate: ActiveMatchCandidate
): Array<string | null | undefined> {
  return [
    candidate.dossier.industry,
    candidate.dossier.company,
    candidate.dossier.canBeUseful,
  ];
}

function potentialRoleTexts(
  potential: PotentialMatchProfile
): Array<string | null | undefined> {
  return [potential.businessProfile?.main?.role, potential.position];
}

function potentialRequestTexts(
  potential: PotentialMatchProfile
): Array<string | null | undefined> {
  return [
    potential.enrichment?.clubGoals,
    potential.enrichment?.additionalInfo,
    potential.enrichment?.usefulForClub,
    potential.enrichment?.keyProjects,
  ];
}

function activeUsefulnessTexts(
  candidate: ActiveMatchCandidate
): Array<string | null | undefined> {
  return [
    candidate.dossier.canBeUseful,
    candidate.dossier.clubGoals,
    candidate.dossier.interests,
  ];
}

function potentialRevenue(potential: PotentialMatchProfile): string | null {
  return potential.businessProfile?.main?.revenue ?? null;
}

function textSimilarity(
  leftTexts: Array<string | null | undefined>,
  rightTexts: Array<string | null | undefined>
): number | null {
  const left = tokens(leftTexts);
  const right = tokens(rightTexts);
  if (left.length === 0 || right.length === 0) {
    return null;
  }

  let matches = 0;
  for (const token of left) {
    if (right.some((candidate) => isTokenMatch(token, candidate))) {
      matches += 1;
    }
  }

  return clamp(matches / Math.min(left.length, right.length), 0, 1);
}

function roleSimilarity(
  leftTexts: Array<string | null | undefined>,
  rightTexts: Array<string | null | undefined>
): number | null {
  const leftRole = classifyRole(leftTexts);
  const rightRole = classifyRole(rightTexts);
  if (!leftRole || !rightRole) {
    return null;
  }
  if (leftRole === rightRole) {
    return 1;
  }
  if (
    (leftRole === "owner" || leftRole === "ceo") &&
    (rightRole === "owner" || rightRole === "ceo")
  ) {
    return 0.75;
  }
  return 0.25;
}

function scaleSimilarity(leftRevenue: string | null, rightRevenue: string | null) {
  const left = parseRevenue(leftRevenue);
  const right = parseRevenue(rightRevenue);
  if (!left || !right) {
    return null;
  }
  return clamp(Math.min(left, right) / Math.max(left, right), 0, 1);
}

function classifyRole(texts: Array<string | null | undefined>) {
  const text = compactTexts(texts).join(" ").toLowerCase();
  if (!text) {
    return null;
  }
  if (/(владел|собствен|совладел|основател|founder|партнер)/.test(text)) {
    return "owner";
  }
  if (/(генераль|ceo|директор|управляющ)/.test(text)) {
    return "ceo";
  }
  if (/(коммерч|продаж|cmo|cfo|финансов)/.test(text)) {
    return "executive";
  }
  return "other";
}

function buildRationale({
  candidate,
  potential,
  evidenceFields,
}: {
  candidate: ActiveMatchCandidate;
  potential: PotentialMatchProfile;
  evidenceFields: string[];
}) {
  const parts = [
    evidenceFields.includes("business_domain") ? "близкий бизнес-контекст" : null,
    evidenceFields.includes("business_role") ? "похожая роль в бизнесе" : null,
    evidenceFields.includes("request_fit")
      ? "есть пересечение запроса и полезности"
      : null,
  ].filter(Boolean);
  const activeName = candidate.displayName ?? "Активный участник";
  return `${activeName} ↔ ${potential.fullName}: ${
    parts.join(", ") || "есть частичное совпадение по профилю"
  }.`;
}

function buildIntroTopic(
  candidate: ActiveMatchCandidate,
  potential: PotentialMatchProfile
) {
  const request = compactTexts(potentialRequestTexts(potential))[0];
  const usefulness = compactTexts(activeUsefulnessTexts(candidate))[0];
  if (request && usefulness) {
    return `Связать запрос гостя: ${shorten(request)} с опытом активного: ${shorten(usefulness)}`;
  }
  return "Проверить общий бизнес-контекст и возможную пользу для гостя";
}

function tokens(texts: Array<string | null | undefined>) {
  return [
    ...new Set(
      compactTexts(texts)
        .join(" ")
        .toLowerCase()
        .replace(/ё/g, "е")
        .split(/[^a-zа-я0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    ),
  ];
}

function isTokenMatch(left: string, right: string) {
  return (
    left === right ||
    (left.length >= 5 && right.startsWith(left.slice(0, 5))) ||
    (right.length >= 5 && left.startsWith(right.slice(0, 5)))
  );
}

function compactTexts(texts: Array<string | null | undefined>) {
  return texts
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter(Boolean);
}

function parseRevenue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const multiplier = /млрд|billion/i.test(value)
    ? 1_000_000_000
    : /млн|million/i.test(value)
      ? 1_000_000
      : 1;
  const normalized = value
    .replace(/\s+/g, "")
    .replace(",", ".")
    .match(/\d+(?:\.\d+)?/);
  if (!normalized) {
    return null;
  }
  const revenue = Number(normalized[0]) * multiplier;
  return Number.isFinite(revenue) && revenue > 0 ? revenue : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isEmptyDossier(dossier: ActiveMatchDossier) {
  return compactTexts([
    dossier.company,
    dossier.industry,
    dossier.position,
    dossier.interests,
    dossier.canBeUseful,
    dossier.clubGoals,
  ]).length === 0;
}

function mergeUnique(left: string[], right: string[]) {
  return [...new Set([...left, ...right].filter(Boolean))];
}

function shorten(value: string) {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function roundScore(value: number) {
  return Math.round(clamp(value, 0, 1) * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
