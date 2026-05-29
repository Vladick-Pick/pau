import { z } from "zod";

export type MatchProfile = {
  id: string;
  fullName: string;
  company?: string | null;
  position?: string | null;
  city?: string | null;
  interests: string[];
  history: Array<{
    formatSlug: string;
    attendedAt: string;
  }>;
};

export type MatchResult = {
  score: number;
  activeParticipantIds: string[];
  rationale: string;
  suggestedFormatSlugs: string[];
};

export type EventMatchProfile = {
  event: {
    id: string;
    title: string;
    startsAt: string | null;
    formatSlug: string;
    formatName?: string;
  };
  format: {
    slug: string;
    name: string;
    matchingInstructions?: string | null;
  };
  participants: Array<{
    id: string;
    fullName: string;
    company?: string | null;
    position?: string | null;
    city?: string | null;
    age?: number | null;
    gender?: string | null;
    status?: string;
    participantKind?: string;
    businessContext?: string[];
  }>;
};

export type EventMatchResult = {
  activeParticipants: Array<{
    id: string;
    fullName: string;
    score?: number | null;
    rationale?: string | null;
    profile?: unknown;
  }>;
  rationale: string;
};

type MatchingClientOptions = {
  endpoint: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
};

const matchResultSchema = z.object({
  score: z.number().min(0).max(1),
  activeParticipantIds: z.array(z.string()).default([]),
  rationale: z.string().default(""),
  suggestedFormatSlugs: z.array(z.string()).default([]),
});

const eventMatchResultSchema = z.object({
  activeParticipants: z
    .array(
      z.object({
        id: z.string(),
        fullName: z.string(),
        score: z.number().min(0).max(1).nullish(),
        rationale: z.string().nullish(),
        profile: z.unknown().optional(),
      })
    )
    .default([]),
  rationale: z.string().default(""),
});

export async function requestParticipantMatch(
  options: MatchingClientOptions,
  profile: MatchProfile
): Promise<MatchResult> {
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(options.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ profile }),
  });

  if (!response.ok) {
    throw new Error(
      `Matching API failed with ${response.status} ${response.statusText}`
    );
  }

  return matchResultSchema.parse(await response.json());
}

export async function requestEventMatch(
  options: MatchingClientOptions,
  profile: EventMatchProfile
): Promise<EventMatchResult> {
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(options.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event: profile.event,
      format: profile.format,
      participants: profile.participants,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Matching API failed with ${response.status} ${response.statusText}`
    );
  }

  const result = eventMatchResultSchema.parse(await response.json());
  return {
    activeParticipants: result.activeParticipants.map((participant) => ({
      ...participant,
      score: participant.score ?? null,
      rationale: participant.rationale ?? null,
      profile: participant.profile ?? null,
    })),
    rationale: result.rationale,
  };
}
