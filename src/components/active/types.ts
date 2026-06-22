import type { ProfileFacts, ProfileDossier, ParticipationEvent } from "@/lib/profile/types";
import type { ActiveRuleInput } from "@/lib/pau/active-rules";

// Shape returned by GET /api/clubs
export interface Club {
  id: string;
  name: string;
  createdAt: string;
}

// Shape returned by GET /api/clubs/[clubId]/active-participants
export interface ActiveParticipantSummary {
  profileId: string;
  displayName: string | null;
  stateCode: string | null;
  facts: ProfileFacts;
  evaluation: {
    passed: boolean;
    failedKeys: string[];
    missingKeys: string[];
    total: number;
  };
  roleIds: string[];
  readiness: Array<{ formatId: string; readiness: string }>;
}

// Shape returned by GET /api/clubs/[clubId]/participants/[profileId]
export interface ParticipantDetail extends ActiveParticipantSummary {
  dossier: ProfileDossier;
  participation: ParticipationEvent[];
  note: string | null;
  rules: ActiveRuleInput[];
}

// Shape returned by GET /api/clubs/[clubId]/roles
export interface ClubRole {
  id: string;
  clubId: string;
  name: string;
  description: string | null;
  count: number;
}

// Shape returned by GET /api/clubs/[clubId]/rules (from the list, each rule has id)
export interface ClubRule extends ActiveRuleInput {
  id: string;
  description?: string | null;
}

export type ReadinessValue = "READY" | "NOT_READY" | "UNMARKED";

export type StatusFilter = "all" | "active" | "inactive" | "gaps";
export type SortBy = "status" | "name" | "retention";
export type InspectorTab = "profile" | "formats" | "history";
