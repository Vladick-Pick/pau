import { createHash } from "node:crypto";

import { z } from "zod";

import type { MatchingSettings } from "./matching-settings";

const semanticStatusSchema = z.enum([
  "applied",
  "failed",
  "skipped_no_key",
  "skipped_empty",
  "shadow",
  "capped",
]);

const sourceFreshnessSummarySchema = z.object({
  enabled: z.boolean(),
  staleAfterDays: z.number().int().positive(),
  staleCount: z.number().int().nonnegative(),
  newestProfileUpdatedAt: z.string().datetime().nullable(),
  oldestProfileUpdatedAt: z.string().datetime().nullable(),
  newestSyncedAt: z.string().datetime().nullable(),
  oldestSyncedAt: z.string().datetime().nullable(),
});

const operatorFeedbackSummarySchema = z.object({
  totalActiveCount: z.number().int().nonnegative(),
  decidedCount: z.number().int().nonnegative(),
  invitedAttendedCount: z.number().int().nonnegative(),
  invitedRefusedCount: z.number().int().nonnegative(),
  declinedByUsCount: z.number().int().nonnegative(),
});

const operatorFeedbackRecordSchema = z.object({
  eventParticipantId: z.string().nullable(),
  matchingProfileId: z.string().nullable(),
  matchedPotentialId: z.string().nullable(),
  pairId: z.string().nullable(),
  activeDecision: z.string().nullable(),
  activeDecisionComment: z.string().nullable(),
  statusUpdatedAt: z.string().datetime().nullable(),
});

