export type FormatCardSource = {
  slug?: string;
  name?: string;
  description?: string | null;
  bitrixEventTypeIds?: string[];
  bitrixEventTypeIdsText?: string;
  matchingRules?: unknown;
  matchingRulesText?: string;
  promptPotential?: string | null;
  promptActive?: string | null;
  promptModerator?: string | null;
  promptReport?: string | null;
};

export function summarizeFormatCard(format: FormatCardSource) {
  const bitrixLinks =
    format.bitrixEventTypeIds ??
    (format.bitrixEventTypeIdsText ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  const prompts = [
    format.promptPotential,
    format.promptActive,
    format.promptModerator,
    format.promptReport,
  ];

  return {
    bitrixLinks,
    completedPrompts: prompts.filter((prompt) => Boolean(prompt?.trim())).length,
    hasMatchingRules: hasMatchingRules(format),
    totalPrompts: prompts.length,
  };
}

function hasMatchingRules(format: FormatCardSource) {
  if (typeof format.matchingRulesText === "string") {
    return format.matchingRulesText.trim().length > 0;
  }

  if (!format.matchingRules) {
    return false;
  }

  if (typeof format.matchingRules === "object") {
    return Object.keys(format.matchingRules).length > 0;
  }

  return true;
}
