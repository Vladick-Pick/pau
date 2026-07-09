# Plan 004: Add Matching Observability, Settings Coherence, And Feedback Loops

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If any STOP condition occurs, stop and report instead of improvising.
> When done, update `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5c4137f..HEAD -- prisma/schema.prisma src/lib/pau/types.ts src/lib/pau/dashboard.ts src/components/pau-console.tsx src/lib/matching src/lib/pau/format-drafts.ts tests`
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

Operators need to know whether a suggested order is trustworthy. Today the app
stores useful evidence in JSON payloads, but the UI and structured audit do not
show source freshness, semantic degraded state, excluded candidates, operator
outcomes, or settings hashes. Without that, a failed LLM call, stale Profile
data, incomplete readiness markup, or repeated use of the same active
participant can look like a normal result.

## Current State

`EventMatchRun` is JSON-heavy:

```prisma
// prisma/schema.prisma:200-210
model EventMatchRun {
  id                     String   @id @default(cuid())
  eventId                String
  event                  Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  activeParticipantIds   String[] @default([])
  activeParticipantCount Int      @default(0)
  rationale              String?
  requestPayload         Json?
  responsePayload        Json?
  error                  String?
  createdAt              DateTime @default(now())
}
```

`latestMatch` exposes only count, rationale, and date:

```ts
// src/lib/pau/types.ts:134-138
latestMatch: {
  activeParticipantCount: number;
  rationale: string | null;
  createdAt: string;
} | null;
```

Semantic fallback is stored in local audit but not surfaced:

```ts
// src/lib/pau/dashboard.ts:1129-1137
} catch (error) {
  return {
    result: deterministic,
    semantic: {
      status: "failed",
      model,
      error: error instanceof Error ? error.message : "Unknown error",
    },
  };
}
```

Profile freshness exists but is dropped before matching:

```prisma
// prisma/schema.prisma:295-296
profileUpdatedAt DateTime?
syncedAt      DateTime  @updatedAt
```

```ts
// src/lib/pau/dashboard.ts:1048-1062
function mapMemberForMatching(input: {
  member: MemberProfileForMatching;
  readiness: ActiveMatchCandidate["readiness"];
}): ActiveMatchCandidate {
  return {
    profileId: input.member.profileId,
    displayName: input.member.displayName,
    stateCode: input.member.stateCode,
    readiness: input.readiness,
    dossier: normalizeActiveDossier(input.member.dossier),
    formatVisits: input.member.formatVisits.map((visit) => ({
      formatSlug: visit.formatSlug,
      attendedAt: visit.attendedAt.toISOString(),
    })),
  };
}
```

UI still names the old interface:

```tsx
// src/components/pau-console.tsx:2162-2165
<IntegrationBadge label="PostgreSQL" ready={integrations.database} />
<IntegrationBadge label="Bitrix24" ready={integrations.bitrix} />
<IntegrationBadge label="Matching API" ready={integrations.matching} />
<IntegrationBadge label="OpenRouter" ready={integrations.openrouter} />
```

Outcome data already exists:

```ts
// src/lib/pau/dashboard.ts:1513-1527
data: {
  activeDecision: input.decision,
  activeDecisionComment:
    input.decision === "DECLINED_BY_US" ? comment : null,
  attendanceMarked: input.decision === "INVITED_ATTENDED",
  status: activeDecisionStatus(input.decision),
  statusUpdatedAt: new Date(),
},
// ...
if (input.decision === "INVITED_ATTENDED") {
  await upsertFormatVisitForActiveDecision(participant);
}
```

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Event tests | `CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts tests/pau-dashboard-attendance.test.ts` | exit 0 |
| Format settings tests | `CI=true corepack pnpm exec vitest run tests/pau-format-drafts.test.ts tests/matching-settings.test.ts` | exit 0 |
| Typecheck | `CI=true corepack pnpm typecheck` | exit 0 |
| Full suite | `CI=true corepack pnpm test` | exit 0 |

## Subagent Assignment

- **Primary executor**: `backend`; add a `frontend` subtask only for visible
  operator controls.
