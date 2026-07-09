# Plan 001: Make Matching Reruns Preserve Operator Work And Write Atomically

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If any STOP condition occurs, stop and report instead of improvising.
> When done, update `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5c4137f..HEAD -- src/lib/pau/dashboard.ts src/lib/matching/matching-settings.ts src/lib/pau/format-drafts.ts tests/pau-dashboard-event-match.test.ts tests/matching-settings.test.ts tests/pau-format-drafts.test.ts prisma/schema.prisma`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5c4137f`, 2026-07-08

## Why This Matters

Matching can be run repeatedly while an operator prepares an event. The current
rerun path can delete stale automatic active rows, and `Brief.eventParticipant`
uses `onDelete: Cascade`, so a rerun can remove generated briefs or review work.
The same flow writes an audit row, deletes stale rows, and upserts new rows
without a transaction, so a mid-run failure can leave the event partially
rewritten. Before changing the methodology, reruns must be safe, idempotent,
and non-destructive.

## Current State

- `src/lib/pau/dashboard.ts` contains `runEventMatch`; it fetches the event,
  builds matching input, writes `EventMatchRun`, deletes stale active rows, and
  upserts current active rows in one large function.
- `prisma/schema.prisma` defines `EventParticipant.briefs` and
  `Brief.eventParticipant` with cascade delete.
- `src/lib/matching/matching-settings.ts` computes the recent-visit stop-list
  window.
- `src/lib/pau/format-drafts.ts` serializes UI matching settings back into
  `matchingRules`.

Relevant excerpts:

```ts
// src/lib/pau/dashboard.ts:833-858
await prisma.eventMatchRun.create({
  data: {
    eventId,
    activeParticipantIds: result.activeParticipants.map(
      (participant) => participant.id
    ),
    activeParticipantCount: result.activeParticipants.length,
    rationale: result.rationale,
    requestPayload: { /* ... */ } as Prisma.InputJsonValue,
    responsePayload: { /* ... */ } as Prisma.InputJsonValue,
  },
});
```

```ts
// src/lib/pau/dashboard.ts:860-870
for (const participant of existingActiveParticipants) {
  const profileId = getMatchingProfileId(participant.sourcePayload);
  if (
    profileId &&
    !matchedActiveProfileIds.has(profileId) &&
    !participant.activeDecision
  ) {
    await prisma.eventParticipant.delete({
      where: { id: participant.id },
    });
  }
}
```

```ts
// src/lib/pau/dashboard.ts:875-884
const existing =
  existingActiveByProfileId.get(active.id) ??
  existingActiveByName.get(active.fullName) ??
  (await prisma.eventParticipant.findFirst({
    where: {
      eventId,
      kind: "ACTIVE",
      fullName: active.fullName,
    },
  }));
```

```prisma
// prisma/schema.prisma:162
briefs          Brief[]

