export type RecentVisitExclusionMode = "calendar_month" | "rolling_months";

export type RecentVisitExclusionSettings = {
  enabled: boolean;
  mode: RecentVisitExclusionMode;
  months: number;
};

export type ActiveInvitePlanSettings = {
  targetCount: number;
  bufferCount: number;
  totalCount: number;
};

export type SourceFreshnessSettings = {
  enabled: boolean;
  staleAfterDays: number;
};

export type PotentialStatusPolicySettings = {
  includeInvited: boolean;
  includeUnknown: boolean;
};

export type ReadinessPolicySettings = {
  mode: "strict" | "soft";
};

export type SemanticPolicySettings = {
  mode: "shadow" | "capped";
  maxMovement: number;
};

export type CrossFormatCooldownSettings = {
  enabled: boolean;
  days: number;
  mode: "penalty" | "exclude";
  penalty: number;
};

export type FormatStrategyKind = "guest_meeting" | "expert_dialogue";

export type MatchingComponentKey =
  | "business_domain"
  | "business_role"
  | "request_fit"
  | "scale"
  | "personal_context"
  | "readiness_history";

export type FormatStrategySettings = {
  kind: FormatStrategyKind;
  weights: Record<MatchingComponentKey, number>;
};

export type MatchingSettings = {
  recentVisitExclusion: RecentVisitExclusionSettings;
  activeInvitePlan: ActiveInvitePlanSettings;
  sourceFreshness: SourceFreshnessSettings;
  potentialStatusPolicy: PotentialStatusPolicySettings;
  readinessPolicy: ReadinessPolicySettings;
  semanticPolicy: SemanticPolicySettings;
  crossFormatCooldown: CrossFormatCooldownSettings;
  formatStrategy: FormatStrategySettings;
};

export type MatchingRecentVisitMode =
  | "off"
  | "calendar_month"
  | "rolling_months";

export type MatchingSettingsDraft = {
  matchingRecentVisitMode: MatchingRecentVisitMode;
  matchingRecentVisitMonths: string;
  matchingTargetActiveCount: string;
  matchingBufferActiveCount: string;
  matchingFreshnessWarningEnabled: boolean;
  matchingFreshnessWarningDays: string;
};

export type MatchingRunPlan = {
  settings: MatchingSettings;
  activeParticipantLimit: number;
  semanticCandidateLimit: number;
};

export type RecentVisitExclusionWindow = {
  from: Date;
  to: Date;
};

export const DEFAULT_RECENT_VISIT_EXCLUSION: RecentVisitExclusionSettings = {
  enabled: true,
  mode: "calendar_month",
  months: 1,
};
export const DEFAULT_ACTIVE_TARGET_COUNT = 2;
export const DEFAULT_ACTIVE_BUFFER_COUNT = 3;
export const DEFAULT_SOURCE_FRESHNESS: SourceFreshnessSettings = {
  enabled: false,
  staleAfterDays: 30,
};
export const DEFAULT_POTENTIAL_STATUS_POLICY: PotentialStatusPolicySettings = {
  includeInvited: true,
  includeUnknown: false,
};
export const DEFAULT_READINESS_POLICY: ReadinessPolicySettings = {
  mode: "strict",
};
export const DEFAULT_SEMANTIC_POLICY: SemanticPolicySettings = {
  mode: "capped",
  maxMovement: 100,
};
export const DEFAULT_CROSS_FORMAT_COOLDOWN: CrossFormatCooldownSettings = {
  enabled: true,
  days: 30,
  mode: "penalty",
  penalty: 0.12,
};
export const GUEST_MEETING_WEIGHTS: Record<MatchingComponentKey, number> = {
  business_domain: 0.1,
  business_role: 0.18,
  request_fit: 0.4,
  scale: 0.06,
  personal_context: 0.06,
  readiness_history: 0.2,
};
export const EXPERT_DIALOGUE_WEIGHTS: Record<MatchingComponentKey, number> = {
  business_domain: 0.42,
  business_role: 0.18,
  request_fit: 0.08,
  scale: 0.06,
  personal_context: 0.06,
  readiness_history: 0.2,
};

