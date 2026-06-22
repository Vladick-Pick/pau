import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_ACTIVE_RULES } from "@/lib/pau/active-defaults";
import type { ProfileFacts, ProfileDossier, ParticipationEvent } from "@/lib/profile/types";
import type { ActiveRule, ActiveRole, Club, FormatReadiness, MemberProfile } from "@prisma/client";

// ── Clubs ─────────────────────────────────────────────────────────────────────

export async function listClubs(): Promise<Club[]> {
  return prisma.club.findMany({ orderBy: { name: "asc" } });
}

// ── Club seeding ──────────────────────────────────────────────────────────────

export async function getOrSeedClub(clubId: string, name: string): Promise<void> {
  await prisma.club.upsert({
    where: { id: clubId },
    create: { id: clubId, name },
    update: { name },
  });

  const existing = await prisma.activeRule.count({ where: { clubId } });
  if (existing === 0) {
    await prisma.activeRule.createMany({
      data: DEFAULT_ACTIVE_RULES.map((r) => ({
        clubId,
        key: r.key,
        label: r.label,
        description: r.description ?? null,
        type: r.type,
        factKey: r.factKey ?? null,
        config: r.config as Prisma.InputJsonValue,
        enabled: r.enabled,
        optional: r.optional ?? false,
        sortOrder: r.sortOrder,
      })),
    });
  }
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export async function getClubRules(clubId: string): Promise<ActiveRule[]> {
  return prisma.activeRule.findMany({
    where: { clubId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function updateRule(
  ruleId: string,
  patch: { label?: string; config?: unknown; enabled?: boolean }
): Promise<ActiveRule> {
  return prisma.activeRule.update({
    where: { id: ruleId },
    data: {
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.config !== undefined && {
        config: patch.config as Prisma.InputJsonValue,
      }),
      ...(patch.enabled !== undefined && { enabled: patch.enabled }),
    },
  });
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function listRoles(
  clubId: string
): Promise<Array<ActiveRole & { count: number }>> {
  const roles = await prisma.activeRole.findMany({
    where: { clubId },
    include: { _count: { select: { assignments: true } } },
  });
  return roles.map(({ _count, ...role }) => ({
    ...role,
    count: _count.assignments,
  }));
}

export async function createRole(
  clubId: string,
  name: string,
  description?: string
): Promise<ActiveRole> {
  return prisma.activeRole.create({
    data: { clubId, name, description: description ?? null },
  });
}

export async function deleteRole(roleId: string): Promise<void> {
  await prisma.activeRole.delete({ where: { id: roleId } });
}

export async function assignRole(roleId: string, profileId: string): Promise<void> {
  await prisma.activeRoleAssignment.upsert({
    where: { roleId_profileId: { roleId, profileId } },
    create: { roleId, profileId },
    update: {},
  });
}

export async function unassignRole(roleId: string, profileId: string): Promise<void> {
  await prisma.activeRoleAssignment.deleteMany({
    where: { roleId, profileId },
  });
}

export async function roleIdsForProfile(
  clubId: string,
  profileId: string
): Promise<string[]> {
  const assignments = await prisma.activeRoleAssignment.findMany({
    where: { profileId, role: { clubId } },
    select: { roleId: true },
  });
  return assignments.map((a) => a.roleId);
}

// ── Format readiness ──────────────────────────────────────────────────────────

export async function setReadiness(
  clubId: string,
  profileId: string,
  formatId: string,
  readiness: "READY" | "NOT_READY" | "UNMARKED"
): Promise<void> {
  await prisma.formatReadiness.upsert({
    where: { profileId_formatId: { profileId, formatId } },
    create: { clubId, profileId, formatId, readiness },
    update: { readiness },
  });
}

export async function getReadiness(profileId: string): Promise<FormatReadiness[]> {
  return prisma.formatReadiness.findMany({ where: { profileId } });
}

// ── Participant notes ─────────────────────────────────────────────────────────

export async function setNote(
  clubId: string,
  profileId: string,
  note: string
): Promise<void> {
  await prisma.participantNote.upsert({
    where: { profileId },
    create: { clubId, profileId, note },
    update: { note },
  });
}

export async function getNote(profileId: string): Promise<string | null> {
  const row = await prisma.participantNote.findUnique({ where: { profileId } });
  return row?.note ?? null;
}

// ── Member profiles ───────────────────────────────────────────────────────────

export interface MemberProfileInput {
  clubId: string;
  profileId: string;
  displayName: string | null;
  stateCode: string | null;
  facts: ProfileFacts;
  dossier: ProfileDossier;
  participation: ParticipationEvent[];
  profileUpdatedAt: Date | null;
}

export async function upsertMemberProfile(input: MemberProfileInput): Promise<void> {
  const {
    clubId,
    profileId,
    displayName,
    stateCode,
    facts,
    dossier,
    participation,
    profileUpdatedAt,
  } = input;

  const data = {
    displayName,
    stateCode,
    tenureYear: facts.tenureYear,
    paymentPhase: facts.paymentPhase,
    businessBand: facts.businessBand,
    retention: facts.retention,
    attendance: facts.attendance,
    dossier: dossier as object,
    participation: participation as object,
    profileUpdatedAt,
  };

  await prisma.memberProfile.upsert({
    where: { clubId_profileId: { clubId, profileId } },
    create: { clubId, profileId, ...data },
    update: data,
  });
}

export async function listMembers(
  clubId: string,
  opts?: { stateCode?: string }
): Promise<MemberProfile[]> {
  return prisma.memberProfile.findMany({
    where: {
      clubId,
      ...(opts?.stateCode !== undefined && { stateCode: opts.stateCode }),
    },
  });
}

export async function getMember(
  clubId: string,
  profileId: string
): Promise<MemberProfile | null> {
  return prisma.memberProfile.findUnique({
    where: { clubId_profileId: { clubId, profileId } },
  });
}
