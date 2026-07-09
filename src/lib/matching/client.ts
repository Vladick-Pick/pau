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
      `Remote matching service failed with ${response.status} ${response.statusText}`
    );
  }

  return matchResultSchema.parse(await response.json());
}
