import { z } from "zod";

import { toOpenRouterTitleHeader } from "@/lib/openrouter/headers";

export type SemanticRerankInput = {
  event: {
    title: string;
    formatName: string;
  };
  formatDescription: string;
  potentials: Array<{
    id: string;
    businessContext: string[];
    requestContext: string[];
  }>;
  pairs: Array<{
    pairId: string;
    activeProfileId: string;
    potentialId: string;
    displayName: string | null;
    baseScore: number;
    businessContext: string[];
    usefulnessContext: string[];
    potentialContext: string[];
    evidenceFields: string[];
    risks: string[];
  }>;
};

export type SemanticRerankResult = {
  matches: Array<{
    pairId: string;
    activeProfileId: string;
    potentialId: string;
    semanticScore: number;
    reason: string;
    introTopic: string;
    risks: string[];
    evidenceFields: string[];
  }>;
};

export type SemanticRerankOptions = {
  apiKey: string;
  appTitle: string;
  model: string;
  input: SemanticRerankInput;
  fetchImpl?: typeof fetch;
};

const openRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    })
  ),
});

const semanticRerankSchema = z.object({
  matches: z.array(
    z.object({
      pairId: z.string(),
      activeProfileId: z.string(),
      potentialId: z.string(),
      semanticScore: z.number().min(0).max(1),
      reason: z.string(),
      introTopic: z.string(),
      risks: z.array(z.string()),
      evidenceFields: z.array(z.string()),
    })
  ),
});

const semanticRerankJsonSchema = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pairId: { type: "string" },
          activeProfileId: { type: "string" },
          potentialId: { type: "string" },
          semanticScore: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
          introTopic: { type: "string" },
          risks: { type: "array", items: { type: "string" } },
          evidenceFields: { type: "array", items: { type: "string" } },
        },
        required: [
          "pairId",
          "activeProfileId",
          "potentialId",
          "semanticScore",
          "reason",
          "introTopic",
          "risks",
          "evidenceFields",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
} as const;

export async function requestSemanticRerank(
  options: SemanticRerankOptions
): Promise<SemanticRerankResult> {
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": toOpenRouterTitleHeader(options.appTitle),
      },
      body: JSON.stringify({
        model: options.model,
        messages: buildSemanticRerankMessages(options.input),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pau_semantic_match_rerank",
            strict: true,
            schema: semanticRerankJsonSchema,
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
    throw new Error("OpenRouter API returned an empty matching response");
  }

  return semanticRerankSchema.parse(JSON.parse(content));
}

function buildSemanticRerankMessages(input: SemanticRerankInput) {
  return [
    {
      role: "system" as const,
      content:
        "Ты оцениваешь пары activeProfileId x potentialId для подбора ПАУ. Код уже применил жесткие запреты, статусы гостей и readiness policy. Верни ровно один объект matches для каждой пары input.pairs: слабые пары не пропускай, а оценивай низким semanticScore. Оцени только переданные поля, не выдумывай факты, верни source-backed reasons по pairId.",
    },
    {
      role: "user" as const,
      content: JSON.stringify(input),
    },
  ];
}