export const matchRunAuditSchema = z.object({
  version: z.literal(1),
  status: z.enum(["SUCCESS", "FAILED", "DEGRADED"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  actorRole: z.string().nullable(),
  actorUserName: z.string().nullable(),
  settingsHash: z.string(),
  inputHash: z.string(),
  semanticStatus: semanticStatusSchema,
  semanticModel: z.string().nullable(),
  semanticSkippedPairCount: z.number().int().nonnegative(),
  degradedReason: z.string().nullable(),
  degradedReasons: z.array(z.string()),
  error: z.string().nullable(),
  selectedCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  coveredPotentialCount: z.number().int().nonnegative(),
  uncoveredPotentialCount: z.number().int().nonnegative(),
  excludedReasonCounts: z.record(z.string(), z.number().int().nonnegative()),
  sourceFreshness: sourceFreshnessSummarySchema,
  operatorFeedback: operatorFeedbackSummarySchema,
  operatorFeedbackRecords: z.array(operatorFeedbackRecordSchema),
});

export type MatchRunAudit = z.infer<typeof matchRunAuditSchema>;
export type SemanticAuditStatus = z.infer<typeof semanticStatusSchema>;
export type SourceFreshnessSummary = z.infer<typeof sourceFreshnessSummarySchema>;

export type SourceFreshnessCandidate = {
  profileId: string;
  profileUpdatedAt: string | null;
  syncedAt: string | null;
};

export type MatchRunOperatorFeedback = {
  eventParticipantId?: string | null;
  matchingProfileId?: string | null;
  matchedPotentialId?: string | null;
  pairId?: string | null;
  activeDecision: string | null;
  activeDecisionComment?: string | null;
  statusUpdatedAt?: string | null;
};

export type BuildMatchRunAuditInput = {
  startedAt: Date;
  finishedAt: Date;
  settings: MatchingSettings;
  matcherInput: unknown;
  semanticStatus: SemanticAuditStatus;
  semanticModel?: string | null;
  semanticError?: string | null;
  semanticSkippedPairCount?: number;
  candidates: SourceFreshnessCandidate[];
  potentialIds: string[];
  selectedPotentialIds: string[];
  selectedCount: number;
  excludedReasons: Array<{ reason: string }>;
  actorRole?: string | null;
  actorUserName?: string | null;
  operatorFeedback: MatchRunOperatorFeedback[];
  error?: string | null;
};

export type MatchRunLike = {
  activeParticipantCount: number;
  responsePayload: unknown;
  createdAt: Date;
};

export type LatestMatchSummary = {
  activeParticipantCount: number;
  rationale: string | null;
  createdAt: string;
  status: MatchRunAudit["status"];
  semanticStatus: SemanticAuditStatus | null;
  semanticModel: string | null;
  degradedReason: string | null;
  sourceFreshness: SourceFreshnessSummary | null;
  counts: {
    selected: number;
    excluded: number;
    coveredPotentials: number;
    uncoveredPotentials: number;
  };
};

export function buildSourceFreshnessSummary(input: {
  candidates: SourceFreshnessCandidate[];
  settings: MatchingSettings["sourceFreshness"];
  now?: Date;
}): SourceFreshnessSummary {
  const timestamps = input.candidates.map((candidate) =>
    parseIsoDate(candidate.profileUpdatedAt)
  );
  const syncTimestamps = input.candidates.map((candidate) =>
    parseIsoDate(candidate.syncedAt)
  );
  const now = input.now ?? new Date();
  const staleThresholdMs = input.settings.staleAfterDays * 24 * 60 * 60 * 1000;
  const staleCount = input.settings.enabled
    ? input.candidates.filter((candidate) =>
        isCandidateStale(candidate, staleThresholdMs, now)
      ).length
    : 0;

  return {
    enabled: input.settings.enabled,
    staleAfterDays: input.settings.staleAfterDays,
    staleCount,
    newestProfileUpdatedAt: newestIso(timestamps),
    oldestProfileUpdatedAt: oldestIso(timestamps),
    newestSyncedAt: newestIso(syncTimestamps),
    oldestSyncedAt: oldestIso(syncTimestamps),
  };
}

export function buildMatchRunAudit(
  input: BuildMatchRunAuditInput
): MatchRunAudit {
  const sourceFreshness = buildSourceFreshnessSummary({
    candidates: input.candidates,
    settings: input.settings.sourceFreshness,
    now: input.finishedAt,
  });
  const degradedReasons = [
    ...(sourceFreshness.enabled && sourceFreshness.staleCount > 0
      ? ["stale_source_data"]
      : []),
    ...(input.semanticStatus === "failed" ? ["semantic_rerank_failed"] : []),
  ];
  const status =
    input.error
      ? "FAILED"
      : degradedReasons.length > 0
        ? "DEGRADED"
        : "SUCCESS";
  const excludedReasonCounts = input.excludedReasons.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const coveredPotentialCount = new Set(
    input.selectedPotentialIds.filter((id) => input.potentialIds.includes(id))
  ).size;
  const operatorFeedback = summarizeOperatorFeedback(input.operatorFeedback);

  return matchRunAuditSchema.parse({
    version: 1,
    status,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    actorRole: input.actorRole ?? null,
    actorUserName: input.actorUserName ?? null,
    settingsHash: hashValue(input.settings),
    inputHash: hashValue(input.matcherInput),
    semanticStatus: input.semanticStatus,
    semanticModel: input.semanticModel ?? null,
    semanticSkippedPairCount: input.semanticSkippedPairCount ?? 0,
    degradedReason:
      input.error ?? input.semanticError ?? degradedReasons[0] ?? null,
    degradedReasons,
    error: input.error ?? input.semanticError ?? null,
    selectedCount: input.selectedCount,
    excludedCount: input.excludedReasons.length,
    coveredPotentialCount,
    uncoveredPotentialCount: Math.max(
      input.potentialIds.length - coveredPotentialCount,
      0
    ),
    excludedReasonCounts,
    sourceFreshness,
    operatorFeedback,
    operatorFeedbackRecords: input.operatorFeedback.map((item) => ({
      eventParticipantId: item.eventParticipantId ?? null,
      matchingProfileId: item.matchingProfileId ?? null,
      matchedPotentialId: item.matchedPotentialId ?? null,
      pairId: item.pairId ?? null,
      activeDecision: item.activeDecision,
      activeDecisionComment: item.activeDecisionComment ?? null,
      statusUpdatedAt: item.statusUpdatedAt ?? null,
    })),
  });
}

export function extractMatchRunAudit(payload: unknown): MatchRunAudit | null {
  if (!isRecord(payload) || !isRecord(payload.audit)) {
    return null;
  }

  const parsed = matchRunAuditSchema.safeParse(payload.audit);
  return parsed.success ? parsed.data : null;
}

export function summarizeLatestMatch(match: MatchRunLike): LatestMatchSummary {
  const payload = isRecord(match.responsePayload) ? match.responsePayload : null;
  const audit = extractMatchRunAudit(payload);

  return {
    activeParticipantCount:
      audit?.selectedCount ?? match.activeParticipantCount,
    rationale: typeof payload?.rationale === "string" ? payload.rationale : null,
    createdAt: match.createdAt.toISOString(),
    status: audit?.status ?? "SUCCESS",
    semanticStatus: audit?.semanticStatus ?? null,
    semanticModel: audit?.semanticModel ?? null,
    degradedReason: audit?.degradedReason ?? null,
    sourceFreshness: audit?.sourceFreshness ?? null,
    counts: {
      selected: audit?.selectedCount ?? match.activeParticipantCount,
      excluded: audit?.excludedCount ?? 0,
      coveredPotentials: audit?.coveredPotentialCount ?? 0,
      uncoveredPotentials: audit?.uncoveredPotentialCount ?? 0,
    },
  };
}

function summarizeOperatorFeedback(
  feedback: MatchRunOperatorFeedback[]
): MatchRunAudit["operatorFeedback"] {
  return feedback.reduce<MatchRunAudit["operatorFeedback"]>(
    (summary, item) => {
      summary.totalActiveCount += 1;
      if (!item.activeDecision) {
        return summary;
      }

      summary.decidedCount += 1;
      if (item.activeDecision === "INVITED_ATTENDED") {
        summary.invitedAttendedCount += 1;
      } else if (item.activeDecision === "INVITED_REFUSED") {
        summary.invitedRefusedCount += 1;
      } else if (item.activeDecision === "DECLINED_BY_US") {
        summary.declinedByUsCount += 1;
      }
      return summary;
    },
    {
      totalActiveCount: 0,
      decidedCount: 0,
      invitedAttendedCount: 0,
      invitedRefusedCount: 0,
      declinedByUsCount: 0,
    }
  );
}

function hashValue(value: unknown) {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("hex")
    .slice(0, 16);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!isRecord(value)) {
    return value ?? null;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function isCandidateStale(
  candidate: SourceFreshnessCandidate,
  staleThresholdMs: number,
  now: Date
) {
  const reference =
    parseIsoDate(candidate.profileUpdatedAt) ?? parseIsoDate(candidate.syncedAt);
  if (!reference) {
    return true;
  }

  return now.getTime() - reference.getTime() > staleThresholdMs;
}

function newestIso(values: Array<Date | null>) {
  const filtered = values.filter((value): value is Date => value instanceof Date);
  if (filtered.length === 0) {
    return null;
  }

  return new Date(
    Math.max(...filtered.map((value) => value.getTime()))
  ).toISOString();
}

function oldestIso(values: Array<Date | null>) {
  const filtered = values.filter((value): value is Date => value instanceof Date);
  if (filtered.length === 0) {
    return null;
  }

  return new Date(
    Math.min(...filtered.map((value) => value.getTime()))
  ).toISOString();
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
