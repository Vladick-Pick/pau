# Plan 003: Deepen The Matching Run Module And Retire Legacy Seams

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If any STOP condition occurs, stop and report instead of improvising.
> When done, update `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5c4137f..HEAD -- src/lib/pau/dashboard.ts src/lib/matching 'src/app/api/events/[eventId]/match/route.ts' tests/pau-dashboard-event-match.test.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-safe-matching-reruns.md, plans/002-event-composition-matching-methodology.md
- **Category**: tech-debt
- **Planned at**: commit `5c4137f`, 2026-07-08

## Why This Matters

`src/lib/matching/profile-matching.ts` is becoming a useful deep module for
ranking and selection, but `src/lib/pau/dashboard.ts` owns too much of the
matching run: event loading, input mapping, scoring, semantic rerank, audit,
stale cleanup, participant writes, and error logging. That makes matching hard
to test and easy to break while touching unrelated dashboard code. The seam
should be an application-level matching-run module with a small interface.

## Current State

`runEventMatch` currently starts in `src/lib/pau/dashboard.ts`:

```ts
// src/lib/pau/dashboard.ts:753
export async function runEventMatch(eventId: string) {
```

It calls profile matching and semantic rerank, then writes audit and
participants:

```ts
// src/lib/pau/dashboard.ts:799-813
const deterministic = matchProfiles({
  ...matchingInput.input,
  limit: semanticCandidateLimit,
});
const { result: matchedProfiles, semantic } = await maybeApplySemanticRerank(
  matchingInput.input,
  deterministic
);
const result = buildEventMatchResult({
  clubId: matchingInput.clubId,
  profileResult: matchedProfiles,
  matchingInput: matchingInput.input,
  semantic,
  activeParticipantLimit,
});
```

The API route depends directly on `dashboard.ts`:

```ts
// src/app/api/events/[eventId]/match/route.ts:1-16
import { requireApiRole } from "@/lib/api/auth";
import { runEventMatch } from "@/lib/pau/dashboard";
// ...
const match = await runEventMatch(eventId);
```

Legacy matching-client types remain:

```ts
// src/lib/matching/client.ts:50-59
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
```

`README.md` still describes a remote matching service:

```md
// README.md:38
`MATCHING_API_ENDPOINT` и `MATCHING_API_KEY` задают внешний сервис matching.
```

CRG signal on this branch: 14 changed files, 84 changed functions/classes, 61
test gaps, overall risk score `0.60`. Hub nodes include `PauConsole` and
`FormatsView`; keep matching orchestration away from those UI hubs.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Event matching tests | `CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts` | exit 0 |
| Matching tests | `CI=true corepack pnpm exec vitest run tests/profile-matching.test.ts tests/semantic-rerank.test.ts` | exit 0 |
| Typecheck | `CI=true corepack pnpm typecheck` | exit 0 |
| Full suite | `CI=true corepack pnpm test` | exit 0 |

## Subagent Assignment

- **Primary executor**: `refactorer` or `architect`.
- **Owned files**: the matching-run module, route import, matching legacy seams,
  README wording, and tests named in Scope.
- **Expected output**: extracted module with unchanged behavior, deleted or
  quarantined legacy seam, passing tests, and review notes in
  `plans/README.md`.
- **Do not touch**: UI event layout, event-composition scoring details beyond
  preserving Plan 002's public interface, or production deploy scripts.
- **Coordination rule**: this is a behavior-preserving module move unless Plan
  002 has already changed the matching interface; do not mix new methodology
  work into this refactor.

## Required Review Loop

After implementation and focused tests, run the global loop from
`plans/README.md`:

1. `reviewer` with `code-reviewer`: must check route behavior, import drift,
   error handling, test coverage, and no accidental response-shape changes.
2. `architect` with `improve-codebase-architecture`: must check module
   interface depth, seam placement, adapter separation, locality, and deletion
   test.
3. `ponytail-review`: must check for pass-through modules, one-use interfaces,
   speculative adapters, and legacy code that can be deleted.
4. Fix review findings, rerun verification, then repeat all three reviews once.

## Scope

**In scope**:

- create `src/lib/pau/event-matching-run.ts`;
- update `src/lib/pau/dashboard.ts`;
- update `src/app/api/events/[eventId]/match/route.ts`;
- update `src/lib/matching/*` imports and legacy exports if needed;
- update README integration wording;
- update event matching tests.

**Out of scope**:

- Changing the visual design of the event screen.
- Adding new operator controls. That is Plan 004.
- Reintroducing remote `MATCHING_API_ENDPOINT` behavior unless a current
  product requirement demands it.

## Target Module Shape

Use the architecture vocabulary:

- **Module**: `src/lib/pau/event-matching-run.ts`.
- **Interface**: `runEventMatching({ eventId, actor })`.
- **Implementation**: event fetch, profile matching input mapping, semantic
  adapter call, transaction, audit persistence, participant stale handling.
- **Adapters**:
  - profile matcher adapter from `src/lib/matching/profile-matching.ts`;
  - semantic adapter from `src/lib/matching/semantic-rerank.ts`;
  - Prisma persistence through `@/lib/db`.

`dashboard.ts` should call the module or re-export it temporarily, but it should
not contain the implementation.

## Steps

### Step 1: Extract Matching Run Without Behavior Change

Move matching-run implementation from `dashboard.ts` into
`src/lib/pau/event-matching-run.ts`.

Keep public behavior identical after Plans 001 and 002:

- same API route response shape;
- same tests passing;
- same error behavior.

`dashboard.ts` may re-export `runEventMatch` during migration:

```ts
export { runEventMatching as runEventMatch } from "@/lib/pau/event-matching-run";
```

Use this only as a compatibility bridge. The route should import the new module
directly in the final state.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts`
passes.

### Step 2: Keep Pure Matching Separate From Persistence

Make sure `src/lib/matching/profile-matching.ts` does not import Prisma,
dashboard types, or UI types. It should accept plain inputs and return plain
results. The event matching run module should translate Prisma rows to those
inputs.

**Verify**:
`rg -n "prisma|@/lib/db|pau-console|EventParticipant" src/lib/matching` should
return no matches except type names that are intentionally local to matching.

### Step 3: Retire Or Quarantine Legacy Event Matching Client

Search for `requestEventMatch`, `buildLocalEventMatchResult`,
`MATCHING_API_ENDPOINT`, and `EventMatchResult`.

If no current code path needs remote matching:

- move legacy remote/local event matching behind a clearly named legacy module;
  or delete it if tests and README no longer reference it;
- update `README.md` to describe current matching as local profile matching
  plus optional OpenRouter semantic rerank;
- keep `OPENROUTER_MATCHING_MODEL` documented if it exists.

If some path still uses the old client, document it as legacy and keep it out of
the new event-matching-run interface.

**Verify**:
`rg -n "MATCHING_API_ENDPOINT|MATCHING_API_KEY|requestEventMatch|buildLocalEventMatchResult" README.md src tests`
has either no matches or only explicit legacy documentation.

### Step 4: Make Settings Adapter The Single Interface

Move matching-settings parse/serialize/run-plan helpers behind one interface in
`src/lib/matching/matching-settings.ts` or a nearby module:

- `parseMatchingSettings`;
- `matchingSettingsToDraft`;
- `draftToMatchingRules`;
- `buildMatchingRunPlan`.

Remove duplicated default/coercion logic from `format-drafts.ts`,
`dashboard.ts`, and `dry-run-profile-matching.ts` where practical.

**Verify**:
`rg -n "DEFAULT_ACTIVE_TARGET_COUNT|DEFAULT_ACTIVE_BUFFER_COUNT|recentVisitExclusion|activeInvitePlan" src/lib/pau src/components scripts`
shows callers using the shared adapter rather than duplicating coercion.

### Step 5: Update Tests To Target The New Module

Move or add tests so the matching-run module is tested directly. The API route
test should only prove auth and route wiring; composition and persistence tests
belong around `event-matching-run.ts`.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts`
passes after imports are updated.

## Test Plan

- Existing event matching tests should continue to pass.
- Add focused tests for the new module interface if route/dashboard tests are
  too broad.
- Keep pure matcher tests independent from Prisma mocks.

## Done Criteria

- [ ] `runEventMatch` implementation no longer lives in `dashboard.ts`.
- [ ] API route imports the matching-run module directly or through a short
  compatibility export.
- [ ] Pure matching module has no Prisma/UI dependencies.
- [ ] Legacy remote/local matching path is deleted or clearly quarantined.
- [ ] README no longer claims event matching depends on `MATCHING_API_ENDPOINT`
  as the primary path.
- [ ] Settings defaults/coercion have one implementation.
- [ ] `CI=true corepack pnpm test`, `typecheck`, and `lint` pass.
- [ ] `CI=true corepack pnpm build` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] Two rounds of `reviewer`, `architect`, and `ponytail-review` are complete
  with no unresolved blockers.

## Quality Criteria

- `dashboard.ts` no longer owns matching-run implementation details.
- The new module interface is smaller than its implementation and hides Prisma,
  semantic adapter, audit, and stale-handling complexity from callers.
- Pure matching modules do not import Prisma, UI, or route code.
- Legacy remote/local matching code is deleted when unused, or isolated under a
  clearly named legacy seam.
- Ponytail review should remove pass-through layers; it should not collapse the
  pure matcher, semantic adapter, and run orchestration back into one module.

## STOP Conditions

Stop and report if:

- Moving `runEventMatch` creates circular imports that cannot be resolved
  without broad dashboard refactoring.
- Legacy `MATCHING_API_ENDPOINT` is still required by production deployment.
- Settings extraction requires changing the format PATCH API shape.

## Maintenance Notes

The new seam should make future matching methodology changes local. Reviewers
should reject future changes that put scoring, semantic adapter behavior, audit
payload construction, and Prisma participant mutation back into `dashboard.ts`.
