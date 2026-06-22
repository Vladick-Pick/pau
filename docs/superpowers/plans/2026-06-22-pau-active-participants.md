# ПАУ «Активные участники» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a multi-subsystem effort split into Phases 1–5; each phase produces working, testable software on its own. Phase 1 is fully bite-sized; Phases 2–4 are concrete task lists to be expanded into their own detailed plans when reached.

**Goal:** Build the club-scoped «Активные участники» page: pull real member data from the Profile API, decide who is an «активный участник» via **per-club editable rules**, let managers manage roles and per-format readiness, and show a rich human profile + history.

**Architecture:** Profile API is a read-only external source (`src/lib/profile/*`, mirroring the existing `src/lib/bitrix/*` client+mapping pattern). A pure **fact-derivation layer** maps the messy Profile model into typed ПАУ facts. A pure **rules engine** evaluates per-club rule sets against those facts. Everything ПАУ *owns* (per-club rules, roles, per-format readiness, manager notes) lives in our Prisma DB. Profile facts are **synced once a day** into our DB (the page reads our DB, not the live API), never owned; `retention`/`доходимость` are modelled as nullable now and back-filled when the API learns to return them. The page is a new **club/workspace-scoped** view, distinct from the existing event-scoped console.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma v6, Zod v4, Vitest, Tailwind v4 + shadcn/ui (oklch tokens in `src/app/globals.css`). Visual spec: `demos/participants-tab-redesign.html`.

---

## 0. Grounding (verified facts, not assumptions)

### 0.1 Profile API (real, probed 2026-06-22)
- Base URL `https://profile.communitytech.group`; auth `Authorization: Bearer <PROFILE_API_TOKEN>`; versioned `/api/v1` (breaking → `/api/v2`). Token is a secret → env only, never commit/log.
- **Workspaces == clubs:** `ws_cf1` Club First One (~400 profiles), `ws_cff` Club First Future (~3100, mostly empty). Member pool is small (~25 / ~31 with state «Участник»).
- Endpoints: `GET /api/v1/workspaces`, `GET /api/v1/profiles?workspace_id&q&bitrix_id&category&state&limit&cursor` (cursor pagination), `GET /api/v1/profiles/{id}`, `GET /api/v1/profiles/{id}/business-events?event_type&category&date_from&date_to&limit&cursor`.
- Real status taxonomy (`contact_statuses[].state_code` / category): `active`/«Участник», `potential`/«Потенциал», `churn`/«Отток», «Партнёр», «Community», «Заморозка». **Active-participant pool = state `active`.**
- Profile `profile` sections present: `identity, emails, phones, contact_statuses, demographics, locations, native_locations, education, hobbies, social_profiles, contact_channels, business, business_experience, community, membership, crm, profile_text, requests_resources, documents, surveys, flags, media, network`.
- Data-quality gotchas: dates sometimes non-strict ISO (`"2026-06-22 09:45:09"`, no `T`/zone); `business.companies[].revenue` often `"0"`; ws_cff mostly empty; model changes ~daily.

### 0.2 Fact → source mapping (from a real member profile)
| ПАУ fact | Source in `profile` / events | Availability |
| --- | --- | --- |
| Стаж (year) | `community.attendance.forums[].membership_year` (max); fallback earliest `membership.deals[].begin_at` | available |
| Платёжный год (phase) | current `membership.deals[].begin_at/close_at` + `crm.lifecycle_events` (`next_renewal`, `membership_ends`) | computed |
| Доходимость (%) | `community.attendance.forums[]` + events `community.forum_attended`; **no "invited" count** | **gap — derive proxy or wait for materialized fact; may be `null`** |
| Расчётный retention (%) | none explicit; `membership.deals` (begin/close/closed), `membership.payment`, `crm.next_renewal` | **gap — `null` until materialized; rule reports «нужны факты»** |
| Масштаб бизнеса (matching only) | `business.companies[].revenue/employee_count/industries`, `business_experience[].position` | available, dirty |
| Клубная роль | ПАУ-owned (амбассадор/лидер); profile only hints in `profile_text` | ПАУ-side |
| Dossier | `profile_text.{can_be_useful,club_goals,company_role}`, `requests_resources.interests`, `hobbies`, `business_experience`, `education`, `demographics.age`, `locations`, telegram in `contact_channels`/`social_profiles` | available |
| История участия | events `community.forum_attended` / `community.event_attended` | available |
| История мэтчинга | ПАУ-side (not in Profile API) | ПАУ-side |

