import type {
  BriefType,
  EventParticipantKind,
  EventParticipantStatus,
  PreparationEventStatus,
  Role,
  SyncStatus,
} from "@prisma/client";

export type PauIntegrationStatus = {
  database: boolean;
  bitrix: boolean;
  matching: boolean;
  openrouter: boolean;
};

export type PauSummary = {
  upcomingEvents: number;
  pastEvents: number;
  invitedParticipants: number;
  confirmedParticipants: number;
  activeParticipants: number;
  briefs: number;
};

export type PauFormat = {
  slug: string;
  name: string;
  description: string;
  audience: string | null;
  moderatorNotes: string | null;
  bitrixEventTypeIds: string[];
  bitrixSyncTitleQuery: string;
  matchingRules: unknown;
  promptPotential: string;
  promptActive: string;
  promptModerator: string;
};

export type PauEventParticipant = {
  id: string;
  participantId: string | null;
  kind: EventParticipantKind;
  status: EventParticipantStatus;
  bitrixDealId: string | null;
  bitrixContactId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  company: string | null;
  position: string | null;
  city: string | null;
  age: number | null;
  gender: string | null;
  businessMain: string | null;
  businessExtra1: string | null;
  businessExtra2: string | null;
  businessExtra3: string | null;
  enrichment: unknown;
  matchedScore: number | null;
  matchRationale: string | null;
  briefSummary: string | null;
};

export type PauEvent = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: PreparationEventStatus;
  bitrixEventId: string | null;
  bitrixSmartItemId: string | null;
  bitrixEventTypeId: string | null;
  bitrixEventTypeLabel: string | null;
  formatSlug: string;
  formatName: string;
  syncedAt: string | null;
  counts: {
    invited: number;
    confirmed: number;
    refused: number;
    attended: number;
    missed: number;
    unknown: number;
    active: number;
    briefs: number;
  };
  latestMatch: {
    activeParticipantCount: number;
    rationale: string | null;
    createdAt: string;
  } | null;
  participants: PauEventParticipant[];
};

export type PauBitrixEventCandidate = {
  eventId: string;
  entityTypeId: number;
  smartItemId: string;
  title: string;
  eventDate: string | null;
  stageName: string | null;
  status: string;
  eventTypeId: string | null;
  eventTypeLabel: string | null;
  formatId: string | null;
  formatLabel: string | null;
  updatedTime: string;
};

export type PauBrief = {
  id: string;
  eventTitle: string | null;
  participantName: string;
  briefType: BriefType;
  model: string;
  summary: string;
  createdAt: string;
  createdByRole: Role;
};

export type PauUser = {
  id: string;
  login: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string;
};

export type PauAutoSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  nextRunAt: string | null;
  lastLog: {
    status: SyncStatus;
    message: string | null;
    createdAt: string;
  } | null;
};

export type PauWorkspaceSnapshot = {
  demoMode: boolean;
  integrationStatus: PauIntegrationStatus;
  autoSync: PauAutoSyncStatus;
  summary: PauSummary;
  upcomingEvents: PauEvent[];
  pastEvents: PauEvent[];
  formats: PauFormat[];
  briefs: PauBrief[];
  users: PauUser[];
};
