import { readFileSync } from "node:fs";

import { buildSourceFreshnessSummary } from "@/lib/matching/match-run-audit";
import { buildMatchingRunPlan } from "@/lib/matching/matching-settings";
import {
  finalizeProfileMatchResult,
  matchProfiles,
  type ActiveMatchCandidate,
  type MatchBusinessProfile,
  type MatchEnrichment,
  type PotentialMatchProfile,
} from "@/lib/matching/profile-matching";

type Snapshot = {
  clubId: string;
  clubs: Array<{ id: string; name: string }>;
  readiness: Array<{ profileId: string; readiness: string }>;
  members: Array<{
    profileId: string;
    displayName: string | null;
    stateCode: string | null;
    profileUpdatedAt?: string | null;
    syncedAt?: string | null;
    dossier: unknown;
    formatVisits: Array<{
      formatSlug: string;
      attendedAt: string;
    }>;
  }>;
  events: Array<{
    id: string;
    title: string;
    startsAt: string | null;
    formatSlug: string;
    format: {
      slug: string;
      name: string;
      description?: string | null;
      matchingRules?: unknown;
    };
    participants: Array<Record<string, unknown>>;
  }>;
};

const snapshotPath = process.argv[2] ?? "/tmp/pau_latest_guest_matching_data.json";
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
const readiness = new Map(
  snapshot.readiness.map((row) => [row.profileId, row.readiness])
);

const candidatesBase = snapshot.members.map((member) => ({
  profileId: member.profileId,
  displayName: text(member.displayName),
  stateCode: text(member.stateCode),
  readiness: normalizeReadiness(readiness.get(member.profileId)),
  profileUpdatedAt: text(member.profileUpdatedAt),
  syncedAt: text(member.syncedAt),
  dossier: normalizeDossier(member.dossier),
  formatVisits: member.formatVisits.map((visit) => ({
    formatSlug: visit.formatSlug,
    attendedAt: visit.attendedAt,
  })),
}));

const output = snapshot.events.map((event) => {
  const participants = event.participants ?? [];
  const existingActiveCount = participants.filter(
    (participant) => participant.kind === "ACTIVE"
  ).length;
  const potentials = participants
    .filter((participant) => participant.kind === "POTENTIAL")
    .map(mapPotential);
  const runPlan = buildMatchingRunPlan(event.format.matchingRules);
  const candidateResult = matchProfiles({
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      formatSlug: event.formatSlug,
    },
    format: event.format,
    potentials,
    candidates: candidatesBase,
    limit: runPlan.semanticCandidateLimit,
  });
  const result = finalizeProfileMatchResult(
    candidateResult,
    runPlan.activeParticipantLimit
  );
  const sourceFreshness = buildSourceFreshnessSummary({
    candidates: candidatesBase.map((candidate) => ({
      profileId: candidate.profileId,
      profileUpdatedAt: candidate.profileUpdatedAt ?? null,
      syncedAt: candidate.syncedAt ?? null,
    })),
    settings: runPlan.settings.sourceFreshness,
    now: event.startsAt ? new Date(event.startsAt) : new Date(),
  });
  const operatorDecisions = participants.filter(
    (participant) =>
      participant.kind === "ACTIVE" && text(participant.activeDecision)
  ).length;

  return {
    eventId: event.id,
    event: event.title,
    startsAt: event.startsAt,
    sourceFreshness,
    potentials: {
      included: potentials
        .filter(
          (potential) =>
            !result.excludedPotentials.some(
              (excluded) => excluded.potentialId === potential.id
            )
        )
        .map((potential) => ({
          id: potential.id,
          name: potential.fullName,
          status: potential.status ?? "CONFIRMED",
        })),
      excluded: result.excludedPotentials,
    },
    existingActive: existingActiveCount,
    candidatePool: candidatesBase.length,
    activeInvitePlan: runPlan.settings.activeInvitePlan,
    operatorOverrideRate:
      existingActiveCount > 0 ? operatorDecisions / existingActiveCount : null,
    selection: {
      selectedCount: result.coverage.selectedCount,
      targetCount: result.coverage.targetCount,
      bufferCount: result.coverage.bufferCount,
      coveredPotentialIds: result.coverage.coveredPotentialIds,
      uncoveredPotentialIds: result.coverage.uncoveredPotentialIds,
    },
    readinessDistribution: result.audit.readinessDistribution,
    semantic: {
      status: result.audit.semanticStatus,
      mode: result.audit.semanticMode,
    },
    excluded: countExcluded(result.excluded),
    cooldown: result.pairs
      .filter((pair) => pair.loadPenalty > 0)
      .map((pair) => ({
        activeProfileId: pair.activeProfileId,
        activeName: pair.activeDisplayName,
        potentialId: pair.potentialId,
        loadPenalty: pair.loadPenalty,
        risks: pair.risks.filter((risk) => risk.includes("ПАУ")),
      })),
    scoreBands: bandCounts(result.matches.map((match) => match.finalScore)),
    confidenceBands: bandCounts(result.matches.map((match) => match.confidence)),
    matches: result.matches.map((match, index) => ({
      order: index + 1,
      profileId: match.activeProfileId,
      name: match.activeDisplayName,
      score: match.finalScore,
      confidence: match.confidence,
      readiness: match.readiness,
      potential: match.matchedPotentialName,
      coveredPotentialIds: match.coveredPotentialIds,
      coveredPotentialNames: match.coveredPotentialNames,
      evidence: match.evidenceFields,
      risks: match.risks,
    })),
  };
});