### 0.3 Existing codebase (verified, follow these patterns)
- Client+mapping pattern: `src/lib/bitrix/client.ts` (class), `src/lib/bitrix/mapping.ts`. Mirror for `src/lib/profile/`.
- Env helpers: `getOptionalEnv`, `getRequiredEnv`, `getCsvEnv` in `src/lib/env.ts`.
- Domain types: `src/lib/pau/types.ts` (`PauEventParticipant`, `PauFormat`, `ActiveParticipantDecision` enum = INVITED_ATTENDED|INVITED_REFUSED|DECLINED_BY_US — this is invite-outcome, NOT the rules-driven «активный» concept being built here).
- Prisma `prisma/schema.prisma`: models `Participant` (status POTENTIAL|ACTIVE), `EventParticipant` (kind, matchedScore, activeDecision, activeDecisionComment, attendanceMarked), `PauFormat` (matchingRules: Json). **No Club/workspace, no rules engine, no per-format readiness, no roles** — all new here.
- Routes under `src/app/api/*`, Zod-validated, MANAGER-gated (see `src/app/api/events/[eventId]/participants/[participantId]/route.ts`).
- Tests: Vitest in `tests/*.test.ts`.
- UI: `src/components/pau-console.tsx` (`ParticipantsTable` ~1124–1219, `ActiveDecisionControl` ~1221–1329). New page is club-scoped, built fresh from the prototype.

---

## 1. Architectural decisions

- **D1 — Profile API is read-only & isolated.** All shape-specific parsing lives in `src/lib/profile/mapping.ts`. The rest of the app consumes our typed `ProfileFacts`/`ProfileDossier`, never raw API JSON. A v2 bump touches only `mapping.ts` + a version constant.
- **D2 — Club = Profile workspace.** New `Club` Prisma model with `id` = workspace_id (`"ws_cf1"`). All ПАУ-owned config is keyed by `clubId`.
- **D3 — Rules are per-club, typed, editable, data-driven.** `ActiveRule` rows per club. Evaluation is a pure function of (rules, facts). Editing rules recomputes verdicts; nothing is a stored boolean label.
- **D4 — Profile facts are synced daily into our DB, not fetched live.** A daily job materializes club members + derived facts into a `MemberProfile` store; the page/API read our DB (fast, resilient to API flakiness and the 3100-profile volume). ПАУ never writes facts back. `retention`/`attendance` are modelled as nullable columns now and back-filled once the API returns them.
- **D5 — Missing facts are first-class.** Retention/доходимость may be `null`. A rule over a missing fact yields `missing` (→ «нужны факты»), never a silent pass/fail.
- **D6 — Масштаб is NOT an active-rule.** It is matching metadata, surfaced in the dossier only. Default club rule sets exclude it.
- **D7 — New page, not a retrofit of the event console.** Lives at a new route; the existing event-scoped console is untouched in Phases 1–4.
- **D8 — Formats are system-wide.** Formats belong to the whole ПАУ program (existing `PauFormat`), not per-club. Readiness is a per-`(profileId, formatId)` markup (участвует или нет); a participant may be «не готов» to all formats.

---

## 2. Data model (new Prisma models)

Add to `prisma/schema.prisma` (alongside existing models; do not modify existing ones in Phase 2 except to add relations if needed):

