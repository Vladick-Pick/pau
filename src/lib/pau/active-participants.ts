import type { ActiveRule, MemberProfile } from "@prisma/client";
import type {
  ProfileFacts,
  ProfileDossier,
  ParticipationEvent,
  FactPhase,
} from "@/lib/profile/types";
import type { ActiveRuleInput } from "@/lib/pau/active-rules";
import { evaluateActive } from "@/lib/pau/active-rules";
import {
  getClubRules,
  listMembers,
  getMember,
  roleIdsForProfile,
  roleIdsByProfile,
  readinessByProfile,
  getReadiness,
  getNote,
} from "@/lib/pau/active-store";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ActiveParticipantSummary {
  profileId: string;
  displayName: string | null;
  stateCode: string | null;
  facts: ProfileFacts;
  evaluation: {
    passed: boolean;
    failedKeys: string[];
    missingKeys: string[];
    total: number;
  };
  roleIds: string[];
  readiness: Array<{ formatId: string; readiness: string }>;
}

export interface ParticipantDetail extends ActiveParticipantSummary {
  dossier: ProfileDossier;
  participation: ParticipationEvent[];
  note: string | null;
  rules: ActiveRuleInput[];
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

/** Map a MemberProfile Prisma row to ProfileFacts. */
export function rowToFacts(m: MemberProfile): ProfileFacts {
  return {
    tenureYear: m.tenureYear ?? null,
    retention: m.retention ?? null,
    attendance: m.attendance ?? null,
    paymentPhase: (m.paymentPhase as FactPhase | null) ?? null,
    businessBand: m.businessBand ?? null,
  };
}

/** Map Prisma ActiveRule rows to ActiveRuleInput objects. */
export function rulesToInputs(rules: ActiveRule[]): ActiveRuleInput[] {
  return rules.map((r) => ({
    key: r.key,
    label: r.label,
    type: r.type as ActiveRuleInput["type"],
    factKey: r.factKey ?? null,
    config: r.config as Record<string, unknown>,
    enabled: r.enabled,
    optional: r.optional,
  }));
}

// ── Core functions ────────────────────────────────────────────────────────────

export async function getActiveParticipants(
  clubId: string
): Promise<ActiveParticipantSummary[]> {
  const [rules, members, roleMap, readinessMap] = await Promise.all([
    getClubRules(clubId).then(rulesToInputs),
    listMembers(clubId, { stateCode: "active" }),
    roleIdsByProfile(clubId),
    readinessByProfile(clubId),
  ]);

  const summaries: ActiveParticipantSummary[] = members.map((m) => {
    const facts = rowToFacts(m);
    const roleIds = roleMap.get(m.profileId) ?? [];
    const hasRole = roleIds.length > 0;
    const ev = evaluateActive(rules, facts, { hasRole });
    const readinessRows = readinessMap.get(m.profileId) ?? [];

    return {
      profileId: m.profileId,
      displayName: m.displayName ?? null,
      stateCode: m.stateCode ?? null,
      facts,
      evaluation: {
        passed: ev.passed,
        failedKeys: ev.failed.map((r) => r.key),
        missingKeys: ev.missing.map((r) => r.key),
        total: ev.total,
      },
      roleIds,
      readiness: readinessRows.map((r) => ({
        formatId: r.formatId,
        readiness: r.readiness,
      })),
    };
  });

  // Sort: passed first, then by displayName
  summaries.sort((a, b) => {
    if (a.evaluation.passed !== b.evaluation.passed) {
      return a.evaluation.passed ? -1 : 1;
    }
    const nameA = a.displayName ?? "";
    const nameB = b.displayName ?? "";
    return nameA.localeCompare(nameB, "ru");
  });

  return summaries;
}

export async function getParticipantDetail(
  clubId: string,
  profileId: string
): Promise<ParticipantDetail | null> {
  const m = await getMember(clubId, profileId);
  if (!m) return null;

  const [rules, roleIds, readinessRows, note] = await Promise.all([
    getClubRules(clubId).then(rulesToInputs),
    roleIdsForProfile(clubId, profileId),
    getReadiness(clubId, profileId),
    getNote(clubId, profileId),
  ]);

  const facts = rowToFacts(m);
  const hasRole = roleIds.length > 0;
  const ev = evaluateActive(rules, facts, { hasRole });

  return {
    profileId: m.profileId,
    displayName: m.displayName ?? null,
    stateCode: m.stateCode ?? null,
    facts,
    evaluation: {
      passed: ev.passed,
      failedKeys: ev.failed.map((r) => r.key),
      missingKeys: ev.missing.map((r) => r.key),
      total: ev.total,
    },
    roleIds,
    readiness: readinessRows.map((r) => ({
      formatId: r.formatId,
      readiness: r.readiness,
    })),
    dossier: m.dossier as unknown as ProfileDossier,
    participation: m.participation as unknown as ParticipationEvent[],
    note,
    rules,
  };
}
