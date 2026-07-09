# Plan 002: Rebuild Matching As Event Composition, Not A Flat Active Ranking

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If any STOP condition occurs, stop and report instead of improvising.
> When done, update `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5c4137f..HEAD -- src/lib/matching src/lib/pau/dashboard.ts src/lib/pau/active-participants.ts src/lib/pau/active-rules.ts src/lib/pau/active-store.ts tests/profile-matching.test.ts tests/pau-dashboard-event-match.test.ts scripts/dry-run-profile-matching.ts CONTEXT.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/001-safe-matching-reruns.md
- **Category**: direction
- **Planned at**: commit `5c4137f`, 2026-07-08

## Why This Matters

The product task is not "sort active participants by score." For a guest meeting,
the task is to compose a useful set of active participants around the confirmed
potential participants, with coverage, readiness, cooldown, operator controls,
and explainable tradeoffs. The current algorithm scores each active participant
against each potential, keeps only the best potential per active, and then sorts
actives globally. That can produce five people who all fit one guest while
another confirmed guest gets no useful active.

This plan defines the methodology and the implementation shape. It intentionally
does not use retention, payment phase, or tenure year as business-fit fields.
Those facts define whether someone is an active participant; matching itself
uses business profile, business role, request/enrichment fields, format
readiness, participation history, and operator outcomes.

## Current State

Domain vocabulary from `CONTEXT.md`:

- "Активный участник ПАУ" is inferred from club profile quality signals, not a
  bare manual label.
- "Формат ПАУ" defines which kind of active participant is relevant.
- "Готовность к формату" is per format, not a general active status.
- "История участия" records what happened.
- "История мэтчинга" records selection decisions: matched, invited and
  attended, invited and did not attend, or not invited with a comment.

Current flat-ranking algorithm:

```ts
// src/lib/matching/profile-matching.ts:163-181
const matches = candidates
  .flatMap((candidate) =>
    input.potentials.map((potential) =>
      scoreCandidateForPotential(candidate, potential)
    )
  )
  .sort((left, right) => right.baseScore - left.baseScore);

const bestByActive = new Map<string, ProfileMatch>();
for (const match of matches) {
  if (!bestByActive.has(match.activeProfileId)) {
    bestByActive.set(match.activeProfileId, match);
  }
}

return {
  matches: [...bestByActive.values()]
    .sort((left, right) => compareMatchOrder(left, right, "baseScore"))
    .slice(0, input.limit ?? 8),
  excluded,
  settings,
};
```

Current potential input includes every potential participant regardless of
status:

```ts
// src/lib/pau/dashboard.ts:1006-1008
potentials: event.participants
  .filter((participant) => participant.kind === "POTENTIAL")
  .map(mapPotentialForMatching),