```prisma
model Club {
  id        String   @id            // = Profile workspace_id, e.g. "ws_cf1"
  name      String
  createdAt DateTime @default(now())
  rules            ActiveRule[]
  roles            ActiveRole[]
  formatReadiness  FormatReadiness[]
  notes            ParticipantNote[]
  members          MemberProfile[]
}

model MemberProfile {              // daily-synced read model from Profile API
  id            String    @id @default(cuid())
  clubId        String
  club          Club      @relation(fields: [clubId], references: [id], onDelete: Cascade)
  profileId     String    // Profile API person_id
  displayName   String?
  stateCode     String?   // "active" | "potential" | "churn" | ...
  // typed facts (modelled now; retention/attendance back-filled when API provides them)
  tenureYear    Int?
  paymentPhase  String?   // "start" | "mid" | "end"
  businessBand  Int?
  retention     Int?      // %, nullable until API materializes
  attendance    Int?      // %, nullable until API materializes
  dossier       Json      // ProfileDossier
  participation Json      // ParticipationEvent[] snapshot from community.* events
  profileUpdatedAt DateTime?
  syncedAt      DateTime  @updatedAt
  @@unique([clubId, profileId])
}

enum ActiveRuleType { MIN_YEAR MIN_PERCENT PHASE MIN_BAND HAS_ROLE }

model ActiveRule {
  id          String         @id @default(cuid())
  clubId      String
  club        Club           @relation(fields: [clubId], references: [id], onDelete: Cascade)
  key         String         // "tenure" | "retention" | "attendance" | "payment" | "activity" | custom
  label       String
  description String?
  type        ActiveRuleType
  factKey     String?        // which ProfileFacts key it reads
  config      Json           // {"min":70} | {"pass":["mid"]} | {"minBand":2} | {}
  enabled     Boolean        @default(true)
  optional    Boolean        @default(false) // "усиливающее, необязательное"
  sortOrder   Int            @default(0)
  @@unique([clubId, key])
}

model ActiveRole {
  id          String                 @id @default(cuid())
  clubId      String
  club        Club                   @relation(fields: [clubId], references: [id], onDelete: Cascade)
  name        String
  description String?
  assignments ActiveRoleAssignment[]
  @@unique([clubId, name])
}

model ActiveRoleAssignment {
  id        String     @id @default(cuid())
  roleId    String
  role      ActiveRole @relation(fields: [roleId], references: [id], onDelete: Cascade)
  profileId String     // Profile API person_id
  @@unique([roleId, profileId])
}

enum ReadinessState { READY NOT_READY UNMARKED }

model FormatReadiness {
  id        String         @id @default(cuid())
  clubId    String
  club      Club           @relation(fields: [clubId], references: [id], onDelete: Cascade)
  profileId String         // Profile API person_id
  formatId  String         // PauFormat.id
  readiness ReadinessState @default(UNMARKED)
  updatedAt DateTime       @updatedAt
  @@unique([profileId, formatId])
}

model ParticipantNote {
  id        String   @id @default(cuid())
  clubId    String
  club      Club     @relation(fields: [clubId], references: [id], onDelete: Cascade)
  profileId String   @unique
  note      String
  updatedAt DateTime @updatedAt
}
```

**Default rule seed (per club), matching the validated model:**
`tenure` (MIN_YEAR, min 2), `retention` (MIN_PERCENT, factKey `retention`, min 70), `attendance` (MIN_PERCENT, factKey `attendance`, min 70), `payment` (PHASE, config `{"pass":["mid"]}`), `activity` (HAS_ROLE, `enabled:false`, `optional:true`). No `business` rule (D6).

---

## 3. Derived facts contract (`src/lib/profile/facts.ts`)

```typescript
export type FactPhase = "start" | "mid" | "end";
export interface ProfileFacts {
  tenureYear: number | null;
  retention: number | null;            // %, null = not materialized
  attendance: number | null;           // %, null = not materialized
  paymentPhase: FactPhase | null;
  businessBand: number | null;         // 1..4, matching metadata only
}
export interface ProfileDossier {
  company: string | null; revenue: string | null; industry: string | null;
  position: string | null; city: string | null; age: number | null;
  interests: string | null; canBeUseful: string | null; clubGoals: string | null;
  telegram: string | null;
}
export interface ParticipationEvent { date: string; title: string; detail: string; }
```
Each derivation is a pure function over the (tolerantly parsed) `PublicProfile` + `BusinessEvent[]`, returning `null` when the source is absent. The real Цимбалюк profile is used as a test fixture (`tests/fixtures/profile-cf1-member.json`).

