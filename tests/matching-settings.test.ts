import { describe, expect, it } from "vitest";

import {
  activeInviteTotalFromDraft,
  buildMatchingRunPlan,
  draftToMatchingRules,
  getRecentVisitExclusionWindow,
  matchingSettingsToDraft,
  parseMatchingSettings,
} from "../src/lib/matching/matching-settings";

describe("matching settings", () => {
  it("defaults to excluding the current calendar month", () => {
    const settings = parseMatchingSettings({});
    const window = getRecentVisitExclusionWindow(
      settings.recentVisitExclusion,
      new Date("2026-07-30T12:00:00.000Z")
    );

    expect(settings.recentVisitExclusion).toEqual({
      enabled: true,
      mode: "calendar_month",
      months: 1,
    });
    expect(window).toEqual({
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-08-01T00:00:00.000Z"),
    });
  });

  it("defaults to inviting a target group plus an arrival buffer", () => {
    const settings = parseMatchingSettings({});

    expect(settings.activeInvitePlan).toEqual({
      targetCount: 2,
      bufferCount: 3,
      totalCount: 5,
    });
    expect(settings.sourceFreshness).toEqual({
      enabled: false,
      staleAfterDays: 30,
    });
  });

  it("reads the active invite plan from matching rules", () => {
    const settings = parseMatchingSettings({
      activeInvitePlan: {
        targetCount: 4,
        bufferCount: 2,
      },
    });

    expect(settings.activeInvitePlan).toEqual({
      targetCount: 4,
      bufferCount: 2,
      totalCount: 6,
    });
  });

  it("supports a rolling-month exclusion window", () => {
    const settings = parseMatchingSettings({
      recentVisitExclusion: {
        enabled: true,
        mode: "rolling_months",
        months: 2,
      },
    });

    expect(
      getRecentVisitExclusionWindow(
        settings.recentVisitExclusion,
        new Date("2026-07-30T12:00:00.000Z")
      )
    ).toEqual({
      from: new Date("2026-05-30T12:00:00.000Z"),
      to: new Date("2026-07-30T12:00:00.000Z"),
    });
  });

  it("clamps rolling-month windows to the last valid target-month day", () => {
    const settings = parseMatchingSettings({
      recentVisitExclusion: {
        enabled: true,
        mode: "rolling_months",
        months: 1,
      },
    });

    expect(
      getRecentVisitExclusionWindow(
        settings.recentVisitExclusion,
        new Date("2026-03-31T12:00:00.000Z")
      )
    ).toEqual({
      from: new Date("2026-02-28T12:00:00.000Z"),
      to: new Date("2026-03-31T12:00:00.000Z"),
    });
  });

  it("keeps the clamped target-month day inside the rolling visit window", () => {
    const settings = parseMatchingSettings({
      recentVisitExclusion: {
        enabled: true,
        mode: "rolling_months",
        months: 1,
      },
    });
    const window = getRecentVisitExclusionWindow(
      settings.recentVisitExclusion,
      new Date("2026-03-31T12:00:00.000Z")
    );
    const visitDate = new Date("2026-02-28T12:00:00.000Z");

    expect(window).not.toBeNull();
    expect(visitDate >= window!.from && visitDate < window!.to).toBe(true);
  });

  it("returns null when recent visit exclusion is disabled", () => {
    const settings = parseMatchingSettings({
      recentVisitExclusion: { enabled: false, months: 4 },
    });

    expect(
      getRecentVisitExclusionWindow(
        settings.recentVisitExclusion,
        new Date("2026-07-30T12:00:00.000Z")
      )
    ).toBeNull();
  });

  it("reads source freshness warning settings from matching rules", () => {
    const settings = parseMatchingSettings({
      sourceFreshness: {
        enabled: true,
        staleAfterDays: 14,
      },
    });

    expect(settings.sourceFreshness).toEqual({
      enabled: true,
      staleAfterDays: 14,
    });
  });

  it("defaults Plan 002 matching policies to safe event-composition behavior", () => {
    const settings = parseMatchingSettings({});

    expect(settings.potentialStatusPolicy).toEqual({
      includeInvited: true,
      includeUnknown: false,
    });
    expect(settings.readinessPolicy).toEqual({ mode: "strict" });
    expect(settings.semanticPolicy).toEqual({
      mode: "capped",
      maxMovement: 100,
    });
    expect(settings.crossFormatCooldown).toEqual({
      enabled: true,
      days: 30,
      mode: "penalty",
      penalty: 0.12,
    });
    expect(settings.formatStrategy.kind).toBe("guest_meeting");
  });

  it("reads Plan 002 matching policies from matching rules", () => {
    const settings = parseMatchingSettings({
      potentialStatusPolicy: {
        includeInvited: true,
        includeUnknown: true,
      },
      readinessPolicy: {
        mode: "soft",
      },
      semanticPolicy: {
        mode: "capped",
        maxMovement: 1,
      },
      crossFormatCooldown: {
        enabled: false,
        days: 45,
        mode: "exclude",
        penalty: 0.3,
      },
      formatStrategy: {
        kind: "expert_dialogue",
      },
    });

    expect(settings.potentialStatusPolicy).toEqual({
      includeInvited: true,
      includeUnknown: true,
    });
    expect(settings.readinessPolicy).toEqual({ mode: "soft" });
    expect(settings.semanticPolicy).toEqual({
      mode: "capped",
      maxMovement: 1,
    });
    expect(settings.crossFormatCooldown).toEqual({
      enabled: false,
      days: 45,
      mode: "exclude",
      penalty: 0.3,
    });
    expect(settings.formatStrategy.kind).toBe("expert_dialogue");
  });

  it("converts persisted rules to an editable matching settings draft", () => {
    expect(
      matchingSettingsToDraft({
        activeInvitePlan: { targetCount: 4, bufferCount: 2 },
        recentVisitExclusion: {
          enabled: false,
          mode: "rolling_months",
          months: 3,
        },
        sourceFreshness: {
          enabled: true,
          staleAfterDays: 21,
        },
      })
    ).toEqual({
      matchingRecentVisitMode: "off",
      matchingRecentVisitMonths: "3",
      matchingTargetActiveCount: "4",
      matchingBufferActiveCount: "2",
      matchingFreshnessWarningEnabled: true,
      matchingFreshnessWarningDays: "21",
    });
  });

  it("serializes a draft back to matching rules while preserving nested keys", () => {
    expect(
      draftToMatchingRules(
        {
          goal: "active",
          activeInvitePlan: { strategy: "coverage_first" },
          recentVisitExclusion: { includeOnlineFormats: false },
          sourceFreshness: { severity: "warn" },
        },
        {
          matchingRecentVisitMode: "rolling_months",
          matchingRecentVisitMonths: "2",
          matchingTargetActiveCount: "3",
          matchingBufferActiveCount: "1",
          matchingFreshnessWarningEnabled: true,
          matchingFreshnessWarningDays: "14",
        }
      )
    ).toEqual({
      goal: "active",
      activeInvitePlan: {
        strategy: "coverage_first",
        targetCount: 3,
        bufferCount: 1,
      },
      recentVisitExclusion: {
        includeOnlineFormats: false,
        enabled: true,
        mode: "rolling_months",
        months: 2,
      },
      sourceFreshness: {
        severity: "warn",
        enabled: true,
        staleAfterDays: 14,
      },
    });
  });

  it("builds one run plan for matcher candidate limits", () => {
    expect(
      buildMatchingRunPlan({
        activeInvitePlan: {
          targetCount: 2,
          bufferCount: 3,
        },
      })
    ).toMatchObject({
      activeParticipantLimit: 5,
      semanticCandidateLimit: 15,
      settings: {
        activeInvitePlan: {
          targetCount: 2,
          bufferCount: 3,
          totalCount: 5,
        },
      },
    });

    expect(
      activeInviteTotalFromDraft({
        matchingTargetActiveCount: "4",
        matchingBufferActiveCount: "2",
      })
    ).toBe(6);
  });
});
