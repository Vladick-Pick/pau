import type {
  ActiveParticipantSummary,
  ReadinessEntry,
  ReadinessValue,
} from "./types";

export type FormatReadinessFilterValue = "all" | ReadinessValue;

export type FormatReadinessFilter = {
  formatId: string;
  readiness: FormatReadinessFilterValue;
};

export type ReadinessFormatOption = {
  formatId: string;
  formatName: string;
};

export const ALL_FORMATS_FILTER = "all";

export function listReadinessFormatOptions(
  participants: ActiveParticipantSummary[]
): ReadinessFormatOption[] {
  const byId = new Map<string, string>();

  for (const participant of participants) {
    for (const row of participant.readiness) {
      if (!byId.has(row.formatId)) {
        byId.set(row.formatId, row.formatName || row.formatId);
      }
    }
  }

  return Array.from(byId, ([formatId, formatName]) => ({
    formatId,
    formatName,
  })).sort((a, b) => a.formatName.localeCompare(b.formatName, "ru"));
}

export function formatReadinessFilterLabel(
  options: ReadinessFormatOption[],
  formatId: string
): string {
  if (formatId === ALL_FORMATS_FILTER) {
    return "Все форматы";
  }

  return (
    options.find((format) => format.formatId === formatId)?.formatName ?? formatId
  );
}

export function getParticipantFormatReadiness(
  participant: ActiveParticipantSummary,
  formatId: string,
  fallbackName?: string
): ReadinessEntry {
  const row = participant.readiness.find((row) => row.formatId === formatId);
  return {
    formatId,
    formatName: row?.formatName || fallbackName || formatId,
    readiness: normalizeReadiness(row?.readiness),
  };
}

export function filterParticipantsByFormatReadiness(
  participants: ActiveParticipantSummary[],
  filter: FormatReadinessFilter
): ActiveParticipantSummary[] {
  if (filter.formatId === ALL_FORMATS_FILTER || filter.readiness === "all") {
    return participants;
  }

  return participants.filter((participant) => {
    const readiness = getParticipantFormatReadiness(
      participant,
      filter.formatId
    ).readiness;
    return readiness === filter.readiness;
  });
}

function normalizeReadiness(value: string | undefined): ReadinessValue {
  if (value === "READY" || value === "NOT_READY") {
    return value;
  }

  return "UNMARKED";
}