`retention` and `attendance` derivation returns `null` today (no API source — confirmed with user). They are persisted as nullable `MemberProfile` columns by the daily sync (Phase 3) and will populate automatically once the API exposes them, with no schema change.

---

## 4. API surface (Next.js routes, Phases 3–4)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/profile/sync` | Trigger daily sync (Phase 3); secret/MANAGER-gated; also `pnpm db:sync-profiles` |
| GET | `/api/clubs` | List clubs (proxy Profile `/workspaces`, upsert `Club`) |
| GET | `/api/clubs/[clubId]/active-participants` | Member list **from synced `MemberProfile` store** + verdict + readiness summary + roles |
| GET | `/api/clubs/[clubId]/participants/[profileId]` | Full dossier + facts + verdict + participation + readiness + roles + note (from store) |
| GET/PUT | `/api/clubs/[clubId]/rules` | Read / upsert per-club rule set |
| GET/POST/DELETE | `/api/clubs/[clubId]/roles` (+ `/[roleId]`, `/assignments`) | Roles CRUD + assign/unassign |
| PUT | `/api/clubs/[clubId]/participants/[profileId]/readiness` | Set per-format readiness (formats are system-wide) |
| PUT | `/api/clubs/[clubId]/participants/[profileId]/note` | Save manager note |

All mutations Zod-validated + MANAGER-gated (follow existing route pattern). Read routes return the envelope `{ data, meta }` and serve from the synced store, not the live Profile API.

---

## 5. Versioning & data-quality strategy
- Pin `PROFILE_API_VERSION = "v1"` constant; `client.ts` builds `/api/${version}/...`.
- Tolerant parsing in `mapping.ts`: a `parseLooseDate()` accepting both ISO and `"YYYY-MM-DD HH:MM:SS"`; never throw on unknown fields; treat absent sections as empty.
- Zod schemas use `.passthrough()` / `.optional()` generously; validation failures degrade to `null` facts + a logged warning, not a 500.
- Cache member-list + profile responses (in-memory TTL, e.g. 5 min) keyed by `(workspace, query)`; retry transient 5xx/timeout with backoff (3 attempts).
- A single `PROFILE_API_BASE_URL` env (default the real host) so staging/v2 can be swapped without code change.

---

## PHASE 1 — Profile API client + fact derivation (bite-sized, TDD)

**Goal:** A typed, tolerant, tested `src/lib/profile/` module that lists workspaces, searches members, fetches a profile + events, and derives `ProfileFacts`/`ProfileDossier`. Pure logic, no DB, no UI.

**Files:**
- Create: `src/lib/profile/types.ts`, `src/lib/profile/client.ts`, `src/lib/profile/mapping.ts`, `src/lib/profile/facts.ts`, `src/lib/profile/index.ts`
- Test: `tests/profile-client.test.ts`, `tests/profile-mapping.test.ts`, `tests/profile-facts.test.ts`
- Fixture: `tests/fixtures/profile-cf1-member.json` (trimmed real Цимбалюк profile), `tests/fixtures/profile-business-events.json`
- Env: document `PROFILE_API_BASE_URL`, `PROFILE_API_TOKEN` in `.env.example`

### Task 1: Types + loose date parser
- [ ] **Step 1 — failing test** (`tests/profile-mapping.test.ts`):
```typescript
import { describe, it, expect } from "vitest";
import { parseLooseDate } from "@/lib/profile/mapping";
describe("parseLooseDate", () => {
  it("parses non-ISO 'YYYY-MM-DD HH:MM:SS'", () => {
    expect(parseLooseDate("2026-06-22 09:45:09")?.getUTCFullYear()).toBe(2026);
  });
  it("parses ISO with offset", () => {
    expect(parseLooseDate("2026-12-17T03:00:00+03:00")?.getUTCFullYear()).toBe(2026);
  });
  it("returns null for empty/garbage", () => {
    expect(parseLooseDate(null)).toBeNull();
    expect(parseLooseDate("not a date")).toBeNull();
  });
});
```
- [ ] **Step 2 — run, expect FAIL** `pnpm test profile-mapping` → "parseLooseDate is not a function".
- [ ] **Step 3 — implement** in `src/lib/profile/mapping.ts`:
```typescript
export function parseLooseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}
```
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** `feat(profile): loose date parser`.
- [ ] **Step 6** — add public types to `src/lib/profile/types.ts` (envelopes, `Workspace`, `ProfileSearchItem`, `PublicProfile` as `Record<string, unknown>`-friendly partial, `BusinessEvent`, `ProfileFacts`, `ProfileDossier`, `ParticipationEvent`). Commit `feat(profile): public types`.