export function parseMatchingSettings(rules: unknown): MatchingSettings {
  const record = asRecord(rules);
  const exclusion = asRecord(record?.recentVisitExclusion);
  const activeInvitePlan = asRecord(record?.activeInvitePlan);
  const sourceFreshness = asRecord(record?.sourceFreshness);
  const potentialStatusPolicy = asRecord(record?.potentialStatusPolicy);
  const readinessPolicy = asRecord(record?.readinessPolicy);
  const semanticPolicy = asRecord(record?.semanticPolicy);
  const crossFormatCooldown = asRecord(record?.crossFormatCooldown);
  const formatStrategy = asRecord(record?.formatStrategy);
  const enabled =
    typeof exclusion?.enabled === "boolean"
      ? exclusion.enabled
      : DEFAULT_RECENT_VISIT_EXCLUSION.enabled;
  const mode =
    exclusion?.mode === "rolling_months" ? "rolling_months" : "calendar_month";
  const months =
    positiveInteger(exclusion?.months) ?? DEFAULT_RECENT_VISIT_EXCLUSION.months;
  const targetCount =
    positiveInteger(activeInvitePlan?.targetCount) ?? DEFAULT_ACTIVE_TARGET_COUNT;
  const bufferCount =
    nonNegativeInteger(activeInvitePlan?.bufferCount) ??
    DEFAULT_ACTIVE_BUFFER_COUNT;
  const freshnessEnabled =
    typeof sourceFreshness?.enabled === "boolean"
      ? sourceFreshness.enabled
      : DEFAULT_SOURCE_FRESHNESS.enabled;
  const staleAfterDays =
    positiveInteger(sourceFreshness?.staleAfterDays) ??
    DEFAULT_SOURCE_FRESHNESS.staleAfterDays;
  const strategyKind =
    formatStrategy?.kind === "expert_dialogue" ? "expert_dialogue" : "guest_meeting";
  const cooldownMode =
    crossFormatCooldown?.mode === "exclude" ? "exclude" : "penalty";
  const semanticMode =
    semanticPolicy?.mode === "shadow" ? "shadow" : DEFAULT_SEMANTIC_POLICY.mode;

  return {
    recentVisitExclusion: {
      enabled,
      mode,
      months,
    },
    activeInvitePlan: {
      targetCount,
      bufferCount,
      totalCount: targetCount + bufferCount,
    },
    sourceFreshness: {
      enabled: freshnessEnabled,
      staleAfterDays,
    },
    potentialStatusPolicy: {
      includeInvited:
        typeof potentialStatusPolicy?.includeInvited === "boolean"
          ? potentialStatusPolicy.includeInvited
          : DEFAULT_POTENTIAL_STATUS_POLICY.includeInvited,
      includeUnknown:
        typeof potentialStatusPolicy?.includeUnknown === "boolean"
          ? potentialStatusPolicy.includeUnknown
          : DEFAULT_POTENTIAL_STATUS_POLICY.includeUnknown,
    },
    readinessPolicy: {
      mode: readinessPolicy?.mode === "soft" ? "soft" : "strict",
    },
    semanticPolicy: {
      mode: semanticMode,
      maxMovement:
        semanticMode === "shadow"
          ? 0
          : nonNegativeInteger(semanticPolicy?.maxMovement) ??
            DEFAULT_SEMANTIC_POLICY.maxMovement,
    },
    crossFormatCooldown: {
      enabled:
        typeof crossFormatCooldown?.enabled === "boolean"
          ? crossFormatCooldown.enabled
          : DEFAULT_CROSS_FORMAT_COOLDOWN.enabled,
      days:
        positiveInteger(crossFormatCooldown?.days) ??
        DEFAULT_CROSS_FORMAT_COOLDOWN.days,
      mode: cooldownMode,
      penalty:
        numberInRange(crossFormatCooldown?.penalty, 0, 1) ??
        DEFAULT_CROSS_FORMAT_COOLDOWN.penalty,
    },
    formatStrategy: {
      kind: strategyKind,
      weights:
        strategyKind === "expert_dialogue"
          ? EXPERT_DIALOGUE_WEIGHTS
          : GUEST_MEETING_WEIGHTS,
    },
  };
}

export function matchingSettingsToDraft(rules: unknown): MatchingSettingsDraft {
  const settings = parseMatchingSettings(rules);

  return {
    matchingRecentVisitMode: settings.recentVisitExclusion.enabled
      ? settings.recentVisitExclusion.mode
      : "off",
    matchingRecentVisitMonths: String(settings.recentVisitExclusion.months),
    matchingTargetActiveCount: String(settings.activeInvitePlan.targetCount),
    matchingBufferActiveCount: String(settings.activeInvitePlan.bufferCount),
    matchingFreshnessWarningEnabled: settings.sourceFreshness.enabled,
    matchingFreshnessWarningDays: String(settings.sourceFreshness.staleAfterDays),
  };
}