```

Current active pool is only `stateCode: "active"`:

```ts
// src/lib/pau/dashboard.ts:971-975
prisma.memberProfile.findMany({
  where: {
    clubId,
    stateCode: "active",
  },
```

Existing active-rule evaluation is available elsewhere:

```ts
// src/lib/pau/active-participants.ts:141-154
const [rules, members, roleMap, readinessMap, formats] = await Promise.all([
  getClubRules(clubId).then(rulesToInputs),
  listMembers(clubId, { stateCode: "active" }),
  roleIdsByProfile(clubId),
  readinessByProfile(clubId),
  listReadinessFormats(),
]);
// ...
const ev = evaluateActive(rules, facts, { hasRole });
```

Current readiness ordering is absolute:

```ts
// src/lib/matching/profile-matching.ts:223-233
function compareMatchOrder(left, right, scoreField) {
  const readinessDelta = readinessRank(right.readiness) - readinessRank(left.readiness);
  if (readinessDelta !== 0) {
    return readinessDelta;
  }
  return right[scoreField] - left[scoreField];
}
```

Current LLM rerank dominates the final score when applied:

```ts
// src/lib/matching/profile-matching.ts:205-206
const semanticScore = clamp(semanticMatch.semanticScore, 0, 1);
const finalScore = roundScore(match.baseScore * 0.45 + semanticScore * 0.55);
```

Current deterministic text matching is token overlap:

```ts
// src/lib/matching/profile-matching.ts:405-422
function textSimilarity(leftTexts, rightTexts): number | null {
  const left = tokens(leftTexts);
  const right = tokens(rightTexts);
  if (left.length === 0 || right.length === 0) {
    return null;
  }
  let matches = 0;
  for (const token of left) {
    if (right.some((candidate) => isTokenMatch(token, candidate))) {
      matches += 1;
    }
  }
  return clamp(matches / Math.min(left.length, right.length), 0, 1);
}
```

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Matching unit tests | `CI=true corepack pnpm exec vitest run tests/profile-matching.test.ts tests/semantic-rerank.test.ts tests/matching-settings.test.ts` | exit 0 |
| Event integration tests | `CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts` | exit 0 |
| Dry run | `CI=true corepack pnpm exec tsx scripts/dry-run-profile-matching.ts <snapshot.json>` | JSON output, exit 0 |
| Full tests | `CI=true corepack pnpm test` | exit 0 |
| Typecheck | `CI=true corepack pnpm typecheck` | exit 0 |

## Subagent Assignment

- **Primary executor**: `architect` for the method and module shape; split to
  `backend` only after the event-composition interface is explicit.
- **Owned files**: matching modules, dashboard adapter code, dry-run script, and
  tests named in Scope.
- **Expected output**: implemented event-composition selector, tests, dry-run
  output example, and review notes in `plans/README.md`.
- **Do not touch**: external Profile API sync, deployment scripts, unrelated UI
  layout, or payment/retention source logic.
- **Coordination rule**: preserve Plan 001 rerun-safety behavior; do not replace
  it while changing the selection methodology.

## Required Review Loop

After implementation and focused tests, run the global loop from
`plans/README.md`:

1. `reviewer` with `code-reviewer`: must check event coverage, status gating,
   cooldown, LLM fallback, regression tests, and data integrity.
2. `architect` with `improve-codebase-architecture`: must check module depth,
   interface size, selector locality, and fit with `CONTEXT.md` terms:
   `Активный участник ПАУ`, `Формат ПАУ`, `Готовность к формату`, `История
   участия`, `История мэтчинга`.
3. `ponytail-review`: must check for speculative optimizers, premature tables,
   unused settings, and unnecessary dependencies. It must not remove required
   hard gates, audit evidence, or tests.
4. Fix review findings, rerun verification, then repeat all three reviews once.

## Scope

**In scope**:

- `src/lib/matching/profile-matching.ts`
- `src/lib/matching/semantic-rerank.ts`
- `src/lib/matching/matching-settings.ts`
- `src/lib/pau/dashboard.ts`
- `src/lib/pau/active-participants.ts`
- `src/lib/pau/active-store.ts`
- `scripts/dry-run-profile-matching.ts`
- `tests/profile-matching.test.ts`
- `tests/semantic-rerank.test.ts`
- `tests/pau-dashboard-event-match.test.ts`

**Out of scope**:

- Syncing new Profile API fields. The user decided to work with existing data.
- Using retention, payment phase, tenure year, or payment history as direct
  business-fit score fields.
- Replacing operator judgment. The matcher produces an auditable suggested
  order, not an automatic invitation.

## Target Methodology

The new matcher should run in these stages:

1. **Potential eligibility**: include confirmed guests first; exclude refused
   and missed participants; optionally include invited/unknown guests with lower
   confidence only if a format setting allows it.
2. **Active eligibility**: start from club active members, then attach active
   rule evaluation, format readiness, source freshness, format visits, and
   previous matching outcomes.
3. **Hard stop-list**: exclude NOT_READY for the format, empty business dossier,
   configured recent same-format visit, and configured recent PAU appearance or
   invitation cooldown.
4. **Pair scoring**: score every eligible `activeProfileId x potentialId` pair.
   Pair output must keep `activeProfileId`, `potentialId`, component scores,
   evidence fields, risks, and confidence.
5. **LLM semantic pass**: use LLM on candidate pairs, not on a pre-collapsed
   active list. The prompt must require source-backed reasons and may not invent
   facts.
6. **Event selection**: choose a set of active participants for the event with
   explicit constraints:
   - target active count from format settings;
   - buffer count from format settings;
   - minimum coverage target per confirmed potential where possible;
   - max selected active participants per potential unless the event has only
     one potential;
   - load/cooldown penalties across all PAU formats;
   - READY candidates before UNMARKED in strict mode;
   - soft readiness mode can allow a high-confidence UNMARKED candidate ahead
     of a weak READY candidate, but must mark the risk.
7. **Operator audit**: persist selected candidates, excluded candidates, pair
   evidence, semantic status, and selection constraints.

## Steps

### Step 1: Define Types For Pair Scores And Event Selection

In `src/lib/matching/profile-matching.ts`, introduce types for:

- `ProfilePairMatch`: one active-to-potential pair;
- `EventCompositionMatch`: selected active participant plus one or more covered
  potential ids;
- `EventCompositionResult`: selected matches, excluded candidates, excluded
  potentials, settings, coverage summary, and audit metadata.

Keep existing exported names only if needed for compatibility; otherwise provide
an adapter until Plan 003 can retire legacy types.

**Verify**:
`CI=true corepack pnpm typecheck` exits 0.

### Step 2: Gate Potentials By Status

Change `buildProfileMatchingInput` in `src/lib/pau/dashboard.ts` so potential
participants carry status into the matching input. Apply default policy:

- include `CONFIRMED` and `ATTENDED`;
- include `INVITED` as lower confidence only if settings allow;
- exclude `REFUSED`, `MISSED`, and clearly non-participating statuses;
- treat `UNKNOWN` as excluded by default unless settings allow.

Add tests with multiple potential participants where a refused potential would
otherwise dominate the match.

**Verify**:
`CI=true corepack pnpm exec vitest run tests/pau-dashboard-event-match.test.ts tests/profile-matching.test.ts`
passes.

### Step 3: Attach Active-Rule Evaluation Without Polluting Business Fit

Reuse `getClubRules`, `roleIdsByProfile`, `rowToFacts`, and `evaluateActive` or
extract a shared helper so matching input includes:

- `activeEvaluation.passed`;
- failed/missing rule keys;
- role presence;
- readiness for the current format.

Use active evaluation as an eligibility/risk signal. Do not add retention,
payment phase, tenure year, or attendance as direct pair-score components.

Default policy:

- exclude active candidates that fail required active rules;
- include candidates with missing optional facts but lower confidence;
- expose missing facts in `risks`.

**Verify**:
Add a unit test where a business-perfect active candidate fails active rules and
is excluded or marked ineligible. Run:
`CI=true corepack pnpm exec vitest run tests/profile-matching.test.ts`.

### Step 4: Replace Best-By-Active Collapse With Pair Matrix

Remove the current `bestByActive` collapse as the primary selection method.
Keep all eligible pair scores until event selection.

Pair score components should include:

- business domain fit;
- business role fit;
- request/enrichment fit;
- business scale band fit;
- personal/context fit;
- format readiness;
- source data confidence.

Keep component scores in the audit. If a component has no data, it should reduce
confidence, not silently look like a weak match.

**Verify**:
Add a test with two potentials where the old algorithm would select candidates
covering only one potential. The new result must include coverage for both
where candidates exist.

### Step 5: Add Event-Level Selector

Implement an event selector over pair scores. Start with a deterministic greedy
selector before considering heavier optimization:

1. sort pairs by readiness tier, final score, confidence, and load penalty;
2. select the best pair for the least-covered confirmed potential;
3. avoid duplicate active participants;
4. continue until `targetCount + bufferCount` or candidate exhaustion;
5. fill remaining slots by global score only after coverage constraints are
   satisfied or impossible.

The selected active order should remain a plain numeric order: `1`, `2`, `3`.
Do not introduce user-facing labels like "top" or "priority".

**Verify**:
Tests must cover:

- multi-guest coverage;
- one-potential event still selects the best active list;
- no duplicate active;
- target + buffer count respected;
- fewer matches returned when eligible pool is smaller than requested.

### Step 6: Add Cooldown Across PAU, Not Only Same Format

Extend candidate history input beyond `formatVisits`:

- same-format attended in configured window remains a hard exclusion;
- recent attended in any PAU format becomes a penalty or configurable exclusion;
- recent selected/invited/refused outcomes from `EventParticipant.activeDecision`
  become cooldown inputs once available in audit.

If historical invitation data is not queryable yet, implement the data contract
and record a TODO in the audit, not in a loose code comment.

**Verify**:
Add tests where the same READY active person would otherwise appear in every
event and is downranked or excluded by cooldown.

### Step 7: Make Readiness Strictness Configurable

Add settings under matching rules:

- `readinessPolicy.mode`: `"strict"` by default, `"soft"` optional;
- strict mode keeps READY before UNMARKED;
- soft mode allows a high-confidence UNMARKED candidate to beat a weak READY
  candidate but marks a readiness risk.

Expose coverage: how many candidate profiles are READY / NOT_READY / UNMARKED
for this format before matching.

**Verify**:
Tests must cover strict and soft modes.

### Step 8: Put LLM In Evidence-Backed Rerank Or Shadow Mode

Change semantic rerank from "active list rerank" to "pair evidence review".

Required behavior:

- deterministic hard exclusions run before LLM;
- LLM receives bounded candidate pairs and source fields;
- LLM returns semantic scores and source-backed reasons per pair;
- unknown ids are ignored;
- final movement is capped in release mode or run in shadow mode until quality
  is calibrated;
- prompt/model/version/status are stored in audit;
- LLM failure falls back to deterministic selection and marks degraded state.

**Verify**:
Tests must cover unknown ids, degraded fallback, movement cap/shadow mode, and
READY/UNMARKED policy preservation.

### Step 9: Calibrate Format Strategy And Buffer

Move fixed weights into a format strategy config, with defaults:

- guest meeting: request fit, trust/reliability, business role, and coverage
  should matter more than exact industry word overlap;
- expert dialogue: expertise/domain match can weigh more;
- other formats can inherit guest defaults until explicitly configured.

Keep `targetCount` and `bufferCount` as manual settings, but add audit fields
for historical conversion later:

- selected count;
- invited count;
- attended count;
- declined/refused count;
- expected arrivals if historical conversion exists.

Do not auto-change buffer count until enough history exists.

**Verify**:
Add tests that different format strategy weights can change pair order without
changing hard exclusions.

### Step 10: Update Dry Run To Evaluate Event Composition Quality

Extend `scripts/dry-run-profile-matching.ts` output:

- potentials included/excluded by status;
- selected active order;
- covered potential ids/names for each selected active;
- uncovered confirmed potentials;
- cooldown exclusions/penalties;
- readiness distribution;
- semantic status;
- score bands and confidence bands.

Run it on the latest guest-meeting snapshots before release.

**Verify**:
`CI=true corepack pnpm exec tsx scripts/dry-run-profile-matching.ts <snapshot.json>`
returns valid JSON with the new fields.

## Test Plan

Add or update tests for:

- multi-potential event coverage;
- refused/missed/unknown potential exclusion;
- active-rule eligibility;
- strict vs soft readiness;
- cooldown across all PAU formats;
- same-format recent-visit hard exclusion;
- LLM shadow/capped movement;
- low-data confidence/risk reporting;
- target + buffer count;
- dry-run output shape.

## Done Criteria

- [ ] Matching output is selected by event composition, not best-by-active
  collapse.
- [ ] Every selected active has one or more covered potential ids in audit.
- [ ] Confirmed potentials are covered where eligible active candidates exist.
- [ ] Refused/missed potentials do not drive active selection.
- [ ] Active-rule evaluation gates or marks active candidates before matching.
- [ ] Retention/payment/tenure facts are not direct business-fit score inputs.
- [ ] Readiness policy is configurable and tested.
- [ ] LLM cannot silently dominate final order without audit and cap/shadow
  behavior.
- [ ] Dry-run output exposes coverage, exclusions, readiness, cooldown, and
  semantic status.
- [ ] `CI=true corepack pnpm test`, `typecheck`, and `lint` pass.
- [ ] `CI=true corepack pnpm build` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] Two rounds of `reviewer`, `architect`, and `ponytail-review` are complete
  with no unresolved blockers.

## Quality Criteria

- Selection optimizes event composition and confirmed-guest coverage before
  filling buffer slots by general score.
- Pair scores keep evidence and risks; missing data lowers confidence instead
  of looking like a weak but certain match.
- LLM only evaluates bounded evidence-backed pairs and cannot silently override
  hard gates or readiness policy.
- The selector remains deterministic under the same input.
- The first implementation is the smallest algorithm that satisfies the tests;
  do not add a complex optimizer until greedy selection fails a named case.
- Dry-run output lets a reviewer inspect recent guest events without opening
  the database manually.

## STOP Conditions

Stop and report if:

- Current database data cannot distinguish confirmed/refused/missed potentials
  reliably enough to gate them.
- Active-rule evaluation cannot be reused without a broad rewrite of active
  participant modules.
- Event composition requires new persistent tables before a working in-memory
  selector can be tested.
- Product requirements contradict the coverage goal, for example if a format is
  intentionally optimized around one named guest.

## Maintenance Notes

This plan turns matching into a product methodology. Future scoring changes
must be reviewed against event-level outcomes: guest coverage, operator
override rate, selected-active concentration, attended rate by score band, and
manual decline reasons.