### Task 2: ProfileApiClient (workspaces, search, get, events, pagination, retry)
- [ ] **Step 1 — failing test** (`tests/profile-client.test.ts`) using a stubbed `fetch` (inject via constructor `{ fetchImpl }`):
```typescript
import { describe, it, expect, vi } from "vitest";
import { ProfileApiClient } from "@/lib/profile/client";
function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}
describe("ProfileApiClient.listWorkspaces", () => {
  it("sends Bearer token and returns data[]", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ api_version: "v1", data: [{ id: "ws_cf1", name: "Club First One", status: "active" }] }));
    const client = new ProfileApiClient({ baseUrl: "https://x", token: "t", fetchImpl });
    const ws = await client.listWorkspaces();
    expect(ws[0].id).toBe("ws_cf1");
    const [, init] = fetchImpl.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer t" });
  });
});
describe("ProfileApiClient error mapping", () => {
  it("throws ProfileApiError with code on 401", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ api_version: "v1", error: { code: "unauthorized", message: "Authentication required" } }, false, 401));
    const client = new ProfileApiClient({ baseUrl: "https://x", token: "t", fetchImpl });
    await expect(client.listWorkspaces()).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });
});
```
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** `src/lib/profile/client.ts`: `ProfileApiClient` with `baseUrl`/`token`/`fetchImpl`/`version="v1"`; private `request(path, params)` that builds the URL, sets `Authorization`/`Accept`, parses the envelope, throws `ProfileApiError {code,status,message}` on `!ok`, retries (3×, backoff) on network error / 5xx; public `listWorkspaces()`, `searchProfiles(params)`, `getProfile(id)`, `listBusinessEvents(id, params)`; an async generator `paginate(path, params)` that follows `pagination.next_cursor`.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — pagination test:** stub two pages (first returns `next_cursor:"c2"`, second `null`); assert `collectProfiles()` concatenates both and stops. Implement, run, PASS.
- [ ] **Step 6 — factory** `createProfileClientFromEnv()` using `getOptionalEnv("PROFILE_API_BASE_URL", "https://profile.communitytech.group")` + `getRequiredEnv("PROFILE_API_TOKEN")`. Commit `feat(profile): API client with pagination + retry`.

### Task 3: Derive `tenureYear` + `paymentPhase`
- [ ] **Step 1 — failing test** (`tests/profile-facts.test.ts`) loading the fixture:
```typescript
import profile from "./fixtures/profile-cf1-member.json";
import { deriveFacts } from "@/lib/profile/facts";
it("derives tenure from membership_year", () => {
  expect(deriveFacts(profile.profile, []).tenureYear).toBeGreaterThanOrEqual(2);
});
it("derives paymentPhase from membership window + next_renewal", () => {
  expect(["start","mid","end"]).toContain(deriveFacts(profile.profile, []).paymentPhase);
});
```
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** `deriveFacts(profile, events)` covering `tenureYear` (max `community.attendance.forums[].membership_year`, fallback years since earliest `membership.deals[].begin_at`) and `paymentPhase` (position of "now" between current deal `begin_at`/`close_at`, fallback via `crm.lifecycle_events.next_renewal`). Use `parseLooseDate`. "now" injected as a param `deriveFacts(profile, events, { now })` for deterministic tests.
- [ ] **Step 4 — run, expect PASS. Commit** `feat(profile): tenure + payment phase`.

### Task 4: Derive `attendance`, `retention` (gap-aware), `businessBand`
- [ ] **Step 1 — failing tests:** `attendance` returns a number in 0..100 when forum attendances exist, else `null`; `retention` returns `null` (no source today) — assert `null` explicitly so the gap is locked by a test; `businessBand` maps `business.companies[].employee_count`/`revenue` → 1..4 or `null`.
- [ ] **Step 2 — run FAIL → Step 3 implement → Step 4 PASS.** Implement `attendance` as a documented proxy (e.g. attended forums in last 12 membership months over expected cadence) clearly commented as provisional until materialized. Commit `feat(profile): attendance proxy, retention gap, business band`.

