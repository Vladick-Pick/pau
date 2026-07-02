import { describe, expect, it } from "vitest";

import {
  createFormatDraft,
  formatDraftToPatch,
  toFormatDraft,
  updateFormatDraft,
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
      matchingRules: { goal: "strategy" },
      promptPotential: "",
      promptActive: "",
      promptModerator: "",
      promptReport: "",
    });
  });
});