- **Owned files**: audit/schema/types/mapping/settings/UI/tests listed in
  Scope.
- **Expected output**: structured audit/degraded state, settings coherence,
  feedback data path, UI wording/control changes if scoped, and review notes in
  `plans/README.md`.
- **Do not touch**: Profile API sync, external credentials, deployment scripts,
  or the core event-composition selector except for audit fields.
- **Coordination rule**: if schema changes are needed, keep them minimal and
  document migration risk before editing Prisma schema.

## Required Review Loop

After implementation and focused tests, run the global loop from
`plans/README.md`:

1. `reviewer` with `code-reviewer`: must check audit correctness, privacy,
   route/type compatibility, UI state mapping, and missing tests.
2. `architect` with `improve-codebase-architecture`: must check that
   observability and feedback are behind stable interfaces and do not leak raw
   JSON parsing into UI callers.
3. `ponytail-review`: must check for unnecessary schema columns, settings,
   dashboards, or controls. It must not remove degraded-state visibility,
   source freshness, or required audit evidence.
4. Fix review findings, rerun verification, then repeat all three reviews once.

## Scope

**In scope**:

- `prisma/schema.prisma` if structured audit columns are added;
- `src/lib/pau/types.ts`;
- `src/lib/pau/dashboard.ts` or the new matching-run module from Plan 003;
- `src/lib/matching/*`;
- `src/lib/pau/format-drafts.ts`;
- `src/components/pau-console.tsx`;
- related tests.

**Out of scope**:

- Building a full analytics dashboard.
- Syncing new external Profile API fields.
- Automatically changing invite buffer based on history before enough outcome
  data exists.

## Steps

### Step 1: Define Structured Audit Fields

Either add columns to `EventMatchRun` or add a typed audit object that is
validated before writing JSON. Prefer columns for fields that the UI or ops will
query:

- `status`: `SUCCESS`, `FAILED`, `DEGRADED`;
- `startedAt`, `finishedAt`;
- `actorRole` or `actorUserId` if available from route auth;
- `settingsHash`;
- `inputHash`;
- `sourceFreshness`: newest/oldest `profileUpdatedAt`, newest/oldest `syncedAt`,
  stale count;
- `semanticStatus`: `applied`, `failed`, `skipped_no_key`, `skipped_empty`,
  `shadow`;
- `semanticModel`;
- selected count, excluded count, covered potential count, uncovered potential
  count.

If columns are deferred, the JSON shape must still be typed and tested.

**Verify**:
`CI=true corepack pnpm typecheck` exits 0.

### Step 2: Pass Source Freshness Through Matching Input

Include `profileUpdatedAt` and `syncedAt` in active candidate snapshots. Compute
freshness summary during the run.

Policy:

- stale profiles should not silently block matching;
- stale data should mark the run as degraded or add a visible warning;
- the stale threshold should be a matching setting, defaulting to a conservative
  value such as 30 days, but disabled if there is not enough product confidence.

**Verify**:
Add tests where old `syncedAt` produces a freshness warning/audit field without
dropping the candidate.

### Step 3: Surface Semantic Degraded State In `latestMatch`

Extend `PauEvent.latestMatch` with:

- `semanticStatus`;
- `semanticModel`;
- `degradedReason` or sanitized `error`;
- `sourceFreshness` summary;
- selected/excluded/covered/uncovered counts.

Update `mapEvent`/snapshot mapping so the event page can show degraded matching
without parsing raw JSON.

**Verify**:
Add tests for mapping an `EventMatchRun` response payload with
`semantic.status: "failed"` into `latestMatch.semanticStatus === "failed"`.

### Step 4: Add Operator Outcome Feedback Fields

Use existing `activeDecision`, `activeDecisionComment`, `attendanceMarked`, and
`FormatVisit` as the first feedback loop.

Add a structured reason taxonomy for operator decisions if product scope allows:

- not relevant by business;
- wrong role;
- overloaded/recently invited;
- manually pinned;
- manually excluded;
- no data / needs research;
- declined by active;
- attended.