### Task 5: Derive `ProfileDossier` + `ParticipationEvent[]`
- [ ] **Step 1 — failing test:** dossier pulls `profile_text.can_be_useful`, `club_goals`, company/position from `business_experience[0]`, city from `locations[0].city.name`, telegram from `social_profiles`/`contact_channels`, age from `demographics.ages[0].age`, interests from `requests_resources.interests[].text`; `deriveParticipation(events)` maps `community.forum_attended` → `{date,title,detail}` sorted desc.
- [ ] **Step 2–4** implement + PASS. **Commit** `feat(profile): dossier + participation timeline`.

### Task 6: Barrel + smoke
- [ ] Export everything from `src/lib/profile/index.ts`; add `pnpm typecheck` step; commit `chore(profile): barrel exports`.

**Phase 1 done when:** `pnpm test profile-*` green, `pnpm typecheck` clean, and a throwaway script (not committed) can list ws_cf1 members and print derived facts for one.

---

## PHASE 2 — Persistence + per-club rules engine (concrete tasks)

**Goal:** DB models + a pure rules engine; default rules seeded per club.

- **2.1** Add models from §2 to `prisma/schema.prisma`; `pnpm prisma:generate` + `pnpm prisma:push`. Test: a migration smoke test that creates a `Club` + `ActiveRule` and reads them back.
- **2.2** `src/lib/pau/active-rules.ts` — pure `evaluateActive(rules: ActiveRule[], facts: ProfileFacts, ctx: { hasRole: boolean }): { passed; failed: RuleResult[]; missing: RuleResult[] }`. One predicate per `ActiveRuleType` (MIN_YEAR, MIN_PERCENT, PHASE, MIN_BAND, HAS_ROLE). TDD: a test per rule type + a missing-fact test (retention null → `missing`). Mirror the validated logic in `demos/participants-tab-redesign.html` (`checkRule`/`evaluate`).
- **2.3** `src/lib/pau/club-config.ts` — `getOrSeedClub(clubId, name)` upserts a `Club` and seeds the default rule set (§2) if none. Test seeding idempotency.
- **2.4** Repos: `src/lib/pau/active-store.ts` — typed Prisma wrappers for rules upsert, roles CRUD + assignment, readiness upsert, note upsert. Tests against a test DB.

**Phase 2 done when:** rules engine tests green; a club can be seeded and its rules edited; readiness/roles/notes persist.

---

## PHASE 3 — Daily profile sync (concrete tasks)

**Goal:** A daily job materializes club members + derived facts from the Profile API into `MemberProfile`, so the page reads our DB. `retention`/`attendance` persist as `null` until the API provides them.

- **3.1** `src/lib/profile/sync.ts` — `syncClub(clubId)`: paginate state=active members → per member `getProfile` + `listBusinessEvents` → `deriveFacts`/`deriveDossier`/`deriveParticipation` → upsert `MemberProfile` (concurrency-limited, e.g. 4). Returns `{ clubId, synced, failed }`. Test with a stubbed Profile client + test DB: assert upsert idempotency and that `retention`/`attendance` persist as `null` while other facts fill. **Reconcile, don't clobber:** sync upserts only the synced facts in `MemberProfile`; ПАУ-owned data (rules, roles, readiness, notes — separate tables keyed by `profileId`) is never touched, so manager markup survives every re-sync. Pool is strictly state `active` («Участник»); Потенциал/Отток are skipped.
- **3.2** `syncAllClubs()` — `listWorkspaces()` → `getOrSeedClub` → `syncClub`. Tolerant: one failing profile does not abort the club (log + count).
- **3.3** `POST /api/profile/sync` — secret/MANAGER-gated route running `syncAllClubs()` (mirror `src/app/api/bitrix/sync-events/route.ts`). Add `pnpm db:sync-profiles` (tsx script) for manual + cron use. Document daily scheduling: system cron or external scheduler hitting the route with a shared secret header.
- **3.4** Expose `MemberProfile.syncedAt`; surface "обновлено N ч назад" later in UI.

