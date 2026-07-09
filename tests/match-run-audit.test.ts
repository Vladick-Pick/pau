import { describe, expect, it } from "vitest";

import { summarizeLatestMatch } from "../src/lib/matching/match-run-audit";

describe("match run audit", () => {
  it("maps degraded semantic state and freshness counts into latest match summary", () => {
    const summary = summarizeLatestMatch({
      activeParticipantCount: 3,
      createdAt: new Date("2026-07-08T10:00:00.000Z"),
      responsePayload: {
        rationale: "Подобрано 3 активных участника.",
        audit: {
          version: 1,
          status: "DEGRADED",
          startedAt: "2026-07-08T09:59:30.000Z",
          finishedAt: "2026-07-08T10:00:00.000Z",
          actorRole: "MANAGER",
          actorUserName: "operator",
          settingsHash: "settings-hash",
          inputHash: "input-hash",
          semanticStatus: "failed",
          semanticModel: "openai/gpt-5-mini",
          semanticSkippedPairCount: 0,
          degradedReason: "semantic_rerank_failed",
          degradedReasons: ["semantic_rerank_failed"],
          error: "OpenRouter timeout",
          selectedCount: 3,
          excludedCount: 5,
          coveredPotentialCount: 2,
          uncoveredPotentialCount: 1,
          excludedReasonCounts: {
            recent_format_visit: 5,
          },
          sourceFreshness: {
            enabled: true,
            staleAfterDays: 30,
            staleCount: 2,
            newestProfileUpdatedAt: "2026-07-07T09:00:00.000Z",
            oldestProfileUpdatedAt: "2026-05-01T09:00:00.000Z",
            newestSyncedAt: "2026-07-08T08:00:00.000Z",
            oldestSyncedAt: "2026-05-20T08:00:00.000Z",
          },
          operatorFeedback: {
            totalActiveCount: 4,
            decidedCount: 2,
            invitedAttendedCount: 1,
            invitedRefusedCount: 1,
            declinedByUsCount: 0,
          },
          operatorFeedbackRecords: [
            {
              eventParticipantId: "active-1",
              matchingProfileId: "profile-1",
              matchedPotentialId: "potential-1",
              pairId: "profile-1::potential-1",
              activeDecision: "INVITED_ATTENDED",
              activeDecisionComment: "позвали",
              statusUpdatedAt: "2026-07-08T09:00:00.000Z",
            },
          ],
        },
      },
    });

    expect(summary).toEqual({
      activeParticipantCount: 3,
      rationale: "Подобрано 3 активных участника.",
      createdAt: "2026-07-08T10:00:00.000Z",
      status: "DEGRADED",
      semanticStatus: "failed",
      semanticModel: "openai/gpt-5-mini",
      degradedReason: "semantic_rerank_failed",
      sourceFreshness: {
        enabled: true,
        staleAfterDays: 30,
        staleCount: 2,
        newestProfileUpdatedAt: "2026-07-07T09:00:00.000Z",
        oldestProfileUpdatedAt: "2026-05-01T09:00:00.000Z",
        newestSyncedAt: "2026-07-08T08:00:00.000Z",
        oldestSyncedAt: "2026-05-20T08:00:00.000Z",
      },
      counts: {
        selected: 3,
        excluded: 5,
        coveredPotentials: 2,
        uncoveredPotentials: 1,
      },
    });
  });
});
