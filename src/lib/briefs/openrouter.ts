import { z } from "zod";

export type BriefType = "POTENTIAL" | "ACTIVE" | "MODERATOR";

export type BriefInput = {
  briefType: BriefType;
  prompt?: string;
  participant: {
    fullName: string;
    status: "POTENTIAL" | "ACTIVE";
    company?: string | null;
    position?: string | null;
    city?: string | null;
    age?: number | null;
    gender?: string | null;
    businessMain?: string | null;
    businessExtra1?: string | null;
    businessExtra2?: string | null;
    businessExtra3?: string | null;
    enrichment?: unknown;
  };
  format?: {
    name: string;
    description: string;
  } | null;
  match?: {
    score: number;
    rationale: string;
    activeParticipantIds: string[];
    suggestedFormatSlugs: string[];
  } | null;
  attendanceHistory: Array<{
    formatName?: string;
    formatSlug?: string;
    attendedAt: string;
  }>;
};

export type GeneratedBrief = {
  summary: string;
  talkingPoints: string[];
  risks: string[];
  nextSteps: string[];
};

type OpenRouterOptions = {
  apiKey: string;
  appTitle: string;
  model: string;
  input: BriefInput;
  fetchImpl?: typeof fetch;
};

const generatedBriefSchema = z.object({
  summary: z.string(),
  talkingPoints: z.array(z.string()),
  risks: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

const openRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    })
  ),
});

const briefJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    talkingPoints: {
      type: "array",
      items: { type: "string" },
    },
    risks: {
      type: "array",
      items: { type: "string" },
    },
    nextSteps: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary", "talkingPoints", "risks", "nextSteps"],
  additionalProperties: false,
} as const;

export async function generateBriefWithOpenRouter(
  options: OpenRouterOptions
): Promise<GeneratedBrief> {
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": options.appTitle,
      },
      body: JSON.stringify({
        model: options.model,
        messages: buildBriefMessages(options.input),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pau_brief",
            strict: true,
            schema: briefJsonSchema,
          },
        },
        stream: false,
        temperature: 0.2,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `OpenRouter API failed with ${response.status} ${response.statusText}`
    );
  }

  const payload = openRouterResponseSchema.parse(await response.json());
  const content = payload.choices[0]?.message.content;
  if (!content) {
    throw new Error("OpenRouter API returned an empty brief response");
  }

  return generatedBriefSchema.parse(JSON.parse(content));
}

function buildBriefMessages(input: BriefInput) {
  return [
    {
      role: "system" as const,
      content:
        "Ты готовишь краткие операционные брифы для программы активных участников. Пиши по-русски, конкретно, без маркетинговой воды.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: input.briefType,
        prompt: input.prompt,
        participant: input.participant,
        format: input.format,
        match: input.match,
        attendanceHistory: input.attendanceHistory,
      }),
    },
  ];
}
