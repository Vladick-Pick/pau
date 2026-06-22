export type Workspace = {
  id: string;
  name: string | null;
  status: string | null;
};

export type ProfileCategory = {
  code?: string | null;
  name?: string | null;
};

export type ProfileState = {
  code?: string | null;
  name?: string | null;
  category_code?: string | null;
};

export type ProfileSearchItem = {
  id: string;
  workspace_id: string;
  display_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  categories: ProfileCategory[];
  states: ProfileState[];
  profile_updated_at?: string | null;
};

export type PublicProfile = Record<string, unknown>;

export type ProfileEnvelopeData = {
  id: string;
  workspace_id: string;
  display_name?: string | null;
  profile_updated_at?: string | null;
  profile: PublicProfile;
};

export type BusinessEvent = {
  id: string;
  event_type: string;
  event_type_label?: string | null;
  category?: string | null;
  title?: string | null;
  happened_at?: string | null;
  observed_at: string;
  importance?: number | null;
  current_value: Record<string, unknown>;
  attributes: Record<string, unknown>;
};

export type ApiListEnvelope<T> = {
  api_version: string;
  data: T[];
  pagination: { next_cursor: string | null; limit: number };
};

export type ApiItemEnvelope<T> = {
  api_version: string;
  data: T;
};

export type ApiErrorEnvelope = {
  api_version: string;
  error: { code: string; message: string };
};

export type FactPhase = "start" | "mid" | "end";

export type ProfileFacts = {
  tenureYear: number | null;
  retention: number | null;
  attendance: number | null;
  paymentPhase: FactPhase | null;
  businessBand: number | null;
};

export type ProfileDossier = {
  company: string | null;
  revenue: string | null;
  industry: string | null;
  position: string | null;
  city: string | null;
  age: number | null;
  interests: string | null;
  canBeUseful: string | null;
  clubGoals: string | null;
  telegram: string | null;
};

export type ParticipationEvent = {
  date: string;
  title: string;
  detail: string;
};