const selectedActiveConcentration = summarizeConcentration(
  output.flatMap((event) =>
    event.matches.map((match) => ({
      profileId: match.profileId,
      name: match.name ?? match.profileId,
    }))
  )
);

console.log(
  JSON.stringify(
    {
      clubId: snapshot.clubId,
      clubs: snapshot.clubs,
      readinessRows: snapshot.readiness.length,
      members: snapshot.members.length,
      eventCount: snapshot.events.length,
      selectedActiveConcentration,
      output,
    },
    null,
    2
  )
);

function mapPotential(
  participant: Record<string, unknown>
): PotentialMatchProfile {
  const businessProfile = asRecord(participant.businessProfile);
  const mainBusiness = asRecord(businessProfile?.main);

  return {
    id: String(participant.id),
    fullName: String(participant.fullName),
    status: normalizePotentialStatus(participant.status),
    position: text(participant.position) ?? text(mainBusiness?.role),
    city: text(participant.city),
    businessMain: text(participant.businessMain),
    businessExtra1: text(participant.businessExtra1),
    businessExtra2: text(participant.businessExtra2),
    businessExtra3: text(participant.businessExtra3),
    businessProfile: businessProfile as MatchBusinessProfile | null,
    enrichment: normalizeEnrichment(participant.enrichment),
  };
}

function normalizePotentialStatus(value: unknown): PotentialMatchProfile["status"] {
  return value === "INVITED" ||
    value === "CONFIRMED" ||
    value === "REFUSED" ||
    value === "ATTENDED" ||
    value === "MISSED" ||
    value === "UNKNOWN"
    ? value
    : "UNKNOWN";
}

function normalizeDossier(value: unknown) {
  const dossier = asRecord(value) ?? {};

  return {
    company: text(dossier.company),
    revenue: text(dossier.revenue),
    industry: text(dossier.industry),
    position: text(dossier.position),
    city: text(dossier.city),
    age: integer(dossier.age),
    interests: text(dossier.interests),
    canBeUseful: text(dossier.canBeUseful),
    clubGoals: text(dossier.clubGoals),
    telegram: text(dossier.telegram),
  };
}

function normalizeReadiness(
  value: unknown
): ActiveMatchCandidate["readiness"] {
  if (value === "READY" || value === "NOT_READY") {
    return value;
  }

  return "UNMARKED";
}

function normalizeEnrichment(value: unknown): MatchEnrichment | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const enrichment = Object.fromEntries(
    Object.entries(record).flatMap(([key, item]) => {
      const stringValue = text(item);
      return stringValue ? [[key, stringValue]] : [];
    })
  );

  return Object.keys(enrichment).length > 0 ? enrichment : null;
}

function countExcluded(
  rows: Array<{ reason: string }>
): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    return counts;
  }, {});
}

function bandCounts(values: number[]) {
  return values.reduce<Record<string, number>>(
    (counts, value) => {
      const key =
        value >= 0.8 ? "0.80-1.00" : value >= 0.6 ? "0.60-0.79" : "0.00-0.59";
      counts[key] += 1;
      return counts;
    },
    {
      "0.80-1.00": 0,
      "0.60-0.79": 0,
      "0.00-0.59": 0,
    }
  );
}

function summarizeConcentration(
  rows: Array<{ profileId: string; name: string }>
) {
  const counts = rows.reduce<Map<string, { name: string; events: number }>>(
    (index, row) => {
      const current = index.get(row.profileId) ?? { name: row.name, events: 0 };
      current.events += 1;
      index.set(row.profileId, current);
      return index;
    },
    new Map()
  );

  return [...counts.entries()]
    .map(([profileId, item]) => ({
      profileId,
      name: item.name,
      events: item.events,
    }))
    .sort((left, right) => right.events - left.events || left.name.localeCompare(right.name));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numberValue = Number(value);
    return Number.isInteger(numberValue) ? numberValue : null;
  }

  return null;
}
