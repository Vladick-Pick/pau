import { describe, expect, it } from "vitest";

import {
  createFormatDraft,
  formatDraftToPatch,
  matchingSettingsFromRulesText,
  toFormatDraft,
  updateFormatDraft,
  updateMatchingSettingsDraft,
  validateFormatDrafts,
} from "../src/lib/pau/format-drafts";
import type { PauFormat } from "../src/lib/pau/types";

const guestFormat: PauFormat = {
  slug: "guest-meeting",
  name: "Гостевая встреча",
  description: "Знакомство потенциальных участников с клубом.",
  audience: null,
  moderatorNotes: null,
  bitrixEventTypeIds: ["guest"],
  bitrixSyncTitleQuery: "Гостевая встреча",
  matchingRules: { goal: "active" },
  promptPotential: "Опиши гостя",
  promptActive: "Опиши активного",
  promptModerator: "",
  promptReport: "",
};

describe("PAU format drafts", () => {
  it("creates an editable draft with the next available slug", () => {
    const existingDraft = toFormatDraft(guestFormat);
    const draft = createFormatDraft([existingDraft], "draft-1");

    expect(draft).toMatchObject({
      draftKey: "draft-1",
      isNew: true,
      slug: "new-format",
      name: "Новый формат",
      bitrixEventTypeIdsText: "",
      matchingRulesText: "{}",
      matchingTargetActiveCount: "2",
      matchingBufferActiveCount: "3",
      matchingFreshnessWarningEnabled: false,
      matchingFreshnessWarningDays: "30",
    });
  });

  it("updates a draft by stable draft key, not by mutable slug", () => {
    const draft = createFormatDraft([], "draft-1");

    const updated = updateFormatDraft([draft], "draft-1", {
      slug: "strategy-session",
      name: "Стратегическая сессия",
    });

    expect(updated[0]).toMatchObject({
      draftKey: "draft-1",
      slug: "strategy-session",
      name: "Стратегическая сессия",
    });
  });

  it("rejects duplicate or unsafe slugs before saving", () => {
    const draft = createFormatDraft([toFormatDraft(guestFormat)], "draft-1");

    expect(
      validateFormatDrafts([
        toFormatDraft(guestFormat),
        { ...draft, slug: "guest-meeting" },
      ])
    ).toBe("Код формата повторяется: guest-meeting.");

    expect(validateFormatDrafts([{ ...draft, slug: "рабочая группа" }])).toBe(
      "Код формата должен содержать латиницу, цифры, дефисы или подчеркивания."
    );
  });

  it("rejects non-object matching rules before saving", () => {
    const draft = createFormatDraft([], "draft-1");

    expect(
      validateFormatDrafts([{ ...draft, matchingRulesText: "guest meeting" }])
    ).toBe("Matching rules должен быть JSON-объектом: new-format.");

    expect(
      validateFormatDrafts([{ ...draft, matchingRulesText: '"guest meeting"' }])
    ).toBe("Matching rules должен быть JSON-объектом: new-format.");
  });

  it("serializes draft text fields into the existing API patch shape", () => {
    const patch = formatDraftToPatch({
      ...createFormatDraft([], "draft-1"),
      slug: "strategy-session",
      name: "Стратегическая сессия",
      bitrixEventTypeIdsText: "strategy, offline",
      matchingRulesText: '{ "goal": "strategy" }',
    });

    expect(patch).toEqual({
      slug: "strategy-session",
      name: "Стратегическая сессия",
      description: "",
      audience: null,
      moderatorNotes: null,
      bitrixSyncTitleQuery: "",
      bitrixEventTypeIds: ["strategy", "offline"],
      matchingRules: {
        goal: "strategy",
        activeInvitePlan: {
          targetCount: 2,
          bufferCount: 3,
        },
        recentVisitExclusion: {
          enabled: true,
          mode: "calendar_month",
          months: 1,
        },
        sourceFreshness: {
          enabled: false,
          staleAfterDays: 30,
        },
      },
      promptPotential: "",
      promptActive: "",
      promptModerator: "",
      promptReport: "",
    });
  });

  it("reads recent visit exclusion settings from matching rules", () => {
    expect(
      matchingSettingsFromRulesText(
        JSON.stringify({
          goal: "active",
          recentVisitExclusion: {
            enabled: true,
            mode: "rolling_months",
            months: 2,
          },
          activeInvitePlan: {
            targetCount: 4,
            bufferCount: 2,
          },
        })
      )
    ).toEqual({
      matchingRecentVisitMode: "rolling_months",
      matchingRecentVisitMonths: "2",
      matchingTargetActiveCount: "4",
      matchingBufferActiveCount: "2",
      matchingFreshnessWarningEnabled: false,
      matchingFreshnessWarningDays: "30",
    });
  });

  it("defaults new matching settings to the current calendar month", () => {
    expect(matchingSettingsFromRulesText("{}")).toEqual({
      matchingRecentVisitMode: "calendar_month",
      matchingRecentVisitMonths: "1",
      matchingTargetActiveCount: "2",
      matchingBufferActiveCount: "3",
      matchingFreshnessWarningEnabled: false,
      matchingFreshnessWarningDays: "30",
    });
  });

  it("reads source freshness warning settings from matching rules", () => {
    expect(
      matchingSettingsFromRulesText(
        JSON.stringify({
          goal: "active",
          sourceFreshness: {
            enabled: true,
            staleAfterDays: 21,
          },
        })
      )
    ).toEqual({
      matchingRecentVisitMode: "calendar_month",
      matchingRecentVisitMonths: "1",
      matchingTargetActiveCount: "2",
      matchingBufferActiveCount: "3",
      matchingFreshnessWarningEnabled: true,
      matchingFreshnessWarningDays: "21",
    });
  });

  it("stores recent visit exclusion settings while preserving existing rules", () => {
    const draft = toFormatDraft({
      ...guestFormat,
      matchingRules: { goal: "active" },
    });

    const patch = formatDraftToPatch({
      ...draft,
      ...updateMatchingSettingsDraft(draft, {
        matchingRecentVisitMode: "rolling_months",
        matchingRecentVisitMonths: "3",
      }),
    });

    expect(patch.matchingRules).toEqual({
      goal: "active",
      activeInvitePlan: {
        targetCount: 2,
        bufferCount: 3,
      },
      recentVisitExclusion: {
        enabled: true,
        mode: "rolling_months",
        months: 3,
      },
      sourceFreshness: {
        enabled: false,
        staleAfterDays: 30,
      },
    });
  });

  it("can disable recent visit exclusion explicitly", () => {
    const draft = toFormatDraft(guestFormat);
    const patch = formatDraftToPatch({
      ...draft,
      ...updateMatchingSettingsDraft(draft, {
        matchingRecentVisitMode: "off",
      }),
    });

    expect(patch.matchingRules).toMatchObject({
      goal: "active",
      activeInvitePlan: {
        targetCount: 2,
        bufferCount: 3,
      },
      recentVisitExclusion: {
        enabled: false,
        mode: "calendar_month",
        months: 1,
      },
    });
  });

  it("stores active invite target and buffer settings while preserving existing rules", () => {
    const draft = toFormatDraft({
      ...guestFormat,
      matchingRules: { goal: "active" },
    });

    const patch = formatDraftToPatch({
      ...draft,
      ...updateMatchingSettingsDraft(draft, {
        matchingTargetActiveCount: "2",
        matchingBufferActiveCount: "3",
      }),
    });

    expect(patch.matchingRules).toEqual({
      goal: "active",
      activeInvitePlan: {
        targetCount: 2,
        bufferCount: 3,
      },
      recentVisitExclusion: {
        enabled: true,
        mode: "calendar_month",
        months: 1,
      },
      sourceFreshness: {
        enabled: false,
        staleAfterDays: 30,
      },
    });
  });

  it("preserves unknown nested matching settings keys when source freshness is edited", () => {
    const draft = toFormatDraft({
      ...guestFormat,
      matchingRules: {
        goal: "active",
        activeInvitePlan: {
          strategy: "coverage_first",
        },
        recentVisitExclusion: {
          note: "keep-me",
        },
        sourceFreshness: {
          enabled: false,
          staleAfterDays: 30,
          severity: "warn",
        },
      },
    });

    const patch = formatDraftToPatch({
      ...draft,
      ...updateMatchingSettingsDraft(draft, {
        matchingFreshnessWarningEnabled: true,
        matchingFreshnessWarningDays: "14",
      }),
    });

    expect(patch.matchingRules).toEqual({
      goal: "active",
      activeInvitePlan: {
        targetCount: 2,
        bufferCount: 3,
        strategy: "coverage_first",
      },
      recentVisitExclusion: {
        enabled: true,
        mode: "calendar_month",
        months: 1,
        note: "keep-me",
      },
      sourceFreshness: {
        enabled: true,
        staleAfterDays: 14,
        severity: "warn",
      },
    });
  });

  it("preserves unknown nested matching rule keys when UI settings change", () => {
    const draft = toFormatDraft({
      ...guestFormat,
      matchingRules: {
        goal: "active",
        activeInvitePlan: {
          targetCount: 7,
          bufferCount: 1,
          minConfirmedGuests: 4,
        },
        recentVisitExclusion: {
          enabled: true,
          mode: "calendar_month",
          months: 1,
          includeOnlineFormats: false,
        },
      },
    });

    const patch = formatDraftToPatch({
      ...draft,
      ...updateMatchingSettingsDraft(draft, {
        matchingRecentVisitMode: "rolling_months",
        matchingRecentVisitMonths: "2",
        matchingTargetActiveCount: "3",
        matchingBufferActiveCount: "2",
      }),
    });

    expect(patch.matchingRules).toEqual({
      goal: "active",
      activeInvitePlan: {
        targetCount: 3,
        bufferCount: 2,
        minConfirmedGuests: 4,
      },
      recentVisitExclusion: {
        enabled: true,
        mode: "rolling_months",
        months: 2,
        includeOnlineFormats: false,
      },
      sourceFreshness: {
        enabled: false,
        staleAfterDays: 30,
      },
    });
  });

  it("keeps invalid matching rules text when matching setting controls change", () => {
    const draft = {
      ...toFormatDraft(guestFormat),
      matchingRulesText: '{ "goal": ',
    };

    expect(
      updateMatchingSettingsDraft(draft, {
        matchingTargetActiveCount: "5",
      })
    ).toMatchObject({
      matchingTargetActiveCount: "5",
      matchingRulesText: '{ "goal": ',
    });
  });
});