The taxonomy can start in matching audit JSON or a small enum. Do not block this
plan on a complex UI; storing structured reasons is enough for future learning.

**Verify**:
Existing active-decision tests still pass; add one test proving a structured
reason is persisted when available.

### Step 5: Add Operator Controls To The Event Matching Surface

Add controls only if the current UI can absorb them without broad redesign:

- pin selected active participant;
- exclude selected active participant with a reason;
- show excluded candidates;
- compare previous run to current run;
- show matched potential(s), confidence, evidence fields, and risks.

Use existing shadcn/ui components from `src/components/ui`. Do not introduce new
visual libraries.

**Verify**:
At minimum, add component or reducer tests if existing test patterns cover this
UI. If no UI test pattern exists, document manual verification steps and run
`CI=true corepack pnpm lint` and `typecheck`.

### Step 6: Rename Integration Wording

Change user-facing `Matching API` wording to match the actual architecture:

- "Profile matching" or Russian equivalent;
- OpenRouter remains separate;
- README should describe local profile matching plus optional semantic rerank.

Do not revive remote matching settings unless Plan 003 found a production
dependency.

**Verify**:
`rg -n "Matching API|MATCHING_API_ENDPOINT|MATCHING_API_KEY" README.md src/components src/lib`
shows no stale user-facing wording except explicit legacy notes.

### Step 7: Build Quality Evaluation Output

Extend dry-run output and/or add a small report script for historical events:

- event id/title/date;
- included/excluded potentials by status;
- selected active order;
- matched/covered potentials;
- uncovered confirmed potentials;
- score/confidence bands;
- readiness distribution;
- cooldown exclusions;
- semantic status;
- operator override rate if historical decisions exist;
- selected-active concentration across events.

This does not need to render a dashboard. A deterministic JSON report is enough.

**Verify**:
`CI=true corepack pnpm exec tsx scripts/dry-run-profile-matching.ts <snapshot.json>`
returns valid JSON with evaluation fields.

## Test Plan

Add or update tests for:

- audit metadata shape;
- degraded semantic status mapping;
- source freshness warning;
- preserving nested matching settings;
- operator outcome persistence;
- no stale `Matching API` user-facing label;
- dry-run evaluation output.

## Done Criteria

- [ ] Latest match state exposes semantic status and degraded state.
- [ ] Matching audit has structured status, settings hash/input hash or typed
  equivalent, source freshness, selected/excluded/covered counts.
- [ ] Profile freshness is included in matching snapshots and audit.
- [ ] Operator decisions can feed cooldown/reliability in future runs.
- [ ] UI wording no longer claims the primary matcher is an external Matching
  API.
- [ ] Dry-run output can be used to review quality across recent guest events.
- [ ] `CI=true corepack pnpm test`, `typecheck`, and `lint` pass.
- [ ] `CI=true corepack pnpm build` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] Two rounds of `reviewer`, `architect`, and `ponytail-review` are complete
  with no unresolved blockers.

## Quality Criteria

- Operators can tell whether a match run is normal, degraded, or failed without
  reading raw JSON.
- Audit fields are structured enough for future queries; raw JSON remains
  evidence, not the only interface.
- Feedback data can later affect cooldown and reliability without changing
  historical meaning.
- UI controls are limited to actions needed by the operator: pin, exclude with
  reason, compare run, inspect evidence.
- Ponytail review should cut speculative dashboards or unused settings; it
  should preserve the minimal audit trail needed to debug matching quality.

## STOP Conditions

Stop and report if:

- Adding structured `EventMatchRun` fields requires a migration strategy that
  cannot be safely applied with current Prisma setup.
- Route auth does not expose a stable actor identity and adding one would touch
  the auth system broadly.
- UI operator controls require a redesign of the event screen rather than a
  contained addition.

## Maintenance Notes

After this plan, every matching run should answer four operational questions:
what data was used, what constraints were applied, why each active was selected
or excluded, and whether the result is degraded. Future scoring changes should
add audit fields before changing the UI.