export function draftToMatchingRules(
  rules: unknown,
  draft: MatchingSettingsDraft
): Record<string, unknown> {
  const record = asRecord(rules) ?? {};
  const activeInvitePlan = asRecord(record.activeInvitePlan) ?? {};
  const recentVisitExclusion = asRecord(record.recentVisitExclusion) ?? {};
  const sourceFreshness = asRecord(record.sourceFreshness) ?? {};
  const mode =
    draft.matchingRecentVisitMode === "rolling_months"
      ? "rolling_months"
      : "calendar_month";
  const months =
    positiveInteger(draft.matchingRecentVisitMonths) ??
    DEFAULT_RECENT_VISIT_EXCLUSION.months;
  const targetCount =
    positiveInteger(draft.matchingTargetActiveCount) ??
    DEFAULT_ACTIVE_TARGET_COUNT;
  const bufferCount =
    nonNegativeInteger(draft.matchingBufferActiveCount) ??
    DEFAULT_ACTIVE_BUFFER_COUNT;
  const freshnessDays =
    positiveInteger(draft.matchingFreshnessWarningDays) ??
    DEFAULT_SOURCE_FRESHNESS.staleAfterDays;

  return {
    ...record,
    activeInvitePlan: {
      ...activeInvitePlan,
      targetCount,
      bufferCount,
    },
    recentVisitExclusion: {
      ...recentVisitExclusion,
      enabled: draft.matchingRecentVisitMode !== "off",
      mode,
      months,
    },
    sourceFreshness: {
      ...sourceFreshness,
      enabled: draft.matchingFreshnessWarningEnabled,
      staleAfterDays: freshnessDays,
    },
  };
}

export function activeInviteTotalFromDraft(
  draft: Pick<
    MatchingSettingsDraft,
    "matchingTargetActiveCount" | "matchingBufferActiveCount"
  >
) {
  const targetCount =
    positiveInteger(draft.matchingTargetActiveCount) ?? DEFAULT_ACTIVE_TARGET_COUNT;
  const bufferCount =
    nonNegativeInteger(draft.matchingBufferActiveCount) ??
    DEFAULT_ACTIVE_BUFFER_COUNT;
  return targetCount + bufferCount;
}

export function buildMatchingRunPlan(rules: unknown): MatchingRunPlan {
  const settings = parseMatchingSettings(rules);
  const activeParticipantLimit = settings.activeInvitePlan.totalCount;

  return {
    settings,
    activeParticipantLimit,
    semanticCandidateLimit: activeParticipantLimit * 3,
  };
}

export function getRecentVisitExclusionWindow(
  settings: RecentVisitExclusionSettings,
  eventDate: Date
): RecentVisitExclusionWindow | null {
  if (!settings.enabled) {
    return null;
  }

  if (settings.mode === "rolling_months") {
    const from = subtractUtcMonthsClamped(
      eventDate,
      Math.max(1, settings.months)
    );
    return { from, to: new Date(eventDate) };
  }

  const from = new Date(
    Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), 1)
  );
  const to = new Date(
    Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth() + 1, 1)
  );
  return { from, to };
}

function subtractUtcMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthIndex = month - months;
  const targetYear =
    year + Math.floor(targetMonthIndex / 12);
  const normalizedTargetMonth =
    ((targetMonthIndex % 12) + 12) % 12;
  const maxDay = new Date(
    Date.UTC(targetYear, normalizedTargetMonth + 1, 0)
  ).getUTCDate();
  const clampedDay = Math.min(day, maxDay);

  return new Date(
    Date.UTC(
      targetYear,
      normalizedTargetMonth,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown): number | null {
  const integer = integerValue(value);
  return integer !== null && integer > 0 ? integer : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const integer = integerValue(value);
  return integer !== null && integer >= 0 ? integer : null;
}

function integerValue(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(numeric)) {
    return null;
  }

  const integer = Math.trunc(numeric);
  return integer;
}

function numberInRange(value: unknown, min: number, max: number): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    return null;
  }

  return numeric;
}
