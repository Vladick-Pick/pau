import { describe, expect, it } from "vitest";

import type { ActiveParticipantSummary } from "@/components/active/types";
import {
  filterParticipantsByFormatReadiness,
  formatReadinessFilterLabel,
  listReadinessFormatOptions,
} from "@/components/active/participant-filtering";

function participant(
  profileId: string,
  readiness: ActiveParticipantSummary["readiness"]
): ActiveParticipantSummary {
  return {
    profileId,
    displayName: profileId,
    stateCode: "active",
    facts: {
      tenureYear: null,
      retention: null,
      attendance: null,
      paymentPhase: null,
      businessBand: null,
    },
    evaluation: {
      passed: true,
      failedKeys: [],
      missingKeys: [],
      total: 0,
    },
    roleIds: [],
    readiness,
  };
}

describe("active participant format readiness filtering", () => {
  const participants = [
    participant("ready", [
      {
        formatId: "guest-meeting",
        formatName: "Гостевая встреча",
        readiness: "READY",
      },
      {
        formatId: "working-group",
        formatName: "Рабочая группа",
        readiness: "NOT_READY",
      },
    ]),
    participant("not-ready", [
      {
        formatId: "guest-meeting",
        formatName: "Гостевая встреча",
        readiness: "NOT_READY",
      },
    ]),
    participant("unmarked", [
      {
        formatId: "guest-meeting",
        formatName: "Гостевая встреча",
        readiness: "UNMARKED",
      },
    ]),
    participant("missing-row", []),
  ];

  it("deduplicates available formats by id and sorts them by name", () => {
    expect(listReadinessFormatOptions(participants)).toEqual([
      { formatId: "guest-meeting", formatName: "Гостевая встреча" },
      { formatId: "working-group", formatName: "Рабочая группа" },
    ]);
  });

  it("returns Russian labels for the selected format filter", () => {
    const options = listReadinessFormatOptions(participants);

    expect(formatReadinessFilterLabel(options, "all")).toBe("Все форматы");
    expect(formatReadinessFilterLabel(options, "guest-meeting")).toBe(
      "Гостевая встреча"
    );
  });

  it("keeps all participants when no concrete format is selected", () => {
    expect(
      filterParticipantsByFormatReadiness(participants, {
        formatId: "all",
        readiness: "READY",
      }).map((p) => p.profileId)
    ).toEqual(["ready", "not-ready", "unmarked", "missing-row"]);
  });

  it("filters ready, not ready, and unmarked participants for the selected format", () => {
    expect(
      filterParticipantsByFormatReadiness(participants, {
        formatId: "guest-meeting",
        readiness: "READY",
      }).map((p) => p.profileId)
    ).toEqual(["ready"]);

    expect(
      filterParticipantsByFormatReadiness(participants, {
        formatId: "guest-meeting",
        readiness: "NOT_READY",
      }).map((p) => p.profileId)
    ).toEqual(["not-ready"]);

    expect(
      filterParticipantsByFormatReadiness(participants, {
        formatId: "guest-meeting",
        readiness: "UNMARKED",
      }).map((p) => p.profileId)
    ).toEqual(["unmarked", "missing-row"]);
  });
});