// prisma/schema.prisma:219-220
eventParticipantId String?
eventParticipant   EventParticipant? @relation(fields: [eventParticipantId], references: [id], onDelete: Cascade)
```

```ts
// src/lib/matching/matching-settings.ts:73-76
if (settings.mode === "rolling_months") {
  const from = new Date(eventDate);
  from.setUTCMonth(from.getUTCMonth() - Math.max(1, settings.months));
  return { from, to: new Date(eventDate) };
}
```

```ts
// src/lib/pau/format-drafts.ts:225-237
return JSON.stringify(
  {
    ...rules,
    activeInvitePlan: {
      targetCount,
      bufferCount,
    },
    recentVisitExclusion: {
      enabled: settings.matchingRecentVisitMode !== "off",
      mode,
      months,
    },
  },
  null,
  2
);
```

Repo conventions:

- Use `pnpm` scripts from `package.json`.
- Domain tests are Vitest files under `tests/`.
- Prisma client is imported from `@/lib/db`.
- Existing event matching tests live in `tests/pau-dashboard-event-match.test.ts`.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused event-match tests | `CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts` | exit 0 |
| Focused settings tests | `CI=true corepack pnpm exec vitest run tests/matching-settings.test.ts tests/pau-format-drafts.test.ts` | exit 0 |
| Full test suite | `CI=true corepack pnpm test` | exit 0 |
| Typecheck | `CI=true corepack pnpm typecheck` | exit 0 |
| Lint | `CI=true corepack pnpm lint` | exit 0 |

## Subagent Assignment

- **Primary executor**: `debugger` or `backend`.
- **Owned files**: only the files listed in Scope.
- **Expected output**: patch, focused test evidence, full gate evidence, and
  filled review notes in `plans/README.md`.
- **Do not touch**: methodology selection logic beyond what is needed to keep
  reruns safe.
- **Coordination rule**: this branch may contain unrelated dirty implementation
  work; inspect it and do not revert it.

## Required Review Loop

After implementation and focused tests, run the global loop from
`plans/README.md`:

1. `reviewer` with `code-reviewer`: must check data loss, transaction scope,
   stale metadata, identity matching, and regression tests.
2. `architect` with `improve-codebase-architecture`: must check whether the
   fix keeps rerun safety local or spreads matching-run policy deeper into
   `dashboard.ts`.
3. `ponytail-review`: must check for unnecessary abstractions and broad mocks,
   while preserving safety checks, validation, transaction tests, and audit.
4. Fix review findings, rerun verification, then repeat all three reviews once.

## Scope

**In scope**:

- `src/lib/pau/dashboard.ts`
- `src/lib/matching/matching-settings.ts`
- `src/lib/pau/format-drafts.ts`
- `tests/pau-dashboard-event-match.test.ts`
- `tests/matching-settings.test.ts`
- `tests/pau-format-drafts.test.ts`

**Out of scope**:

- Rebuilding the event-composition methodology. That is Plan 002.
- Moving matching orchestration into a new module. That is Plan 003.
- Adding new Prisma columns or migrations unless the existing JSON identity
  cannot be made safe without it. If schema changes become necessary, STOP and
  report.

## Steps

### Step 1: Add Regression Tests For Non-Destructive Reruns

Extend `tests/pau-dashboard-event-match.test.ts` before implementation.

Add tests for these cases:

- stale auto-matched `ACTIVE` with `briefs.length > 0` is not deleted;
- stale auto-matched `ACTIVE` with `attendanceMarked: true` is not deleted;
- stale auto-matched `ACTIVE` with `activeDecision` is preserved and has
  `sourcePayload.matchOrder` cleared or removed;
- repeated matching does not fall back to a `fullName` match when a different
  active participant with that name has no `matchingProfileId`;
- successful match writes audit and participant mutations through a transaction
  mock if the Prisma mock layer supports it.

Update the Prisma mock setup if needed to expose `prisma.$transaction`. Keep the
mock minimal: it can execute callback transactions directly.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts`
should fail before implementation on the new cases.

### Step 2: Replace Hard Deletes With Safe Stale Handling

In `runEventMatch`, classify existing active participants:

- current matched active: profile id exists in the new result;
- stale auto active with no operator artifacts;
- stale active with operator artifacts.

Operator artifacts include at least:

- `activeDecision !== null`;
- non-empty `activeDecisionComment`;
- `attendanceMarked === true`;
- `briefs.length > 0`;
- a linked format visit if it is included later.

For stale active rows with artifacts, do not delete. Update them to remove stale
matching metadata:

- set `matchedScore` to `null`;
- set `matchRationale` to a short stale note or `null`;
- remove `matchOrder` from `sourcePayload`;
- keep `matchingProfileId` only if it is needed for historical traceability;
  otherwise keep it under a clearly stale key.

For stale auto rows without artifacts, deletion is allowed only after this guard
is applied. Prefer soft-stale update over delete if the UI can tolerate it; if
hard delete remains, the tests must prove no artifacts are present.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts`
passes the stale-row tests.

### Step 3: Remove Unsafe Full-Name Upsert Fallback

Change the existing-row lookup for current matches:

- use `matchingProfileId` as the primary identity;
- do not update an arbitrary existing active row by `fullName` when it has no
  matching profile identity;
- if a name fallback is retained, require an exact single `MemberProfile`
  resolution for that name and document the condition in code.

The goal is to avoid overwriting a manually added active participant with the
same display name but a different profile.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts`
passes the identity regression test.

