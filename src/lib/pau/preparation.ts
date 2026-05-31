import type { EventMatchProfile } from "@/lib/matching/client";

export type PreparationParticipantKind = "POTENTIAL" | "ACTIVE";
export type PreparationBriefType = "POTENTIAL" | "ACTIVE" | "MODERATOR";

export const MAX_REPORT_TRANSCRIPT_CHARS = 80_000;

export type MatchableEvent = {
  id: string;
  title: string;
  startsAt: string | null;
  formatSlug: string;
};

export type MatchableFormat = {
  slug: string;
  name: string;
  matchingRules?: unknown;
};

export type MatchableParticipant = {
  id: string;
  kind: PreparationParticipantKind;
  status?: string | null;
  fullName: string;
  company?: string | null;
  position?: string | null;
  city?: string | null;
  age?: number | null;
  gender?: string | null;
  businessMain?: string | null;
  businessExtra1?: string | null;
  businessExtra2?: string | null;
  businessExtra3?: string | null;
  businessProfile?: unknown;
  enrichment?: unknown;
};

export type AttendanceSummaryParticipant = {
  id: string;
  kind: PreparationParticipantKind;
  status?: string | null;
  attendanceMarked?: boolean | null;
};

export type AttendanceSummary = {
  potential: {
    invited: number;
    attended: number;
    conversion: number;
  };
  active: {
    invited: number;
    attended: number;
    marked: number;
    attendedConversion: number;
    markedConversion: number;
  };
};

export type PastEventCandidate = {
  id: string;
  startsAt: string | null;
  status: string;
};

export type TranscriptReportInput = {
  eventTitle: string;
  formatName: string;
  prompt: string;
  transcript: string;
};

export type EventBriefPlanInput = {
  format: {
    promptPotential: string;
    promptActive: string;
    promptModerator: string;
  };
  participants: Array<{
    id: string;
    kind: PreparationParticipantKind;
    fullName: string;
  }>;
};

export type EventBriefPlanItem = {
  participantId: string | null;
  participantName: string;
  briefType: PreparationBriefType;
  prompt: string;
};

export function buildEventMatchProfile(input: {
  event: MatchableEvent;
  format: MatchableFormat;
  participants: MatchableParticipant[];
}): EventMatchProfile {
  return {
    event: {
      id: input.event.id,
      title: input.event.title,
      startsAt: input.event.startsAt,
      formatSlug: input.event.formatSlug,
      formatName: input.format.name,
    },
    format: {
      slug: input.format.slug,
      name: input.format.name,
      matchingInstructions: stringifyInstructions(input.format.matchingRules),
    },
    participants: input.participants
      .filter((participant) => participant.kind === "POTENTIAL")
      .map((participant) => ({
        id: participant.id,
        fullName: participant.fullName,
        company: participant.company ?? null,
        position: participant.position ?? null,
        city: participant.city ?? null,
        age: participant.age ?? null,
        gender: participant.gender ?? null,
        status: participant.status ?? undefined,
        participantKind: participant.kind,
        businessContext: buildBusinessContext(participant),
      })),
  };
}

export function buildEventBriefPlan(
  input: EventBriefPlanInput
): EventBriefPlanItem[] {
  const items: EventBriefPlanItem[] = input.participants.map((participant) => {
    const briefType = participant.kind === "ACTIVE" ? "ACTIVE" : "POTENTIAL";
    return {
      participantId: participant.id,
      participantName: participant.fullName,
      briefType,
      prompt:
        briefType === "ACTIVE"
          ? input.format.promptActive
          : input.format.promptPotential,
    };
  });

  if (input.format.promptModerator.trim()) {
    items.push({
      participantId: null,
      participantName: "Модератор",
      briefType: "MODERATOR",
      prompt: input.format.promptModerator,
    });
  }

  return items;
}

export function selectDefaultExportBriefs<
  T extends { briefType: PreparationBriefType },
>(briefs: T[]): T[] {
  return briefs.filter((brief) => brief.briefType === "ACTIVE");
}

export function computeEventAttendanceSummary(
  participants: AttendanceSummaryParticipant[]
): AttendanceSummary {
  const potential = participants.filter(
    (participant) => participant.kind === "POTENTIAL"
  );
  const active = participants.filter((participant) => participant.kind === "ACTIVE");
  const potentialInvited = potential.filter(wasInvited).length;
  const potentialAttended = potential.filter(wasAttended).length;
  const activeInvited = active.filter(wasInvited).length;
  const activeAttended = active.filter(wasAttended).length;
  const activeMarked = active.filter((participant) =>
    Boolean(participant.attendanceMarked)
  ).length;

  return {
    potential: {
      invited: potentialInvited,
      attended: potentialAttended,
      conversion: ratio(potentialAttended, potentialInvited),
    },
    active: {
      invited: activeInvited,
      attended: activeAttended,
      marked: activeMarked,
      attendedConversion: ratio(activeAttended, activeInvited),
      markedConversion: ratio(activeMarked, activeInvited),
    },
  };
}

export function getLatestPastEvent<Event extends PastEventCandidate>(
  events: Event[]
): Event | null {
  return (
    events
      .filter((event) => event.status === "PAST" && event.startsAt)
      .toSorted(
        (left, right) =>
          Date.parse(right.startsAt ?? "") - Date.parse(left.startsAt ?? "")
      )[0] ?? null
  );
}

export function buildTranscriptReportInput(input: {
  eventTitle: string;
  formatName: string;
  promptReport: string;
  transcript: string;
}): TranscriptReportInput {
  return {
    eventTitle: input.eventTitle,
    formatName: input.formatName,
    prompt: input.promptReport,
    transcript: input.transcript,
  };
}

function buildBusinessContext(participant: MatchableParticipant): string[] {
  return [
    stringifyBusinessProfile(participant.businessProfile),
    participant.businessMain,
    participant.businessExtra1,
    participant.businessExtra2,
    participant.businessExtra3,
    stringifyEnrichment(participant.enrichment),
  ].filter((value): value is string => Boolean(value));
}

function stringifyBusinessProfile(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function stringifyInstructions(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function stringifyEnrichment(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function wasInvited(participant: AttendanceSummaryParticipant) {
  return participant.status !== "UNKNOWN";
}

function wasAttended(participant: AttendanceSummaryParticipant) {
  return participant.status === "ATTENDED";
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}
