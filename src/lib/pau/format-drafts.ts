import type { PauFormat } from "@/lib/pau/types";
import { isSafeFormatSlug } from "@/lib/pau/format-slugs";
import {
  draftToMatchingRules,
  matchingSettingsToDraft,
  type MatchingRecentVisitMode,
  type MatchingSettingsDraft,
} from "@/lib/matching/matching-settings";

export type FormatDraft = Omit<PauFormat, "bitrixEventTypeIds" | "matchingRules"> & {
  draftKey: string;
  isNew: boolean;
  bitrixEventTypeIdsText: string;
  matchingRulesText: string;
  matchingRecentVisitMode: MatchingRecentVisitMode;
  matchingRecentVisitMonths: string;
  matchingTargetActiveCount: string;
  matchingBufferActiveCount: string;
  matchingFreshnessWarningEnabled: boolean;
  matchingFreshnessWarningDays: string;
};

const NEW_FORMAT_BASE_SLUG = "new-format";

export type { MatchingRecentVisitMode, MatchingSettingsDraft };

export function toFormatDraft(format: PauFormat): FormatDraft {
  const matchingRulesText =
    typeof format.matchingRules === "string"
      ? format.matchingRules
      : JSON.stringify(format.matchingRules ?? {}, null, 2);

  return {
    ...format,
    draftKey: format.slug,
    isNew: false,
    bitrixEventTypeIdsText: format.bitrixEventTypeIds.join(", "),
    matchingRulesText,
    ...matchingSettingsFromRulesText(matchingRulesText),
  };
}

export function createFormatDraft(
  existingDrafts: Array<Pick<FormatDraft, "slug">>,
  draftKey: string
): FormatDraft {
  const slug = nextAvailableSlug(
    existingDrafts.map((format) => format.slug),
    NEW_FORMAT_BASE_SLUG
  );

  return {
    draftKey,
    isNew: true,
    slug,
    name: "Новый формат",
    description: "",
    audience: null,
    moderatorNotes: null,
    bitrixSyncTitleQuery: "",
    bitrixEventTypeIdsText: "",
    matchingRulesText: "{}",
    ...matchingSettingsToDraft({}),
    promptPotential: "",
    promptActive: "",
    promptModerator: "",
    promptReport: "",
  };
}

export function updateFormatDraft(
  drafts: FormatDraft[],
  draftKey: string,
  patch: Partial<FormatDraft>
) {
  return drafts.map((format) =>
    format.draftKey === draftKey ? { ...format, ...patch } : format
  );
}

export function removeFormatDraft(drafts: FormatDraft[], draftKey: string) {
  return drafts.filter((format) => format.draftKey !== draftKey);
}

export function validateFormatDrafts(drafts: FormatDraft[]) {
  const seenSlugs = new Set<string>();

  for (const draft of drafts) {
    const slug = draft.slug.trim();
    const name = draft.name.trim();

    if (!slug) {
      return "Код формата обязателен.";
    }
    if (!isSafeFormatSlug(slug)) {
      return "Код формата должен содержать латиницу, цифры, дефисы или подчеркивания.";
    }
    if (seenSlugs.has(slug)) {
      return `Код формата повторяется: ${slug}.`;
    }
    if (!name) {
      return "Название формата обязательно.";
    }
    if (!isJsonObjectText(draft.matchingRulesText)) {
      return `Matching rules должен быть JSON-объектом: ${slug}.`;
    }

    seenSlugs.add(slug);
  }

  return null;
}

export function formatDraftToPatch(format: FormatDraft) {
  return {
    slug: format.slug.trim(),
    name: format.name.trim(),
    description: format.description,
    audience: format.audience,
    moderatorNotes: format.moderatorNotes,
    bitrixSyncTitleQuery: format.bitrixSyncTitleQuery.trim(),
    bitrixEventTypeIds: format.bitrixEventTypeIdsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    matchingRules: parseJsonOrString(
      matchingRulesTextWithSettings(format.matchingRulesText, format)
    ),
    promptPotential: format.promptPotential,
    promptActive: format.promptActive,
    promptModerator: format.promptModerator,
    promptReport: format.promptReport,
  };
}

export function matchingSettingsFromRulesText(
  matchingRulesText: string
): MatchingSettingsDraft {
  const rules = parseJsonObject(matchingRulesText);
  return matchingSettingsToDraft(rules ?? {});
}

export function updateMatchingSettingsDraft(
  format: Pick<
    FormatDraft,
    | "matchingRulesText"
    | "matchingRecentVisitMode"
    | "matchingRecentVisitMonths"
    | "matchingTargetActiveCount"
    | "matchingBufferActiveCount"
    | "matchingFreshnessWarningEnabled"
    | "matchingFreshnessWarningDays"
  >,
  patch: Partial<MatchingSettingsDraft>
): MatchingSettingsDraft & { matchingRulesText: string } {
  const next = {
    matchingRecentVisitMode:
      patch.matchingRecentVisitMode ?? format.matchingRecentVisitMode,
    matchingRecentVisitMonths:
      patch.matchingRecentVisitMonths ?? format.matchingRecentVisitMonths,
    matchingTargetActiveCount:
      patch.matchingTargetActiveCount ?? format.matchingTargetActiveCount,
    matchingBufferActiveCount:
      patch.matchingBufferActiveCount ?? format.matchingBufferActiveCount,
    matchingFreshnessWarningEnabled:
      patch.matchingFreshnessWarningEnabled ??
      format.matchingFreshnessWarningEnabled,
    matchingFreshnessWarningDays:
      patch.matchingFreshnessWarningDays ??
      format.matchingFreshnessWarningDays,
  };

  return {
    ...next,
    matchingRulesText: matchingRulesTextWithSettings(format.matchingRulesText, next),
  };
}

function matchingRulesTextWithSettings(
  matchingRulesText: string,
  settings: MatchingSettingsDraft
) {
  const rules = parseJsonObject(matchingRulesText);
  if (!rules) {
    return matchingRulesText;
  }

  return JSON.stringify(draftToMatchingRules(rules, settings), null, 2);
}

function nextAvailableSlug(existingSlugs: string[], baseSlug: string) {
  const used = new Set(existingSlugs.map((slug) => slug.trim()).filter(Boolean));
  if (!used.has(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

function parseJsonOrString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const parsed = parseJsonOrString(value);
  return asRecord(parsed);
}

function isJsonObjectText(value: string) {
  return parseJsonObject(value) !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