### Step 4: Wrap Audit And Participant Mutations In One Transaction

Keep deterministic scoring and OpenRouter calls outside the transaction. After
`result` is built, wrap these operations in one `prisma.$transaction` callback:

- `eventMatchRun.create` success audit;
- stale participant updates/deletes;
- current participant updates/creates.

If the transaction fails, do not leave a successful audit row. The `catch` block
may write a failure audit after the transaction fails, but it must not mask the
original error.

**Verify**:
Add a test that simulates a failed participant create/update and confirms a
success audit is not written outside the failed transaction. Then run:
`CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts`
and expect exit 0.

### Step 5: Fix Rolling-Month Date Arithmetic

In `src/lib/matching/matching-settings.ts`, replace `Date#setUTCMonth` with a
helper that subtracts months and clamps the day to the last valid day of the
target month.

Add tests:

- event date `2026-03-31T12:00:00.000Z`, one rolling month starts at
  `2026-02-28T12:00:00.000Z`;
- a visit on `2026-02-28` is excluded for that window;
- the existing July 30 two-month test still passes.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/matching-settings.test.ts tests/profile-matching.test.ts`
passes.

### Step 6: Preserve Unknown Nested Matching Rule Keys

In `matchingRulesTextWithSettings`, merge nested objects instead of replacing
them:

- `activeInvitePlan: { ...asRecord(rules.activeInvitePlan), targetCount, bufferCount }`;
- `recentVisitExclusion: { ...asRecord(rules.recentVisitExclusion), enabled, mode, months }`.

Add a test in `tests/pau-format-drafts.test.ts` with unknown nested keys under
both objects and confirm they survive a UI setting update.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/pau-format-drafts.test.ts`
passes.

## Test Plan

New or updated tests:

- `tests/pau-dashboard-event-match.test.ts`: non-destructive stale handling,
  stale order clearing, no unsafe full-name overwrite, transactional write
  behavior.
- `tests/matching-settings.test.ts`: month-end rolling-window clamp.
- `tests/profile-matching.test.ts`: recent-visit exclusion with month-end
  window.
- `tests/pau-format-drafts.test.ts`: preserve unknown nested rule keys.

## Done Criteria

- [ ] Stale active rows with briefs, attendance marks, or manual decisions are
  not hard-deleted by rerun.
- [ ] Preserved stale rows do not keep a live `matchOrder`.
- [ ] Matching success audit and participant mutations are in one transaction.
- [ ] Current matches are not applied to unrelated rows by `fullName` alone.
- [ ] Rolling-month exclusion handles month-end dates.
- [ ] Nested unknown matching-rule keys survive UI setting changes.
- [ ] `CI=true corepack pnpm test` exits 0.
- [ ] `CI=true corepack pnpm typecheck` exits 0.
- [ ] `CI=true corepack pnpm lint` exits 0.
- [ ] `CI=true corepack pnpm build` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] Two rounds of `reviewer`, `architect`, and `ponytail-review` are complete
  with no unresolved blockers.

## Quality Criteria

- Rerun safety is centralized in one place; callers do not need to remember
  artifact-preservation rules.
- Transaction scope includes only DB writes; scoring and OpenRouter calls stay
  outside the transaction.
- `fullName` is never the sole identity for overwriting an existing active row.
- Tests prove both deletion prevention and stale-order cleanup.
- Ponytail review should reduce boilerplate but must not remove the artifact
  guard, transaction, or month-end test.

## STOP Conditions

Stop and report if:

- Prisma mocks cannot support `$transaction` without broad unrelated test
  rewrites.
- Safe identity matching requires a new database column or unique constraint.
- The current event include no longer contains `participant.briefs`, making the
  stale-artifact guard impossible without changing query shape.
- A fix requires changing participant status semantics beyond stale matching
  metadata.

## Maintenance Notes

Reviewers should inspect every rerun path for data loss. Future matching changes
must treat generated briefs, attendance marks, active decisions, and manual
operator comments as user artifacts that survive reruns.