**Phase 3 done when:** running the sync populates `MemberProfile` for ws_cf1/ws_cff; re-running is idempotent; `retention`/`attendance` are `null` but tenure/payment/business/dossier/participation are filled.

---

## PHASE 4 — API routes (concrete tasks)

**Goal:** The routes in §4, Zod-validated, MANAGER-gated, returning typed envelopes. **Read routes serve from the synced `MemberProfile` store, not the live API.**

- **4.1** `GET /api/clubs` — list via Profile client (live, tiny), upsert `Club`s, return `{ data }`.
- **4.2** `GET /api/clubs/[clubId]/active-participants` — `src/lib/pau/active-participants.ts`: read `MemberProfile` rows (state=active) for the club → `evaluateActive(clubRules, facts, { hasRole })` → merge readiness + roles → list. Pure over DB; test with a seeded test DB.
- **4.3** `GET /api/clubs/[clubId]/participants/[profileId]` — read `MemberProfile` (facts + dossier + participation) + verdict + readiness + roles + note. (История мэтчинга is ПАУ-side, added later.)
- **4.4** Mutations: `PUT rules`, `roles` POST/DELETE + assignments, `PUT readiness`, `PUT note` — Zod bodies, MANAGER gate (reuse `events/[eventId]/participants/[participantId]/route.ts`), each with a route test.

**Phase 4 done when:** route tests green; the list route for ws_cf1 returns synced members with per-club verdicts.

---

## PHASE 5 — UI (concrete tasks)

**Goal:** The club-scoped page, visually per `demos/participants-tab-redesign.html`, wired to Phase 4 routes, on shadcn/oklch tokens.

- **5.1** Route + shell `src/app/(pau)/active-participants/page.tsx` with a **ClubSwitcher** (workspaces) driving `clubId`; show `syncedAt` ("обновлено N ч назад").
- **5.2** Components (`src/components/active/`): `RulesPanel` (per-club editor; PUT rules → refetch), `RolesPanel` (CRUD/assign), `ActiveParticipantList` (status «Активный/Не активный + причины», human fact-line, format readiness pips), `ParticipantInspector` with tabs **Профиль** (facts with pass/fail vs rules + dossier «О человеке и бизнесе»), **Форматы** (tri-state readiness over the system-wide formats → PUT), **История** (participation + matching). Reuse shadcn `src/components/ui/*`.
- **5.3** Data layer: typed fetch hooks per route; optimistic update on readiness/role/note; skeleton + empty + error states.
- **5.4** Verify in browser preview (light/dark), confirm rule edits recompute the list, readiness persists.

**Phase 5 done when:** the page renders synced ws_cf1/ws_cff members, per-club rules edit live, profile opens with real dossier + history, readiness/roles/notes persist.

---

## 6. Risks / open questions (carry to the user)
- **Retention & доходимость not materialized yet (resolved with user):** modelled as nullable `MemberProfile.retention/attendance`; the daily sync writes them when the API starts returning them. Rules over a null fact report «нужны факты» until then. No action needed now.
- **ws_cff data quality:** ~3100 mostly-empty profiles; we only process state=active (~31). Confirm that pool definition.
- **Formats are system-wide (resolved with user):** shared across the whole ПАУ program; readiness keyed by `(profileId, formatId)`, «участвует или нет».
- **Model churn / versioning:** expect ~daily Profile model changes; §5 isolates impact to `mapping.ts` + version constant.

---

## Self-review notes
- Spec coverage: per-club rules (§2 `ActiveRule.clubId`, D3, Phase 2.2–2.3); all data (Phase 1 facts + dossier + history, §0.2); all APIs (Phase 1 client covers all 4 endpoints, daily sync in Phase 3, Phase 4 exposes them). ✓
- Gaps surfaced explicitly (retention/доходимость) rather than faked. ✓
- Types consistent across phases (`ProfileFacts`, `ActiveRuleType`, `ReadinessState`, `evaluateActive`). ✓
- No `business` active-rule (D6). ✓
