import type { PauFormat } from "@/lib/pau/types";
import { isSafeFormatSlug } from "@/lib/pau/format-slugs";

export type FormatDraft = Omit<PauFormat, "bitrixEventTypeIds" | "matchingRules"> & {
  draftKey: string;
  isNew: boolean;
  bitrixEventTypeIdsText: string;
  matchingRulesText: string;
};

const NEW_FORMAT_BASE_SLUG = "new-format";

export function toFormatDraft(format: PauFormat): FormatDraft {
  return {
    ...format,
    draftKey: format.slug,
    isNew: false,
    bitrixEventTypeIdsText: format.bitrixEventTypeIds.join(", "),
    matchingRulesText:
      typeof format.matchingRules === "string"
        ? format.matchingRules
        : JSON.stringify(format.matchingRules ?? {}, null, 2),
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
    matchingRules: parseJsonOrString(format.matchingRulesText),
    promptPotential: format.promptPotential,
    promptActive: format.promptActive,
    promptModerator: format.promptModerator,
    promptReport: format.promptReport,
  };
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
